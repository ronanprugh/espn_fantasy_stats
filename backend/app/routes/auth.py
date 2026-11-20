"""Signing in and out, signing up with an invite code, changing a password,
personal API tokens, and (admins) generating invite codes.
"""


import datetime as dt
import secrets

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from ..auth import (
    LOGIN_FAILURES_PER_CLIENT,
    LOGIN_FAILURES_PER_USERNAME,
    SIGNUP_FAILURES_PER_CLIENT,
    check_attempts,
    clear_attempts,
    client_key,
    current_user,
    end_other_sessions,
    hash_api_token,
    hash_password,
    login,
    logout,
    new_api_token,
    note_failure,
    require_admin,
    session_user,
    verify_password,
)
from ..database import get_db
from ..models import ApiToken, InviteCode, User
from ..schemas import (
    ApiTokenCreated,
    ApiTokenInfo,
    ChangePasswordRequest,
    CreateApiTokenRequest,
    GenerateInviteRequest,
    InviteCodeResponse,
    LoginRequest,
    SignupRequest,
    UserResponse,
)

router = APIRouter()


@router.post("/api/auth/login", response_model=UserResponse)
def auth_login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    """Sign in with a username and password; sets the session cookie. Too
    many failures for a username, or from one client, are refused for a
    while (429)."""
    by_name, by_client = f"login:{payload.username.lower()}", f"login-client:{client_key(request)}"
    check_attempts((by_name, LOGIN_FAILURES_PER_USERNAME), (by_client, LOGIN_FAILURES_PER_CLIENT))
    user = db.query(User).filter(User.username == payload.username).first()
    if not user or not verify_password(payload.password, user.password_hash):
        note_failure(by_name, by_client)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials"
        )
    clear_attempts(by_name)
    login(request, user)
    return UserResponse(id=user.id, username=user.username, is_admin=user.is_admin)


@router.post("/api/auth/logout")
def auth_logout(request: Request):
    """End the current session."""
    logout(request)
    return {"ok": True}


@router.get("/api/auth/me", response_model=UserResponse)
def auth_me(user: User = Depends(current_user)):
    """The signed-in user (from the session or an API token); 401 if none."""
    return UserResponse(id=user.id, username=user.username, is_admin=user.is_admin)


@router.post("/api/auth/signup", response_model=UserResponse)
def auth_signup(payload: SignupRequest, request: Request, db: Session = Depends(get_db)):
    """Create an account with a valid, unexpired invite code (bcrypt-hashed, so
    every live code is checked in turn). Doesn't sign the new user in. Too
    many failed attempts from one client are refused for a while (429): each
    costs a bcrypt check per live code."""
    by_client = f"signup-client:{client_key(request)}"
    check_attempts((by_client, SIGNUP_FAILURES_PER_CLIENT))
    raw = payload.invite_code.strip()
    now = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)
    candidates = (
        db.query(InviteCode)
        .filter(InviteCode.expires_at > now, InviteCode.use_count < InviteCode.max_uses)
        .all()
    )
    matched = next(
        (c for c in candidates if verify_password(raw, c.code_hash)), None
    )
    if not matched:
        note_failure(by_client)
        raise HTTPException(status_code=400, detail="Invalid or expired invite code")
    if db.query(User).filter(User.username == payload.username).first():
        raise HTTPException(status_code=409, detail="Username already taken")
    user = User(username=payload.username, password_hash=hash_password(payload.password))
    db.add(user)
    matched.use_count += 1
    db.commit()
    db.refresh(user)
    return UserResponse(id=user.id, username=user.username, is_admin=user.is_admin)


# Personal API tokens: read-only access for scripts and assistants (see
# auth.current_user). Managed from a signed-in session only.
MAX_API_TOKENS = 10


@router.get("/api/me/tokens", response_model=list[ApiTokenInfo])
def list_api_tokens(user: User = Depends(session_user), db: Session = Depends(get_db)):
    """The user's API tokens, newest first. Never the tokens themselves."""
    return (
        db.query(ApiToken)
        .filter(ApiToken.user_id == user.id)
        .order_by(ApiToken.created_at.desc(), ApiToken.id.desc())
        .all()
    )


@router.post("/api/me/tokens", response_model=ApiTokenCreated, status_code=201)
def create_api_token(
    payload: CreateApiTokenRequest,
    user: User = Depends(session_user),
    db: Session = Depends(get_db),
):
    """Mint a read-only API token. The response is the only time the token is
    shown in full; at most MAX_API_TOKENS per user."""
    count = db.query(ApiToken).filter(ApiToken.user_id == user.id).count()
    if count >= MAX_API_TOKENS:
        raise HTTPException(
            status_code=400,
            detail=f"You can have {MAX_API_TOKENS} tokens at most; revoke one first.",
        )
    token = new_api_token()
    row = ApiToken(
        user_id=user.id,
        name=payload.name.strip() or "API token",
        token_hash=hash_api_token(token),
        prefix=token[:10],
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return ApiTokenCreated(
        id=row.id,
        name=row.name,
        prefix=row.prefix,
        created_at=row.created_at,
        last_used_at=row.last_used_at,
        token=token,
    )


@router.delete("/api/me/tokens/{token_id}")
def revoke_api_token(token_id: int, user: User = Depends(session_user), db: Session = Depends(get_db)):
    """Delete one of the user's API tokens; it stops working immediately."""
    row = db.get(ApiToken, token_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Token not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@router.post("/api/auth/change_password")
def auth_change_password(
    payload: ChangePasswordRequest,
    request: Request,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Change the signed-in user's password, given the current one. Every
    other session of theirs ends; this one carries on."""
    if not verify_password(payload.current_password, user.password_hash):
        # 400, not 401: the session is fine, the input is wrong. The client
        # treats a 401 from a signed-in user as an expired session and signs
        # them out, which a typo in this field shouldn't do.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )
    if payload.current_password == payload.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must differ from the current one",
        )
    user.password_hash = hash_password(payload.new_password)
    end_other_sessions(request, user)
    db.commit()
    return {"ok": True}


_VALID_EXPIRY_HOURS = {1, 6, 12, 24}


@router.post("/api/admin/invite", response_model=InviteCodeResponse)
def admin_generate_invite(
    payload: GenerateInviteRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Admins only: a new invite code, valid for 1, 6, 12 or 24 hours and up to
    `max_uses` sign-ups. Only its hash is stored, so the code is shown once."""
    if payload.expires_in_hours not in _VALID_EXPIRY_HOURS:
        raise HTTPException(status_code=400, detail="expires_in_hours must be 1, 6, 12, or 24")
    raw = secrets.token_urlsafe(32)
    expires_at = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None) + dt.timedelta(hours=payload.expires_in_hours)
    row = InviteCode(
        code_hash=hash_password(raw),
        expires_at=expires_at,
        max_uses=payload.max_uses,
        created_by=admin.id,
    )
    db.add(row)
    db.commit()
    return InviteCodeResponse(code=raw, expires_at=expires_at.isoformat() + "Z")
