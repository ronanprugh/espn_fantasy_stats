"""Authentication: password hashing, cookie sessions and personal API tokens.

Two ways in:

- A browser session: `login` stores the user id in Starlette's signed session
  cookie (SessionMiddleware in main.py, signed with SECRET_KEY).
- A personal API token, sent as `Authorization: Bearer efs_...`. Tokens are
  read-only: they're accepted on GET/HEAD/OPTIONS and refused (403) on
  anything that changes data.

Endpoints pick a dependency: `current_user` (session or token),
`session_user` (session only, for managing tokens), `optional_user`, or
`require_admin`. A 401 always means "no valid credentials"; wrong input
from a signed-in user is a 400, because the frontend signs the user out on 401.
"""

import datetime as dt
import hashlib
import math
import secrets
import threading
import time
from collections import deque

import bcrypt
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from .database import get_db
from .models import ApiToken, User

# Personal API tokens: "efs_" plus 256 random bits. The prefix makes one easy
# to recognise (and to scan for if it ever leaks).
TOKEN_PREFIX = "efs_"
# Tokens only read. Anything that changes data (leagues, passwords, imports,
# tokens themselves) needs a signed-in browser session.
_READ_METHODS = {"GET", "HEAD", "OPTIONS"}


def hash_password(plain: str) -> str:
    """bcrypt hash with a fresh salt. Also used for invite codes."""
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    """Check a password against its bcrypt hash; False for a malformed hash."""
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except (ValueError, TypeError):
        return False


def login(request: Request, user: User) -> None:
    """Start a session for `user` (sets the signed session cookie). The
    session carries the user's session version: bumping it (a password
    change) ends every session started before."""
    request.session["user_id"] = user.id
    request.session["sv"] = user.session_version or 0


def end_other_sessions(request: Request, user: User) -> None:
    """Sign the user out everywhere but here: other sessions' version no
    longer matches. The caller commits."""
    user.session_version = (user.session_version or 0) + 1
    if request.session.get("user_id") == user.id:
        request.session["sv"] = user.session_version


def _signed_in_user(request: Request, db: Session) -> User | None:
    """The session's user, or None (and the session cleared) when there's
    none, or it was ended by a password change since."""
    user_id = request.session.get("user_id")
    if user_id is None:
        return None
    user = db.get(User, user_id)
    if user is None or request.session.get("sv", 0) != (user.session_version or 0):
        request.session.clear()
        return None
    return user


# --- Rate limits ------------------------------------------------------------
#
# Failed sign-ins and signups, counted per key over a sliding window, in
# memory: the backend is one process, and a restart forgetting the counts is
# fine. Over the limit is a 429 saying how long to wait.

ATTEMPT_WINDOW_S = 15 * 60
LOGIN_FAILURES_PER_USERNAME = 10
LOGIN_FAILURES_PER_CLIENT = 30
SIGNUP_FAILURES_PER_CLIENT = 10

_attempts: dict[str, deque[float]] = {}
_attempts_lock = threading.Lock()


def client_key(request: Request) -> str:
    """Who's asking: the first X-Forwarded-For address (Vercel and Render
    put the client there), else the connection's."""
    forwarded = request.headers.get("x-forwarded-for", "")
    first = forwarded.split(",")[0].strip()
    return first or (request.client.host if request.client else "unknown")


def check_attempts(*limits: tuple[str, int]) -> None:
    """Raise 429 if any (key, limit) has had `limit` failures in the window."""
    now = time.monotonic()
    with _attempts_lock:
        for key, limit in limits:
            q = _attempts.get(key)
            if not q:
                continue
            while q and now - q[0] > ATTEMPT_WINDOW_S:
                q.popleft()
            if len(q) >= limit:
                minutes = max(1, math.ceil((ATTEMPT_WINDOW_S - (now - q[0])) / 60))
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=f"Too many attempts. Try again in {minutes} minute{'s' if minutes != 1 else ''}.",
                )


def note_failure(*keys: str) -> None:
    now = time.monotonic()
    with _attempts_lock:
        for key in keys:
            _attempts.setdefault(key, deque()).append(now)


def clear_attempts(key: str) -> None:
    with _attempts_lock:
        _attempts.pop(key, None)


def logout(request: Request) -> None:
    """End the session (clears the session cookie's contents)."""
    request.session.clear()


def new_api_token() -> str:
    """A new random API token. Shown to the user once; only its hash is kept."""
    return TOKEN_PREFIX + secrets.token_urlsafe(32)


def hash_api_token(token: str) -> str:
    """SHA-256 hex digest, the form tokens are stored and looked up in (see
    models.ApiToken for why a fast hash is enough)."""
    return hashlib.sha256(token.encode()).hexdigest()


def _bearer_token(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    scheme, _, value = header.partition(" ")
    return value.strip() if scheme.lower() == "bearer" and value.strip() else None


def _user_from_token(request: Request, db: Session, token: str) -> User:
    if request.method not in _READ_METHODS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="API tokens are read-only; sign in to make changes",
        )
    row = db.query(ApiToken).filter(ApiToken.token_hash == hash_api_token(token)).first()
    if row is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API token")
    row.last_used_at = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
    db.commit()
    return row.user


def current_user(request: Request, db: Session = Depends(get_db)) -> User:
    """Require an authenticated user: a signed-in session, or else a personal
    API token (`Authorization: Bearer efs_…`) on a read-only request.
    Raises 401 otherwise."""
    if request.session.get("user_id") is None:
        token = _bearer_token(request)
        if token is not None:
            return _user_from_token(request, db, token)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    user = _signed_in_user(request, db)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session invalid")
    return user


def session_user(request: Request, db: Session = Depends(get_db)) -> User:
    """Require a signed-in browser session; an API token is not enough. For
    managing tokens, so a token can't list or mint others."""
    user = _signed_in_user(request, db)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user


def optional_user(request: Request, db: Session = Depends(get_db)) -> User | None:
    """Like current_user but returns None if no session, without raising."""
    return _signed_in_user(request, db)


def require_admin(user: User = Depends(current_user)) -> User:
    """Require the current user to have is_admin=True."""
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user
