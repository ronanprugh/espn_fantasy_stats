import datetime as dt
import hashlib
import secrets

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
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except (ValueError, TypeError):
        return False


def login(request: Request, user: User) -> None:
    request.session["user_id"] = user.id


def logout(request: Request) -> None:
    request.session.clear()


def new_api_token() -> str:
    return TOKEN_PREFIX + secrets.token_urlsafe(32)


def hash_api_token(token: str) -> str:
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
    user_id = request.session.get("user_id")
    if user_id is None:
        token = _bearer_token(request)
        if token is not None:
            return _user_from_token(request, db, token)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    user = db.get(User, user_id)
    if user is None:
        request.session.clear()
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session invalid")
    return user


def session_user(request: Request, db: Session = Depends(get_db)) -> User:
    """Require a signed-in browser session; an API token is not enough. For
    managing tokens, so a token can't list or mint others."""
    user_id = request.session.get("user_id")
    user = db.get(User, user_id) if user_id is not None else None
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    return user


def optional_user(request: Request, db: Session = Depends(get_db)) -> User | None:
    """Like current_user but returns None if no session, without raising."""
    user_id = request.session.get("user_id")
    if user_id is None:
        return None
    return db.get(User, user_id)


def require_admin(user: User = Depends(current_user)) -> User:
    """Require the current user to have is_admin=True."""
    if not user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return user
