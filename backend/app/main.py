"""The FastAPI application: middleware and every HTTP endpoint.

Everything lives under `/api`. Sections, in order:

- Health        `/api/health`, the liveness probe (never touches Postgres)
- Auth          login, logout, signup with an invite code, password change,
                personal API tokens
- Admin         invite codes
- Leagues       the signed-in user's leagues (`/api/me/leagues`)
- League data   `/api/leagues/{league_id}/...`, where `league_id` is the ESPN
                league id; `get_user_league` checks it belongs to the user and
                decrypts its cookies
- Power rankings

Data endpoints share one pattern: read the payload from `cache` when it is
fresh enough (see `_fresh_since`), otherwise fetch from ESPN through
`espn_client`, serialise, store and return. `?refresh=true` skips the cache.
Feature logic lives in its own module (team_hub, rivalries, trades,
power_rankings...) as pure functions; this module loads data and wires it up.

Interactive API docs are served at `/docs` when the backend is running.
"""

from dataclasses import dataclass

from fastapi import Depends, FastAPI, HTTPException, Request, Response, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy.exc import ProgrammingError
from sqlalchemy.orm import Session, selectinload
from starlette.middleware.sessions import SessionMiddleware

from . import cache
from . import power_rankings as pr
from .accolades import accolades as count_accolades
from .season_state import season_over
from .team_hub import career_records, team_schedule
from . import trade_store
from .trades import (
    ACTIVITY_MESSAGE_TYPES,
    activity_from_topic,
    activity_from_transaction,
    moves_from_activity,
    player_position,
    team_fields,
    topic_key,
    topic_player_ids,
    trade_events,
    trades_that_went_through,
    trade_outcomes,
    trades_from_rosters,
    transaction_player_ids,
    trades_from_activity,
)
from .rivalries import is_unplayed, rivalry_summary
from .auth import (
    current_user,
    hash_api_token,
    hash_password,
    login,
    logout,
    new_api_token,
    require_admin,
    session_user,
    verify_password,
)
from .config import ALLOWED_ORIGINS, COOKIE_SAME_SITE, COOKIE_SECURE, SECRET_KEY
from .crypto import decrypt, encrypt
import datetime as dt
import json
import logging
import os
import secrets

import requests
from espn_api.requests.espn_requests import ESPNAccessDenied, ESPNInvalidLeague, ESPNUnknownError
from .database import get_db
from .espn_client import (
    POSITIONS_ORDER,
    ESPN_TIMEOUT,
    ESPNUnavailable,
    LeagueAccess,
    WeekNotPlayedError,
    check_league_access,
    CLOSE_GAME_MARGIN,
    aggregate_by_owner,
    close_game_records,
    build_owner_history,
    compute_positional_week_points,
    discover_years,
    get_league,
    get_scoring_type,
    is_live_season,
    last_refresh_point,
    serialize_all_matchups,
    serialize_box_scores,
    serialize_playoffs,
    serialize_roster,
    serialize_scoreboard,
    serialize_teams,
)
from .models import ApiToken, InviteCode, PowerRankingPost
from .models import League as LeagueModel
from .models import User
from .schemas import (
    ApiTokenCreated,
    ApiTokenInfo,
    ChangePasswordRequest,
    CreateApiTokenRequest,
    CreateLeagueRequest,
    GenerateInviteRequest,
    InviteCodeResponse,
    SignupRequest,
    HeadToHeadStats,
    RivalrySummary,
    AllSeasons,
    CloseGames,
    LeagueAggregate,
    LeagueInfo,
    LeagueOwnerHistory,
    LeagueSummary,
    LoginRequest,
    SeasonPlayoffs,
    LeaguePositionalAggregate,
    SeasonPositionalStats,
    SeasonScoreboard,
    SeasonTeams,
    SeasonTrades,
    SeasonMoves,
    LeagueTrades,
    LeagueMoves,
    TeamHub,
    UpdateLeagueRequest,
    UserResponse,
    WeekBoxScores,
    PowerRankingImport,
    PowerRankingImportResult,
    PowerRankingPost as PowerRankingPostSchema,
    PowerRankings,
)

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
log = logging.getLogger("espn_fantasy_stats")

app = FastAPI(title="espn_fantasy_stats")

# ESPN being down, slow or refusing, as opposed to a bug on our side.
ESPN_FAILURES = (ESPNInvalidLeague, ESPNUnknownError, ESPNUnavailable, requests.RequestException)


def espn_failure(e: Exception, what: str) -> HTTPException:
    """The response for an exception caught while loading ESPN data.

    - An HTTPException raised on purpose inside the `try` passes through.
    - ESPN refusing the league's cookies is a 403 saying so (not 401, which
      the frontend takes as the user's own session expiring).
    - ESPN failing is a 502 with a fixed message, logged as a warning.
    - Anything else is our bug: a 500, logged with its traceback.

    No response carries the exception's text: it can hold hostnames, SQL or
    credentials-adjacent detail, and it's no use to the reader anyway.
    """
    if isinstance(e, HTTPException):
        return e
    if isinstance(e, ESPNAccessDenied):
        log.warning("ESPN refused access (%s): %s", what, e)
        return HTTPException(
            status_code=403,
            detail="ESPN refused access to this league. If it's private, its cookies may have expired: "
            "update them on the Leagues page.",
        )
    if isinstance(e, ESPN_FAILURES):
        log.warning("ESPN failed (%s): %r", what, e)
        return HTTPException(status_code=502, detail="ESPN didn't answer just now. Try again in a minute.")
    log.error("Unexpected error (%s)", what, exc_info=e)
    return HTTPException(status_code=500, detail="Something went wrong on our side.")

app.add_middleware(
    SessionMiddleware,
    secret_key=SECRET_KEY,
    same_site=COOKIE_SAME_SITE,
    https_only=COOKIE_SECURE,
    max_age=60 * 60 * 24 * 30,  # 30 days
)

# Power rankings ship every write-up in one response; text compresses ~4x.
app.add_middleware(GZipMiddleware, minimum_size=1000)

@app.middleware("http")
async def no_sniffing(request: Request, call_next):
    """Browsers must take every response as the type it says it is."""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------- #
# Health
# --------------------------------------------------------------------------- #


@app.get("/api/health")
def health():
    """Liveness probe. Deliberately does not touch Postgres — the keep-warm
    cron hits this every few minutes, and waking Neon that often would burn
    its free compute-hour budget for no benefit."""
    return {"ok": True}


# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #


@app.post("/api/auth/login", response_model=UserResponse)
def auth_login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    """Sign in with a username and password; sets the session cookie."""
    user = db.query(User).filter(User.username == payload.username).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials"
        )
    login(request, user)
    return UserResponse(id=user.id, username=user.username, is_admin=user.is_admin)


@app.post("/api/auth/logout")
def auth_logout(request: Request):
    """End the current session."""
    logout(request)
    return {"ok": True}


@app.get("/api/auth/me", response_model=UserResponse)
def auth_me(user: User = Depends(current_user)):
    """The signed-in user (from the session or an API token); 401 if none."""
    return UserResponse(id=user.id, username=user.username, is_admin=user.is_admin)


@app.post("/api/auth/signup", response_model=UserResponse)
def auth_signup(payload: SignupRequest, db: Session = Depends(get_db)):
    """Create an account with a valid, unexpired invite code (bcrypt-hashed, so
    every live code is checked in turn). Doesn't sign the new user in."""
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


@app.get("/api/me/tokens", response_model=list[ApiTokenInfo])
def list_api_tokens(user: User = Depends(session_user), db: Session = Depends(get_db)):
    """The user's API tokens, newest first. Never the tokens themselves."""
    return (
        db.query(ApiToken)
        .filter(ApiToken.user_id == user.id)
        .order_by(ApiToken.created_at.desc(), ApiToken.id.desc())
        .all()
    )


@app.post("/api/me/tokens", response_model=ApiTokenCreated, status_code=201)
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


@app.delete("/api/me/tokens/{token_id}")
def revoke_api_token(token_id: int, user: User = Depends(session_user), db: Session = Depends(get_db)):
    """Delete one of the user's API tokens; it stops working immediately."""
    row = db.get(ApiToken, token_id)
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Token not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


@app.post("/api/auth/change_password")
def auth_change_password(
    payload: ChangePasswordRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Change the signed-in user's password, given the current one."""
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
    db.commit()
    return {"ok": True}


# --------------------------------------------------------------------------- #
# Admin
# --------------------------------------------------------------------------- #

_VALID_EXPIRY_HOURS = {1, 6, 12, 24}


@app.post("/api/admin/invite", response_model=InviteCodeResponse)
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


# --------------------------------------------------------------------------- #
# League management (per-user)
# --------------------------------------------------------------------------- #


@app.get("/api/me/leagues", response_model=list[LeagueSummary])
def list_my_leagues(user: User = Depends(current_user), db: Session = Depends(get_db)):
    """The leagues the user has added."""
    rows = (
        db.query(LeagueModel)
        .filter(LeagueModel.user_id == user.id)
        .order_by(LeagueModel.id)
        .all()
    )
    return [
        LeagueSummary(
            id=r.id,
            espn_league_id=r.espn_league_id,
            display_name=r.display_name,
            favorite_owner_id=r.favorite_owner_id,
        )
        for r in rows
    ]


def _require_league_access(espn_league_id: int, espn_s2: str | None, swid: str | None) -> dt.datetime:
    """Check with ESPN that these cookies can read the league; the time of the
    check, or an HTTPException saying why not."""
    try:
        access = check_league_access(espn_league_id, espn_s2, swid)
    except Exception:
        raise HTTPException(
            status_code=502,
            detail="Couldn't reach ESPN to check access to this league. Try again in a minute.",
        )
    if access == LeagueAccess.DENIED:
        raise HTTPException(
            status_code=403,
            detail="ESPN didn't let these cookies read this league. For a private league, copy espn_s2 "
            "and SWID from a browser signed in to ESPN as a member of the league.",
        )
    if access == LeagueAccess.NOT_FOUND:
        raise HTTPException(status_code=404, detail="ESPN has no league with that ID in recent seasons.")
    return dt.datetime.now(dt.timezone.utc).replace(tzinfo=None)


@app.post("/api/me/leagues", response_model=LeagueSummary)
def add_my_league(
    payload: CreateLeagueRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Add an ESPN league to the user's account. Cookies are optional (public
    leagues need none) and are encrypted before they are stored. ESPN must
    confirm the cookies can read the league first: its data is cached and
    shared by league id, so a row is what grants access to it."""
    existing = (
        db.query(LeagueModel)
        .filter(
            LeagueModel.user_id == user.id,
            LeagueModel.espn_league_id == payload.espn_league_id,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail="League already added")
    verified_at = _require_league_access(payload.espn_league_id, payload.espn_s2 or None, payload.swid or None)
    row = LeagueModel(
        user_id=user.id,
        espn_league_id=payload.espn_league_id,
        display_name=payload.display_name,
        espn_s2_encrypted=encrypt(payload.espn_s2),
        swid_encrypted=encrypt(payload.swid),
        access_verified_at=verified_at,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return LeagueSummary(
        id=row.id,
        espn_league_id=row.espn_league_id,
        display_name=row.display_name,
        favorite_owner_id=row.favorite_owner_id,
    )


@app.patch("/api/me/leagues/{league_row_id}", response_model=LeagueSummary)
def update_my_league(
    league_row_id: int,
    payload: UpdateLeagueRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Rename a league, replace or clear its cookies (an empty string clears),
    or set or clear the user's own team (`favorite_owner_id`). New cookies
    must pass the same ESPN access check as adding the league."""
    row = (
        db.query(LeagueModel)
        .filter(LeagueModel.id == league_row_id, LeagueModel.user_id == user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="League not found")
    if payload.display_name is not None:
        row.display_name = payload.display_name
    if payload.espn_s2 is not None or payload.swid is not None:
        espn_s2 = payload.espn_s2 if payload.espn_s2 is not None else decrypt(row.espn_s2_encrypted)
        swid = payload.swid if payload.swid is not None else decrypt(row.swid_encrypted)
        row.access_verified_at = _require_league_access(row.espn_league_id, espn_s2 or None, swid or None)
        row.espn_s2_encrypted = encrypt(espn_s2) if espn_s2 else None
        row.swid_encrypted = encrypt(swid) if swid else None
    if payload.clear_favorite:
        row.favorite_owner_id = None
    elif payload.favorite_owner_id is not None:
        row.favorite_owner_id = payload.favorite_owner_id
    db.commit()
    db.refresh(row)
    return LeagueSummary(
        id=row.id,
        espn_league_id=row.espn_league_id,
        display_name=row.display_name,
        favorite_owner_id=row.favorite_owner_id,
    )


@app.delete("/api/me/leagues/{league_row_id}")
def delete_my_league(
    league_row_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
    """Remove a league from the user's account. Its shared cache stays."""
    row = (
        db.query(LeagueModel)
        .filter(LeagueModel.id == league_row_id, LeagueModel.user_id == user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="League not found")
    db.delete(row)
    db.commit()
    return {"ok": True}


# --------------------------------------------------------------------------- #
# Per-league dependency: resolves the user's league row + decrypts creds.
# Path param `league_id` here is the ESPN league_id.
# --------------------------------------------------------------------------- #


@dataclass
class LeagueContext:
    """A league the current user has added, with its ESPN cookies decrypted
    (None for a public league, or one whose cookies no longer decrypt)."""

    espn_league_id: int
    espn_s2: str | None
    swid: str | None
    display_name: str


def get_user_league(
    league_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> LeagueContext:
    """Dependency for every `/api/leagues/{league_id}/...` endpoint: 404s unless
    the current user has added that ESPN league, and 403s unless ESPN has
    confirmed the user's cookies can read it. Leagues added before that check
    existed are checked here, once, on first use."""
    row = (
        db.query(LeagueModel)
        .filter(
            LeagueModel.user_id == user.id,
            LeagueModel.espn_league_id == league_id,
        )
        .first()
    )
    if not row:
        raise HTTPException(
            status_code=404, detail="League not in your account"
        )
    espn_s2, swid = decrypt(row.espn_s2_encrypted), decrypt(row.swid_encrypted)
    if row.access_verified_at is None:
        row.access_verified_at = _require_league_access(row.espn_league_id, espn_s2, swid)
        db.commit()
    return LeagueContext(
        espn_league_id=row.espn_league_id,
        espn_s2=espn_s2,
        swid=swid,
        display_name=row.display_name,
    )


# --------------------------------------------------------------------------- #
# Helpers (cache + ESPN fetch). All take credentials explicitly.
# --------------------------------------------------------------------------- #


def _fresh_since(year: int) -> dt.datetime | None:
    """Oldest acceptable fetch time for a season's cached data: the latest
    refresh point (see REFRESH_POINTS) while it's being played, none once
    it's over."""
    return last_refresh_point() if is_live_season(year) else None


def _get_season_teams(
    league_id: int, year: int, espn_s2: str | None, swid: str | None, refresh: bool = False
) -> dict:
    if not refresh:
        cached = cache.get(league_id, year, cache.TEAMS, fresh_since=_fresh_since(year))
        if cached:
            return cached
    league = get_league(league_id, year, espn_s2=espn_s2, swid=swid)
    payload = {
        "league_id": league_id,
        "year": year,
        "scoring_type": get_scoring_type(league),
        "teams": serialize_teams(league),
    }
    cache.put(league_id, year, cache.TEAMS, payload)
    return payload


def _get_season_matchups(
    league_id: int, year: int, espn_s2: str | None, swid: str | None, refresh: bool = False
) -> list[dict]:
    if not refresh:
        cached = cache.get(league_id, year, cache.MATCHUPS, fresh_since=_fresh_since(year))
        if cached:
            return cached["matchups"]
    league = get_league(league_id, year, espn_s2=espn_s2, swid=swid)
    matchups = serialize_all_matchups(league)
    cache.put(league_id, year, cache.MATCHUPS, {"matchups": matchups})
    return matchups


def _get_season_box_scores(
    league_id: int, year: int, week: int, espn_s2: str | None, swid: str | None,
    refresh: bool = False,
) -> dict:
    """Cached per-week box scores (the same payload the API endpoint serves).

    In a live season only the two most recently completed weeks and later go
    stale. Earlier weeks are final, and refreshing them would turn every
    positional-stats rebuild into one ESPN fetch per week of the season. The
    two most recently completed weeks stay refreshable, so ESPN's stat
    corrections, which land the Tuesday after the games, are picked up.

    Raises WeekNotPlayedError for a week of the live season ESPN hasn't
    reached yet.
    """
    # Before the cache lookup, so box scores cached under a future week's key
    # back when nothing guarded this (they hold the then-current week's data)
    # are never served. They're replaced once that week is actually played.
    if is_live_season(year) and week > get_league(league_id, year, espn_s2, swid).current_week:
        raise WeekNotPlayedError(f"Week {week} of {year} hasn't been played yet.")
    cache_key = cache.box_scores_key(week)
    fresh_since = None
    if is_live_season(year):
        teams = _get_season_teams(league_id, year, espn_s2, swid)["teams"]
        played = max((t["wins"] + t["losses"] + t["ties"] for t in teams), default=0)
        if week >= played - 1:
            fresh_since = last_refresh_point()
    if not refresh:
        cached = cache.get(league_id, year, cache_key, fresh_since=fresh_since)
        if cached:
            return cached
    league = get_league(league_id, year, espn_s2=espn_s2, swid=swid)
    matchups = serialize_box_scores(league, week)
    payload = {
        "league_id": league_id,
        "year": year,
        "week": week,
        "matchups": matchups,
    }
    cache.put(league_id, year, cache_key, payload)
    return payload


# ESPN's activity feed pages 25 at a time; a season of adds and drops can
# run to several hundred.
ACTIVITY_PAGE = 25
ACTIVITY_MAX_PAGES = 200
# Players looked up per player-card request.
PLAYER_CARD_CHUNK = 100


def _communication_page(league, headers: dict) -> dict:
    """One page of the league's activity feed (ESPN's "communication").

    espn_api answers a 404 here with an empty page, which is how ESPN replies
    for many past seasons, so an empty page can mean "not served" as well as
    "nothing happened". And for a season espn_api reads from the leagueHistory
    endpoint, its league_get would append "/communication/" after that
    endpoint's `?seasonId=` query, so the feed is requested from the season's
    own endpoint instead. Anything but a page of topics comes back as {}.
    """
    req = league.espn_request
    params = {"view": "kona_league_communication"}
    endpoint = getattr(req, "LEAGUE_ENDPOINT", "")
    if "/leagueHistory/" in endpoint:
        base = endpoint.split("/leagueHistory/")[0]
        url = f"{base}/seasons/{req.year}/segments/0/leagues/{req.league_id}/communication/"
        r = requests.get(url, params=params, headers=headers, cookies=req.cookies, timeout=ESPN_TIMEOUT)
        data = r.json() if r.status_code == 200 else {}
    else:
        data = req.league_get(extend="/communication/", params=params, headers=headers)
    return data if isinstance(data, dict) else {}


def _fetch_activity_topics(league) -> list[dict]:
    """Every activity topic in the league season, newest first, read straight
    from ESPN (the same request espn_api's recent_activity makes, without its
    per-player lookups). Pages until ESPN returns nothing new: a short page
    isn't taken as the end, since ESPN may cap a page below the size asked."""
    topics: list[dict] = []
    seen: set[str] = set()
    offset = 0
    for _ in range(ACTIVITY_MAX_PAGES):
        filters = {
            "topics": {
                "filterType": {"value": ["ACTIVITY_TRANSACTIONS"]},
                "limit": ACTIVITY_PAGE,
                "limitPerMessageSet": {"value": 25},
                "offset": offset,
                "sortMessageDate": {"sortPriority": 1, "sortAsc": False},
                "sortFor": {"sortPriority": 2, "sortAsc": False},
                "filterIncludeMessageTypeIds": {"value": ACTIVITY_MESSAGE_TYPES},
            }
        }
        data = _communication_page(league, {"x-fantasy-filter": json.dumps(filters)})
        batch = data.get("topics") or []
        fresh = [t for t in batch if topic_key(t) not in seen]
        if not fresh:
            break
        seen.update(topic_key(t) for t in fresh)
        topics.extend(fresh)
        offset += len(batch)
    return topics


def _fetch_transactions(league) -> list[dict]:
    """Every transaction in the season from ESPN's transactions view
    (`mTransactions2`), one request per scoring period, deduplicated by id.
    The fallback for seasons the activity feed doesn't serve."""
    found: dict[str, dict] = {}
    last = getattr(league, "finalScoringPeriod", None) or 18
    for period in range(1, last + 1):
        data = league.espn_request.league_get(
            params={"view": "mTransactions2", "scoringPeriodId": period}
        )
        for tx in (data or {}).get("transactions") or []:
            found.setdefault(str(tx.get("id") or len(found)), tx)
    return sorted(found.values(), key=lambda t: t.get("processDate") or t.get("proposedDate") or 0, reverse=True)


def _has_games(league) -> bool:
    return any((getattr(t, "wins", 0) + getattr(t, "losses", 0) + getattr(t, "ties", 0)) > 0 for t in league.teams)


def _player_directory(league, player_ids: set[int]) -> dict[int, dict]:
    """Name and position for each player, in a request per hundred players
    rather than espn_api's two per player. Falls back to the league's name map
    (names only) for anyone the player cards miss."""
    names = getattr(league, "player_map", {}) or {}
    ids = sorted(player_ids)
    out: dict[int, dict] = {}
    for i in range(0, len(ids), PLAYER_CARD_CHUNK):
        try:
            data = league.espn_request.get_player_card(
                ids[i:i + PLAYER_CARD_CHUNK], getattr(league, "finalScoringPeriod", None) or 18
            )
        except Exception:
            data = {}
        for entry in (data or {}).get("players") or []:
            info = entry.get("player") or entry
            pid = info.get("id", entry.get("id"))
            if isinstance(pid, int):
                out[pid] = {
                    "name": info.get("fullName") or names.get(pid) or f"Player {pid}",
                    "position": player_position(info),
                }
    for pid in ids:
        if pid not in out and isinstance(names.get(pid), str):
            out[pid] = {"name": names[pid], "position": ""}
    return out


ACTIVITY_KEY = cache.ACTIVITY


def _load_season_activity(
    league_id: int, year: int, espn_s2: str | None, swid: str | None, refresh: bool = False
) -> dict:
    """Every transaction in the season (2019 on): trades, waiver claims,
    free-agent pickups and drops, as plain dicts (app/trades.py), in
    `{"activities": [...], "unavailable": bool, "source": ..., "trade_events":
    [...]}`. One fetch serves trades and transactions.

    Read from the activity feed, or for a season the feed doesn't serve, from
    the transactions view. A season with games but nothing from either source
    is `unavailable`: ESPN didn't say, which is not the same as nothing
    happening. That answer is cached only until the next refresh point, so a
    season is never stuck empty; real answers are cached like other ESPN data.
    """
    if not refresh:
        cached = cache.get(league_id, year, ACTIVITY_KEY, fresh_since=_fresh_since(year))
        if cached and cached.get("unavailable"):
            cached = cache.get(league_id, year, ACTIVITY_KEY, fresh_since=last_refresh_point())
        if cached:
            return cached
    league = get_league(league_id, year, espn_s2=espn_s2, swid=swid)
    teams = {t.team_id: team_fields(t) for t in league.teams}
    topics = _fetch_activity_topics(league)
    events: list[dict] = []
    espn_trades = None
    if topics:
        source = "feed"
        players = _player_directory(league, topic_player_ids(topics))
        activities = [activity_from_topic(t, teams.get, players) for t in topics]
    elif _has_games(league):
        # The transactions view keeps a past season's waiver claims, pickups
        # and drops, but of its trades only when they went through: the
        # players are rebuilt from the rosters (_season_trade_results).
        source = "transactions"
        transactions = _fetch_transactions(league)
        players = _player_directory(league, transaction_player_ids(transactions))
        activities = [a for t in transactions if (a := activity_from_transaction(t, teams.get, players))]
        events = trade_events(transactions)
        espn_trades = trades_that_went_through(transactions)
    else:
        source, activities = "none", []
    payload = {
        "activities": activities,
        "unavailable": not activities and _has_games(league),
        "source": source,
        "trade_events": events,
        # For seasons rebuilt from rosters: ESPN's own count, to check against.
        "espn_trade_count": espn_trades,
    }
    cache.put(league_id, year, ACTIVITY_KEY, payload)
    return payload


def _get_season_activity(
    league_id: int, year: int, espn_s2: str | None, swid: str | None, refresh: bool = False
) -> list[dict]:
    """The season's activities alone (see _load_season_activity)."""
    return _load_season_activity(league_id, year, espn_s2, swid, refresh)["activities"]


def _season_trade_results(
    db: Session, ctx: LeagueContext, year: int, refresh: bool = False
) -> list[dict]:
    """The season's trades with their results, from the stored calculation
    (app/trade_store.py) when it's current, else calculated and stored."""
    lid = ctx.espn_league_id
    if not refresh and trade_store.is_current(db, lid, year):
        return trade_store.load(db, lid, [year])
    activity = _load_season_activity(lid, year, ctx.espn_s2, ctx.swid, refresh)
    # From the transactions view, trades are rebuilt from the rosters: that
    # view lists the players of a past trade only to a member who was in it,
    # so the trades it does list are the viewer's own, not the league's. Not with nothing from it at all, though: without its pickups
    # to tell them apart, every waiver claim would look like a trade.
    from_rosters = activity.get("source") == "transactions" and not activity["unavailable"]
    trades = [] if from_rosters else trades_from_activity(activity["activities"], year)
    season_teams = _get_season_teams(lid, year, ctx.espn_s2, ctx.swid)
    # Final once the season is over: its results can't change after that.
    # Not while ESPN's data for it was missing or partial, though: final
    # results are kept for good, so those are recalculated next time instead.
    final = season_over(season_teams) and not activity["unavailable"]
    # Every completed week's box scores: WAR's baselines and the points per
    # game draw on the whole season. The week being played is left out until
    # it's over, so its partial scores don't count as games.
    box_by_week: dict[int, dict] = {}
    if trades or from_rosters:
        weeks = _get_season_scoreboard(lid, year, ctx.espn_s2, ctx.swid)["weeks"]
        current = None
        if is_live_season(year) and not final:
            current = get_league(lid, year, espn_s2=ctx.espn_s2, swid=ctx.swid).current_week
        for week in weeks:
            if current is not None and week >= current:
                break
            try:
                box_by_week[week] = _get_season_box_scores(lid, year, week, ctx.espn_s2, ctx.swid)
            except WeekNotPlayedError:
                break
            except Exception:
                # A week ESPN wouldn't serve: calculate without it for now,
                # and try again after the next refresh point.
                final = False
                continue
    if from_rosters:
        teams = {t["team_id"]: _team_fields(t) for t in season_teams["teams"]}
        # Trades ESPN lists in full (a member's own) stand as listed; the
        # rosters fill in everyone else's.
        known = trades_from_activity(activity["activities"], year)
        trades = trades_from_rosters(
            box_by_week, activity["activities"], activity.get("trade_events", []), teams.get, year, known
        )
    trade_store.save(
        db, lid, year, trade_outcomes(trades, box_by_week), final, activity.get("espn_trade_count")
    )
    return trade_store.load(db, lid, [year])


def _team_fields(team: dict) -> dict:
    """A serialized team (SeasonTeams) as the fields a trade side keeps."""
    owner = team["owners"][0] if team.get("owners") else {}
    return {
        "team_id": team["team_id"],
        "team_name": team["team_name"],
        "owner_id": owner.get("id", ""),
        "owner_name": f"{owner.get('first_name', '')} {owner.get('last_name', '')}".strip() or "—",
    }


def _activity_unavailable(ctx: LeagueContext, year: int) -> bool:
    """Whether ESPN gave nothing for a season that was played (cached)."""
    return _load_season_activity(ctx.espn_league_id, year, ctx.espn_s2, ctx.swid)["unavailable"]


def _transaction_years(ctx: LeagueContext) -> list[int]:
    years = discover_years(ctx.espn_league_id, espn_s2=ctx.espn_s2, swid=ctx.swid)
    return [y for y in years if y >= 2019]


def _compute_positional_stats_for_year(
    league_id: int, year: int, espn_s2: str | None, swid: str | None, refresh: bool = False
) -> dict:
    """Build per-position-per-team stats for one season. Requires year >= 2019.

    "Playoff" stats only count weeks where the team played in the championship
    bracket (round_label in playoff/semifinal/championship). Consolation and
    toilet-bowl weeks count toward total_points/games_played but NOT toward
    playoff_points/playoff_games — same convention as elsewhere in the app.
    """
    if year < 2019:
        raise ValueError("Positional stats require 2019 or later")

    if not refresh:
        cached = cache.get(league_id, year, cache.POSITIONAL_STATS, fresh_since=_fresh_since(year))
        if cached and cached.get("missing_weeks"):
            # Built without a week ESPN wouldn't serve: good only until the
            # next refresh point, then tried again.
            cached = cache.get(league_id, year, cache.POSITIONAL_STATS, fresh_since=last_refresh_point())
        if cached:
            return cached

    teams_payload = _get_season_teams(league_id, year, espn_s2, swid, refresh)
    matchups = _get_season_matchups(league_id, year, espn_s2, swid, refresh)

    league = get_league(league_id, year, espn_s2=espn_s2, swid=swid)
    reg_season_count = league.settings.reg_season_count
    playoff_team_count = league.settings.playoff_team_count
    total_weeks = max((len(t.outcomes) for t in league.teams), default=0)
    if is_live_season(year):
        played = max(
            (t["wins"] + t["losses"] + t["ties"] for t in teams_payload["teams"]), default=0
        )
        # Completed weeks only. The week in progress would count partial
        # points as a full game, and right after ESPN closes out a week the
        # next one is "current" before a snap is played, so it would count
        # every lineup slot as a 0-point game.
        total_weeks = min(total_weeks, played)

    # Build per-week set of team_ids that played a real championship-bracket game.
    championship_teams_by_week: dict[int, set[int]] = {}
    for m in matchups:
        if m.get("round_label") in {"playoff", "semifinal", "championship"}:
            championship_teams_by_week.setdefault(m["week"], set()).update(
                {m["team_a_id"], m["team_b_id"]}
            )

    # team_id -> position -> { tot_pts, tot_games, po_pts, po_games }
    acc: dict[int, dict[str, dict]] = {}
    missing_weeks: list[int] = []

    for week in range(1, total_weeks + 1):
        try:
            bs = _get_season_box_scores(league_id, year, week, espn_s2, swid, refresh)
        except Exception:
            # Counted without this week for now, and said so; the payload is
            # then cached only until the next refresh point (see above).
            missing_weeks.append(week)
            continue
        week_points = compute_positional_week_points(bs)
        championship_set = championship_teams_by_week.get(week, set())
        for team_id, by_pos in week_points.items():
            in_championship_bracket = team_id in championship_set
            for pos, pts in by_pos.items():
                row = (
                    acc.setdefault(team_id, {})
                    .setdefault(pos, {"tot_pts": 0.0, "tot_games": 0, "po_pts": 0.0, "po_games": 0})
                )
                row["tot_pts"] += pts
                row["tot_games"] += 1
                if in_championship_bracket:
                    row["po_pts"] += pts
                    row["po_games"] += 1

    positions: list[dict] = []
    for pos in POSITIONS_ORDER:
        rows: list[dict] = []
        for team in teams_payload["teams"]:
            stats = acc.get(team["team_id"], {}).get(pos, {
                "tot_pts": 0.0, "tot_games": 0, "po_pts": 0.0, "po_games": 0,
            })
            owner = team["owners"][0] if team["owners"] else {}
            owner_name = (
                f"{owner.get('first_name', '')} {owner.get('last_name', '')}".strip() or "—"
            )
            rows.append({
                "team_id": team["team_id"],
                "team_name": team["team_name"],
                "owner_id": owner.get("id", ""),
                "owner_name": owner_name,
                "total_points": round(stats["tot_pts"], 2),
                "games_played": stats["tot_games"],
                "avg_ppg": round(stats["tot_pts"] / stats["tot_games"], 2) if stats["tot_games"] else 0.0,
                "playoff_points": round(stats["po_pts"], 2),
                "playoff_games": stats["po_games"],
                "playoff_ppg": round(stats["po_pts"] / stats["po_games"], 2) if stats["po_games"] else 0.0,
                "made_playoffs": team["standing"] <= playoff_team_count,
            })
        rows.sort(key=lambda r: r["total_points"], reverse=True)
        positions.append({"position": pos, "teams": rows})

    payload = {
        "league_id": league_id,
        "year": year,
        "reg_season_count": reg_season_count,
        "positions": positions,
        "missing_weeks": missing_weeks,
    }
    cache.put(league_id, year, cache.POSITIONAL_STATS, payload)
    return payload


def _get_season_scoreboard(
    league_id: int, year: int, espn_s2: str | None, swid: str | None, refresh: bool = False
) -> dict:
    if not refresh:
        cached = cache.get(league_id, year, cache.SCOREBOARD, fresh_since=_fresh_since(year))
        if cached:
            return cached
    league = get_league(league_id, year, espn_s2=espn_s2, swid=swid)
    data = serialize_scoreboard(league, year)
    payload = {"league_id": league_id, **data}
    cache.put(league_id, year, cache.SCOREBOARD, payload)
    return payload


# --------------------------------------------------------------------------- #
# League info / years discovery
# --------------------------------------------------------------------------- #


@app.get("/api/leagues/{league_id}/info", response_model=LeagueInfo)
def league_info(ctx: LeagueContext = Depends(get_user_league)):
    """The league's display name and every season it has played."""
    try:
        years = discover_years(ctx.espn_league_id, espn_s2=ctx.espn_s2, swid=ctx.swid)
    except Exception as e:
        raise espn_failure(e, "discovering seasons") from e
    return LeagueInfo(
        espn_league_id=ctx.espn_league_id,
        display_name=ctx.display_name,
        years=years,
    )


# --------------------------------------------------------------------------- #
# ESPN data endpoints
# --------------------------------------------------------------------------- #


@app.get("/api/leagues/{league_id}/seasons/{year}/teams", response_model=SeasonTeams)
def teams(year: int, refresh: bool = False, ctx: LeagueContext = Depends(get_user_league)):
    """Every team in a season: owners, record, points, standings and weekly scores."""
    try:
        return _get_season_teams(ctx.espn_league_id, year, ctx.espn_s2, ctx.swid, refresh)
    except Exception as e:
        raise espn_failure(e, "loading ESPN data") from e


@app.get(
    "/api/leagues/{league_id}/seasons/{year}/scoreboard",
    response_model=SeasonScoreboard,
)
def scoreboard(year: int, refresh: bool = False, ctx: LeagueContext = Depends(get_user_league)):
    """Every matchup in a season, week by week, with names, scores and round."""
    try:
        return _get_season_scoreboard(ctx.espn_league_id, year, ctx.espn_s2, ctx.swid, refresh)
    except Exception as e:
        raise espn_failure(e, "loading ESPN data") from e


@app.get("/api/leagues/{league_id}/seasons/{year}/transactions", response_model=SeasonMoves)
def season_transactions(year: int, refresh: bool = False, ctx: LeagueContext = Depends(get_user_league)):
    """The season's waiver claims, free-agent pickups and drops (trades are on
    /trades). ESPN only keeps league activity from 2019 on."""
    if year < 2019:
        return {"league_id": ctx.espn_league_id, "year": year, "supported": False, "moves": []}
    try:
        activity = _load_season_activity(ctx.espn_league_id, year, ctx.espn_s2, ctx.swid, refresh)
    except Exception as e:
        raise espn_failure(e, "loading ESPN data") from e
    moves = [{**m, "year": year} for m in moves_from_activity(activity["activities"], year)]
    return {
        "league_id": ctx.espn_league_id,
        "year": year,
        "supported": True,
        "unavailable": activity["unavailable"],
        "moves": moves,
    }


@app.get("/api/leagues/{league_id}/transactions", response_model=LeagueMoves)
def all_transactions(ctx: LeagueContext = Depends(get_user_league)):
    """Every season's waiver claims, pickups and drops (2019 on), in one
    request for the All seasons view."""
    try:
        years = _transaction_years(ctx)
        moves, unavailable = [], []
        for year in years:
            activity = _load_season_activity(ctx.espn_league_id, year, ctx.espn_s2, ctx.swid)
            if activity["unavailable"]:
                unavailable.append(year)
            moves += [{**m, "year": year} for m in moves_from_activity(activity["activities"], year)]
    except Exception as e:
        raise espn_failure(e, "loading ESPN data") from e
    return {"league_id": ctx.espn_league_id, "years": years, "unavailable_years": unavailable, "moves": moves}


@app.get("/api/leagues/{league_id}/seasons/{year}/trades", response_model=SeasonTrades)
def season_trades(
    year: int,
    refresh: bool = False,
    ctx: LeagueContext = Depends(get_user_league),
    db: Session = Depends(get_db),
):
    """Every trade in a season, with what each side's new players went on to
    score for it (app/trades.py), from the stored results (app/trade_store.py).
    ESPN only keeps trades from 2019 on."""
    if year < 2019:
        return {"league_id": ctx.espn_league_id, "year": year, "supported": False, "trades": []}
    try:
        trades = _season_trade_results(db, ctx, year, refresh)
        unavailable = not trades and _activity_unavailable(ctx, year)
        espn_count = trade_store.espn_trade_counts(db, ctx.espn_league_id, [year]).get(year)
    except Exception as e:
        raise espn_failure(e, "loading ESPN data") from e
    return {
        "league_id": ctx.espn_league_id,
        "year": year,
        "supported": True,
        "unavailable": unavailable,
        "espn_trade_count": espn_count,
        "trades": trades,
    }


@app.get("/api/leagues/{league_id}/trades", response_model=LeagueTrades)
def all_trades(ctx: LeagueContext = Depends(get_user_league), db: Session = Depends(get_db)):
    """Every season's trades with their results (2019 on), in one request for
    the All seasons view. Seasons whose results are stored come straight from
    the database; any others are calculated first."""
    try:
        years = _transaction_years(ctx)
        for year in years:
            if not trade_store.is_current(db, ctx.espn_league_id, year):
                _season_trade_results(db, ctx, year)
        trades = trade_store.load(db, ctx.espn_league_id, years)
        traded = {t["year"] for t in trades}
        unavailable = [y for y in years if y not in traded and _activity_unavailable(ctx, y)]
        counts = trade_store.espn_trade_counts(db, ctx.espn_league_id, years)
    except Exception as e:
        raise espn_failure(e, "loading ESPN data") from e
    return {
        "league_id": ctx.espn_league_id,
        "years": years,
        "unavailable_years": unavailable,
        "espn_trade_counts": counts,
        "trades": trades,
    }


@app.get(
    "/api/leagues/{league_id}/seasons/{year}/weeks/{week}/box_scores",
    response_model=WeekBoxScores,
)
def box_scores(
    year: int, week: int, refresh: bool = False, ctx: LeagueContext = Depends(get_user_league)
):
    """Every game in one week with both lineups, player by player (2019 on).
    404 for a week of the live season that hasn't been reached."""
    if year < 2019:
        raise HTTPException(
            status_code=400,
            detail="Box scores are only available for seasons 2019 and later.",
        )
    try:
        return _get_season_box_scores(
            ctx.espn_league_id, year, week, ctx.espn_s2, ctx.swid, refresh
        )
    except WeekNotPlayedError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise espn_failure(e, "loading ESPN data") from e


@app.get(
    "/api/leagues/{league_id}/seasons/{year}/positional_stats",
    response_model=SeasonPositionalStats,
)
def positional_stats_for_year(
    year: int,
    refresh: bool = False,
    ctx: LeagueContext = Depends(get_user_league),
):
    """Points by lineup position (QB, RB, ... D/ST) for each team in a season,
    regular season and championship-bracket playoffs (2019 on)."""
    if year < 2019:
        raise HTTPException(
            status_code=400,
            detail="Positional stats require seasons from 2019 onward (box-score data).",
        )
    try:
        return _compute_positional_stats_for_year(
            ctx.espn_league_id, year, ctx.espn_s2, ctx.swid, refresh
        )
    except Exception as e:
        raise espn_failure(e, "loading ESPN data") from e


@app.get(
    "/api/leagues/{league_id}/positional_stats/aggregate",
    response_model=LeaguePositionalAggregate,
)
def positional_stats_aggregate(
    refresh: bool = False,
    ctx: LeagueContext = Depends(get_user_league),
):
    """Positional stats summed per owner across every season from 2019 on."""
    try:
        all_years = discover_years(
            ctx.espn_league_id, espn_s2=ctx.espn_s2, swid=ctx.swid
        )
    except Exception as e:
        raise espn_failure(e, "discovering seasons") from e

    years = [y for y in all_years if y >= 2019]
    if not years:
        raise HTTPException(
            status_code=400,
            detail="No seasons with box-score data (2019+) found.",
        )

    # Aggregate per position per owner across years.
    # owners[pos][owner_id] = {meta + tallies}
    by_pos: dict[str, dict[str, dict]] = {p: {} for p in POSITIONS_ORDER}
    missing_weeks: dict[int, list[int]] = {}

    for year in years:
        try:
            season = _compute_positional_stats_for_year(
                ctx.espn_league_id, year, ctx.espn_s2, ctx.swid, refresh
            )
        except Exception as e:
            raise espn_failure(e, f"season {year}") from e
        if season.get("missing_weeks"):
            missing_weeks[year] = season["missing_weeks"]
        for pos_block in season["positions"]:
            pos = pos_block["position"]
            for row in pos_block["teams"]:
                oid = row["owner_id"]
                if not oid:
                    continue
                agg = by_pos[pos].setdefault(oid, {
                    "owner_id": oid,
                    "owner_name": row["owner_name"],
                    "current_team_name": row["team_name"],
                    "seasons_with_data": 0,
                    "total_points": 0.0,
                    "games_played": 0,
                    "playoff_points": 0.0,
                    "playoff_games": 0,
                })
                # Most-recent year wins for name fields (we iterate chronologically).
                agg["owner_name"] = row["owner_name"]
                agg["current_team_name"] = row["team_name"]
                agg["seasons_with_data"] += 1
                agg["total_points"] += row["total_points"]
                agg["games_played"] += row["games_played"]
                agg["playoff_points"] += row["playoff_points"]
                agg["playoff_games"] += row["playoff_games"]

    positions = []
    for pos in POSITIONS_ORDER:
        owners = []
        for agg in by_pos[pos].values():
            tg = agg["games_played"]
            pg = agg["playoff_games"]
            owners.append({
                **agg,
                "total_points": round(agg["total_points"], 2),
                "avg_ppg": round(agg["total_points"] / tg, 2) if tg else 0.0,
                "playoff_points": round(agg["playoff_points"], 2),
                "playoff_ppg": round(agg["playoff_points"] / pg, 2) if pg else 0.0,
            })
        owners.sort(key=lambda r: r["total_points"], reverse=True)
        positions.append({"position": pos, "owners": owners})

    return {
        "league_id": ctx.espn_league_id,
        "years": years,
        "positions": positions,
        "missing_weeks": missing_weeks,
    }


@app.get(
    "/api/leagues/{league_id}/seasons/{year}/playoffs",
    response_model=SeasonPlayoffs,
)
def playoffs(year: int, refresh: bool = False, ctx: LeagueContext = Depends(get_user_league)):
    """A season's playoff teams and every playoff-week matchup, for the bracket."""
    if not refresh:
        cached = cache.get(ctx.espn_league_id, year, cache.PLAYOFFS, fresh_since=_fresh_since(year))
        if cached:
            return cached
    try:
        league = get_league(ctx.espn_league_id, year, espn_s2=ctx.espn_s2, swid=ctx.swid)
        data = serialize_playoffs(league)
        payload = {"league_id": ctx.espn_league_id, "year": year, **data}
        cache.put(ctx.espn_league_id, year, cache.PLAYOFFS, payload)
        return payload
    except Exception as e:
        raise espn_failure(e, "loading ESPN data") from e


@app.get(
    "/api/leagues/{league_id}/owners/{owner_id}/hub",
    response_model=TeamHub,
)
def team_hub(
    owner_id: str,
    year: int | None = None,
    refresh: bool = False,
    ctx: LeagueContext = Depends(get_user_league),
):
    """One owner's Team Hub: every season they played, career records and
    accolades, and for the selected season (the latest by default) the
    roster, schedule and last matchup."""
    try:
        all_years = discover_years(ctx.espn_league_id, espn_s2=ctx.espn_s2, swid=ctx.swid)
    except Exception as e:
        raise espn_failure(e, "discovering seasons") from e

    # Gather every season this owner played in.
    seasons_by_year: dict[int, dict] = {}
    payload_by_year: dict[int, dict] = {}
    for y in all_years:
        teams_payload = _get_season_teams(
            ctx.espn_league_id, y, ctx.espn_s2, ctx.swid, refresh
        )
        td = next(
            (
                t
                for t in teams_payload["teams"]
                if t["owners"] and t["owners"][0]["id"] == owner_id
            ),
            None,
        )
        if td is not None:
            seasons_by_year[y] = td
            payload_by_year[y] = teams_payload

    if not seasons_by_year:
        raise HTTPException(status_code=404, detail="Owner not found in any season")

    available_years = sorted(seasons_by_year.keys())

    # Decide which year to display.
    if year is None:
        selected_year = available_years[-1]
    elif year not in seasons_by_year:
        raise HTTPException(
            status_code=404,
            detail=f"Owner did not play in {year}",
        )
    else:
        selected_year = year

    selected_td = seasons_by_year[selected_year]
    latest_td = seasons_by_year[available_years[-1]]

    # All-time aggregates (over every season the owner played).
    # Finished seasons only: a season in progress has a standing, not a finish.
    finishes = [
        td["final_standing"]
        for y, td in seasons_by_year.items()
        if season_over(payload_by_year[y]) and td["final_standing"]
    ]
    avg_finish = sum(finishes) / len(finishes) if finishes else 0.0
    total_pf = sum(td["points_for"] for td in seasons_by_year.values())
    total_games = sum(
        td["wins"] + td["losses"] + td["ties"] for td in seasons_by_year.values()
    )
    career_avg_pf = total_pf / total_games if total_games else 0.0

    # Per-scoring-format avg PPG (seasons are already fetched via _get_season_teams above)
    _scoring_pf: dict[str, float] = {}
    _scoring_games: dict[str, int] = {}
    for y, td in seasons_by_year.items():
        teams_payload = _get_season_teams(ctx.espn_league_id, y, ctx.espn_s2, ctx.swid)
        st = teams_payload.get("scoring_type", "standard")
        games = td["wins"] + td["losses"] + td["ties"]
        _scoring_pf[st] = _scoring_pf.get(st, 0.0) + td["points_for"]
        _scoring_games[st] = _scoring_games.get(st, 0) + games

    def _avg_for_type(key: str) -> float | None:
        g = _scoring_games.get(key, 0)
        return round(_scoring_pf[key] / g, 2) if g else None

    ppr_avg_pf = _avg_for_type("ppr")
    half_ppr_avg_pf = _avg_for_type("half_ppr")
    standard_avg_pf = _avg_for_type("standard")

    # Roster from the selected year.
    roster: list[dict] = []
    try:
        league = get_league(
            ctx.espn_league_id, selected_year, espn_s2=ctx.espn_s2, swid=ctx.swid
        )
        live_team = next(
            (t for t in league.teams if t.team_id == selected_td["team_id"]),
            None,
        )
        if live_team:
            roster = serialize_roster(live_team)
    except Exception:
        roster = []

    # Accolades: podium and last-place finishes, in finished seasons only.
    accolades = count_accolades(
        (y, td, payload_by_year[y]) for y, td in seasons_by_year.items()
    )

    # Career records over every season's decided games (app/team_hub.py).
    record_seasons = []
    for y in sorted(seasons_by_year):
        try:
            sb_y = _get_season_scoreboard(ctx.espn_league_id, y, ctx.espn_s2, ctx.swid, refresh)
        except Exception:
            continue
        record_seasons.append((y, seasons_by_year[y]["team_id"], sb_y["matchups"]))
    records = career_records(record_seasons)

    # Schedule: every game (and bye) for the team that year, in week order,
    # and the latest game with points on the board for the Last Matchup card.
    try:
        sb = _get_season_scoreboard(
            ctx.espn_league_id, selected_year, ctx.espn_s2, ctx.swid, refresh
        )
        schedule, latest_game = team_schedule(sb["matchups"], selected_td["team_id"])
        last_matchup = {"year": selected_year, **latest_game} if latest_game else None
    except Exception:
        schedule = []
        last_matchup = None

    owner_obj = latest_td["owners"][0] if latest_td["owners"] else {}
    owner_name = f"{owner_obj.get('first_name', '')} {owner_obj.get('last_name', '')}".strip()

    return {
        "owner_id": owner_id,
        "owner_name": owner_name or "—",
        "current_team_name": latest_td["team_name"],
        "selected_year": selected_year,
        "selected_team_id": selected_td["team_id"],
        "selected_team_name": selected_td["team_name"],
        "selected_finish": selected_td["final_standing"] or selected_td["standing"],
        "selected_avg_pf": selected_td["avg_points_for"],
        "seasons_played": len(seasons_by_year),
        "avg_finish": round(avg_finish, 2),
        "career_avg_pf": round(career_avg_pf, 2),
        "ppr_avg_pf": ppr_avg_pf,
        "half_ppr_avg_pf": half_ppr_avg_pf,
        "standard_avg_pf": standard_avg_pf,
        "available_years": available_years,
        "roster": roster,
        "last_matchup": last_matchup,
        "schedule": schedule,
        "accolades": accolades,
        "records": records,
    }


@app.get("/api/leagues/{league_id}/owner_history", response_model=LeagueOwnerHistory)
def owner_history(refresh: bool = False, ctx: LeagueContext = Depends(get_user_league)):
    """Every owner's season-by-season results, for Trends and owner pickers."""
    try:
        years = discover_years(ctx.espn_league_id, espn_s2=ctx.espn_s2, swid=ctx.swid)
    except Exception as e:
        raise espn_failure(e, "discovering seasons") from e
    seasons = []
    for year in years:
        try:
            seasons.append(
                _get_season_teams(ctx.espn_league_id, year, ctx.espn_s2, ctx.swid, refresh)
            )
        except Exception as e:
            raise espn_failure(e, f"season {year}") from e
    return {
        "league_id": ctx.espn_league_id,
        "years": years,
        "owners": build_owner_history(seasons),
    }


def _load_season_teams(ctx: LeagueContext, years: list[int], refresh: bool) -> list[dict]:
    seasons = []
    for year in years:
        try:
            seasons.append(
                _get_season_teams(ctx.espn_league_id, year, ctx.espn_s2, ctx.swid, refresh)
            )
        except Exception as e:
            raise espn_failure(e, f"season {year}") from e
    return seasons


@app.get("/api/leagues/{league_id}/seasons", response_model=AllSeasons)
def all_seasons(refresh: bool = False, ctx: LeagueContext = Depends(get_user_league)):
    """Every team-season the league has played, one SeasonTeams per year.

    Unlike /aggregate this keeps each season separate, so the client can rank
    individual seasons against each other. scoring_type rides along per year
    because the league has changed formats, and a PPR points total isn't
    comparable to a standard one.
    """
    try:
        years = discover_years(ctx.espn_league_id, espn_s2=ctx.espn_s2, swid=ctx.swid)
    except Exception as e:
        raise espn_failure(e, "discovering seasons") from e
    return {
        "league_id": ctx.espn_league_id,
        "years": years,
        "seasons": _load_season_teams(ctx, years, refresh),
    }


@app.get("/api/leagues/{league_id}/close_games", response_model=CloseGames)
def close_games(refresh: bool = False, ctx: LeagueContext = Depends(get_user_league)):
    """Close-game records for every season.

    Split from /seasons because it needs each season's full matchup list, which
    on a cold cache means a fresh ESPN fetch per year. The client renders the
    season table first and fills this column in when it arrives.
    """
    try:
        years = discover_years(ctx.espn_league_id, espn_s2=ctx.espn_s2, swid=ctx.swid)
    except Exception as e:
        raise espn_failure(e, "discovering seasons") from e
    seasons = []
    for year, teams_payload in zip(years, _load_season_teams(ctx, years, refresh)):
        games = max(
            (t["wins"] + t["losses"] + t["ties"] for t in teams_payload["teams"]), default=0
        )
        try:
            matchups = _get_season_matchups(
                ctx.espn_league_id, year, ctx.espn_s2, ctx.swid, refresh
            )
        except Exception as e:
            raise espn_failure(e, f"season {year}") from e
        records = close_game_records(matchups, games)
        seasons.append({
            "year": year,
            "records": [{"team_id": tid, **rec} for tid, rec in records.items()],
        })
    return {"league_id": ctx.espn_league_id, "margin": CLOSE_GAME_MARGIN, "seasons": seasons}


@app.get("/api/leagues/{league_id}/aggregate", response_model=LeagueAggregate)
def aggregate(
    start_year: int | None = None,
    end_year: int | None = None,
    refresh: bool = False,
    ctx: LeagueContext = Depends(get_user_league),
):
    """Career totals per owner over the seasons from `start_year` to `end_year`
    (inclusive; every season by default)."""
    try:
        available = discover_years(ctx.espn_league_id, espn_s2=ctx.espn_s2, swid=ctx.swid)
    except Exception as e:
        raise espn_failure(e, "discovering seasons") from e
    sy = start_year if start_year is not None else available[0]
    ey = end_year if end_year is not None else available[-1]
    years = [y for y in available if sy <= y <= ey]
    seasons = _load_season_teams(ctx, years, refresh)
    return {
        "league_id": ctx.espn_league_id,
        "start_year": sy,
        "end_year": ey,
        "years": years,
        "owners": aggregate_by_owner(seasons),
    }


@app.get("/api/leagues/{league_id}/head_to_head/summary", response_model=RivalrySummary)
def head_to_head_summary(
    owner: str,
    refresh: bool = False,
    ctx: LeagueContext = Depends(get_user_league),
):
    """One owner's record against every other owner, in one request.

    The Head to Head page shows this before an opponent is picked. It reads the
    same cached teams and matchups as the pairwise endpoint below, once per
    season, instead of the page firing a request per opponent.
    """
    try:
        years = discover_years(ctx.espn_league_id, espn_s2=ctx.espn_s2, swid=ctx.swid)
    except Exception as e:
        raise espn_failure(e, "discovering seasons") from e
    seasons = []
    for year in years:
        try:
            teams_payload = _get_season_teams(ctx.espn_league_id, year, ctx.espn_s2, ctx.swid, refresh)
            matchups = _get_season_matchups(ctx.espn_league_id, year, ctx.espn_s2, ctx.swid, refresh)
        except Exception as e:
            raise espn_failure(e, f"season {year}") from e
        seasons.append((year, teams_payload, matchups))
    return rivalry_summary(owner, seasons)


@app.get("/api/leagues/{league_id}/head_to_head", response_model=HeadToHeadStats)
def head_to_head(
    owner_a: str,
    owner_b: str,
    refresh: bool = False,
    ctx: LeagueContext = Depends(get_user_league),
):
    """Every meeting between two owners across every season, with their record,
    points and the matchup list."""
    if owner_a == owner_b:
        raise HTTPException(status_code=400, detail="owner_a and owner_b must differ")
    try:
        years = discover_years(ctx.espn_league_id, espn_s2=ctx.espn_s2, swid=ctx.swid)
    except Exception as e:
        raise espn_failure(e, "discovering seasons") from e

    matchups: list[dict] = []
    owner_a_name = owner_b_name = ""
    owner_a_team_name = owner_b_team_name = ""

    for year in years:
        try:
            teams_payload = _get_season_teams(
                ctx.espn_league_id, year, ctx.espn_s2, ctx.swid, refresh
            )
            season_matchups = _get_season_matchups(
                ctx.espn_league_id, year, ctx.espn_s2, ctx.swid, refresh
            )
        except Exception as e:
            raise espn_failure(e, f"season {year}") from e

        team_a_in_season = next(
            (
                t
                for t in teams_payload["teams"]
                if t["owners"] and t["owners"][0]["id"] == owner_a
            ),
            None,
        )
        team_b_in_season = next(
            (
                t
                for t in teams_payload["teams"]
                if t["owners"] and t["owners"][0]["id"] == owner_b
            ),
            None,
        )
        if not team_a_in_season or not team_b_in_season:
            continue

        a_owner = team_a_in_season["owners"][0]
        b_owner = team_b_in_season["owners"][0]
        owner_a_name = f"{a_owner['first_name']} {a_owner['last_name']}".strip()
        owner_b_name = f"{b_owner['first_name']} {b_owner['last_name']}".strip()
        owner_a_team_name = team_a_in_season["team_name"]
        owner_b_team_name = team_b_in_season["team_name"]

        a_team_id = team_a_in_season["team_id"]
        b_team_id = team_b_in_season["team_id"]

        for m in season_matchups:
            if {m["team_a_id"], m["team_b_id"]} != {a_team_id, b_team_id}:
                continue
            # A scheduled game that hasn't been played would count as a tie.
            if is_unplayed(m):
                continue
            if m["team_a_id"] == a_team_id:
                a_score, b_score = m["team_a_score"], m["team_b_score"]
            else:
                a_score, b_score = m["team_b_score"], m["team_a_score"]

            if m["winner_id"] == a_team_id:
                winner = owner_a
            elif m["winner_id"] == b_team_id:
                winner = owner_b
            else:
                winner = None

            matchups.append({
                "year": year,
                "week": m["week"],
                "is_playoff": m["is_playoff"],
                "round_label": m.get("round_label", "regular"),
                "owner_a_team_id": a_team_id,
                "owner_b_team_id": b_team_id,
                "owner_a_team_name": team_a_in_season["team_name"],
                "owner_b_team_name": team_b_in_season["team_name"],
                "owner_a_score": a_score,
                "owner_b_score": b_score,
                "winner_owner_id": winner,
            })

    matchups.sort(key=lambda m: (m["year"], m["week"]))
    total = len(matchups)
    a_wins = sum(1 for m in matchups if m["winner_owner_id"] == owner_a)
    b_wins = sum(1 for m in matchups if m["winner_owner_id"] == owner_b)
    ties = total - a_wins - b_wins
    a_pf = sum(m["owner_a_score"] for m in matchups)
    b_pf = sum(m["owner_b_score"] for m in matchups)
    po = [m for m in matchups if m["is_playoff"]]
    po_a_wins = sum(1 for m in po if m["winner_owner_id"] == owner_a)
    po_b_wins = sum(1 for m in po if m["winner_owner_id"] == owner_b)
    po_ties = len(po) - po_a_wins - po_b_wins

    return {
        "owner_a_id": owner_a,
        "owner_b_id": owner_b,
        "owner_a_name": owner_a_name,
        "owner_b_name": owner_b_name,
        "owner_a_team_name": owner_a_team_name,
        "owner_b_team_name": owner_b_team_name,
        "total_matchups": total,
        "owner_a_wins": a_wins,
        "owner_b_wins": b_wins,
        "ties": ties,
        "owner_a_total_pf": round(a_pf, 2),
        "owner_b_total_pf": round(b_pf, 2),
        "owner_a_avg_pf": round(a_pf / total, 2) if total else 0.0,
        "owner_b_avg_pf": round(b_pf / total, 2) if total else 0.0,
        "playoff_matchups": len(po),
        "owner_a_playoff_wins": po_a_wins,
        "owner_b_playoff_wins": po_b_wins,
        "playoff_ties": po_ties,
        "matchups": matchups,
    }


# --------------------------------------------------------------------------- #
# Power rankings
# --------------------------------------------------------------------------- #


def _league_posts(db: Session, espn_league_id: int) -> list[PowerRankingPost]:
    """The league's archive, or nothing if the tables aren't there yet.

    Render deploys and the migrate workflow run side by side, so new code can
    briefly run before its migration has been applied (or before anyone has
    set the workflow up). Every other page should keep working in that
    window, and this one should show its empty state rather than an error.
    """
    try:
        return (
            db.query(PowerRankingPost)
            .options(selectinload(PowerRankingPost.entries))
            .filter(PowerRankingPost.espn_league_id == espn_league_id)
            .order_by(PowerRankingPost.posted_at)
            .all()
        )
    except ProgrammingError:
        db.rollback()
        return []


@app.get("/api/leagues/{league_id}/power_rankings", response_model=PowerRankings)
def power_rankings(
    refresh: bool = False,
    ctx: LeagueContext = Depends(get_user_league),
    db: Session = Depends(get_db),
):
    """The league's power rankings: every post's summary and, per season, every
    regular-season week's ranks with gaps filled (see power_rankings.py)."""
    posts = _league_posts(db, ctx.espn_league_id)
    author = pr.primary_author(posts)
    seasons = []
    for season in sorted({p.season for p in posts}):
        try:
            teams_payload = _get_season_teams(ctx.espn_league_id, season, ctx.espn_s2, ctx.swid, refresh)
            matchups = _get_season_matchups(ctx.espn_league_id, season, ctx.espn_s2, ctx.swid, refresh)
        except Exception as e:
            raise espn_failure(e, f"season {season}") from e
        built = pr.build_season(
            season,
            [p for p in posts if p.season == season],
            teams_payload["teams"],
            matchups,
            author,
            is_live_season(season),
        )
        if built:
            seasons.append(built)
    return {
        "league_id": ctx.espn_league_id,
        "primary_author": author,
        "posts": [pr.post_summary(p, author) for p in posts],
        "seasons": seasons,
    }


def _league_post(db: Session, espn_league_id: int, post_id: int) -> PowerRankingPost:
    post = next((p for p in _league_posts(db, espn_league_id) if p.id == post_id), None)
    if post is None:
        raise HTTPException(status_code=404, detail="That post isn't in this league's power rankings.")
    return post


@app.get(
    "/api/leagues/{league_id}/power_rankings/posts/{post_id}",
    response_model=PowerRankingPostSchema,
)
def power_ranking_post(
    post_id: int,
    ctx: LeagueContext = Depends(get_user_league),
    db: Session = Depends(get_db),
):
    """One power rankings post in full, with its text."""
    posts = _league_posts(db, ctx.espn_league_id)
    post = next((p for p in posts if p.id == post_id), None)
    if post is None:
        raise HTTPException(status_code=404, detail="That post isn't in this league's power rankings.")
    return {**pr.post_summary(post, pr.primary_author(posts)), "text": post.body}


@app.get("/api/leagues/{league_id}/power_rankings/posts/{post_id}/image")
def power_ranking_image(
    post_id: int,
    ctx: LeagueContext = Depends(get_user_league),
    db: Session = Depends(get_db),
):
    """The saved image for an image post (a tier list, say)."""
    post = _league_post(db, ctx.espn_league_id, post_id)
    # The type comes from the bytes, not the stored label, so nothing but a
    # real image is ever served from this origin (imports before the check
    # existed included).
    mime = pr.image_type(post.image)
    if mime is None:
        raise HTTPException(status_code=404, detail="That post has no saved image.")
    return Response(
        content=post.image,
        media_type=mime,
        headers={
            "Cache-Control": "private, max-age=86400",
            "Content-Disposition": "inline",
            # An image needs none of this; if a browser ever did render it as
            # a document, it gets no scripts, no requests and no same-origin.
            "Content-Security-Policy": "default-src 'none'; sandbox",
        },
    )


@app.post(
    "/api/leagues/{league_id}/power_rankings/import",
    response_model=PowerRankingImportResult,
)
def import_power_rankings(
    payload: PowerRankingImport,
    ctx: LeagueContext = Depends(get_user_league),
    db: Session = Depends(get_db),
):
    """Replace the league's power rankings with an uploaded archive.

    Any member of the league can import. The archive is shared by everyone who
    has added the league, the same way its ESPN data is.
    """
    if not payload.posts:
        raise HTTPException(status_code=400, detail="The file has no posts in it.")
    try:
        available = set(discover_years(ctx.espn_league_id, espn_s2=ctx.espn_s2, swid=ctx.swid))
    except Exception as e:
        raise espn_failure(e, "discovering seasons") from e
    seasons_teams = {}
    for season in sorted({p.season for p in payload.posts}):
        if season not in available:
            raise HTTPException(
                status_code=400, detail=f"The file has posts for {season}, which this league didn't play."
            )
        try:
            seasons_teams[season] = _get_season_teams(
                ctx.espn_league_id, season, ctx.espn_s2, ctx.swid
            )["teams"]
        except Exception as e:
            raise espn_failure(e, f"season {season}") from e
    try:
        return pr.store_import(
            db, ctx.espn_league_id, [p.model_dump() for p in payload.posts], seasons_teams
        )
    except pr.ImportError_ as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except ProgrammingError:
        db.rollback()
        raise HTTPException(
            status_code=503,
            detail="Power rankings aren't set up on the server yet. Try again after the next update.",
        )


@app.delete("/api/leagues/{league_id}/power_rankings")
def delete_power_rankings(
    ctx: LeagueContext = Depends(get_user_league),
    db: Session = Depends(get_db),
):
    """Delete the league's whole power rankings archive, for everyone who has
    added the league."""
    for post in _league_posts(db, ctx.espn_league_id):
        db.delete(post)
    db.commit()
    return {"ok": True}
