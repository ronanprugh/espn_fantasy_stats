from dataclasses import dataclass

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from starlette.middleware.sessions import SessionMiddleware

from . import cache
from .auth import current_user, hash_password, login, logout, verify_password
from .config import SECRET_KEY
from .crypto import decrypt, encrypt
from .database import get_db
from .espn_client import (
    aggregate_by_owner,
    build_owner_history,
    discover_years,
    get_league,
    serialize_all_matchups,
    serialize_box_scores,
    serialize_playoffs,
    serialize_scoreboard,
    serialize_teams,
)
from .models import League as LeagueModel
from .models import User
from .schemas import (
    CreateLeagueRequest,
    HeadToHeadStats,
    LeagueAggregate,
    LeagueInfo,
    LeagueOwnerHistory,
    LeagueSummary,
    LoginRequest,
    SeasonPlayoffs,
    SeasonScoreboard,
    SeasonTeams,
    UserResponse,
    WeekBoxScores,
)

app = FastAPI(title="espn_fantasy_stats")

app.add_middleware(
    SessionMiddleware,
    secret_key=SECRET_KEY,
    same_site="lax",
    https_only=False,  # set True in production
    max_age=60 * 60 * 24 * 30,  # 30 days
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #


@app.post("/api/auth/login", response_model=UserResponse)
def auth_login(payload: LoginRequest, request: Request, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == payload.username).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials"
        )
    login(request, user)
    return UserResponse(id=user.id, username=user.username)


@app.post("/api/auth/logout")
def auth_logout(request: Request):
    logout(request)
    return {"ok": True}


@app.get("/api/auth/me", response_model=UserResponse)
def auth_me(user: User = Depends(current_user)):
    return UserResponse(id=user.id, username=user.username)


# --------------------------------------------------------------------------- #
# League management (per-user)
# --------------------------------------------------------------------------- #


@app.get("/api/me/leagues", response_model=list[LeagueSummary])
def list_my_leagues(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(LeagueModel)
        .filter(LeagueModel.user_id == user.id)
        .order_by(LeagueModel.id)
        .all()
    )
    return [
        LeagueSummary(
            id=r.id, espn_league_id=r.espn_league_id, display_name=r.display_name
        )
        for r in rows
    ]


@app.post("/api/me/leagues", response_model=LeagueSummary)
def add_my_league(
    payload: CreateLeagueRequest,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
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
    row = LeagueModel(
        user_id=user.id,
        espn_league_id=payload.espn_league_id,
        display_name=payload.display_name,
        espn_s2_encrypted=encrypt(payload.espn_s2),
        swid_encrypted=encrypt(payload.swid),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return LeagueSummary(
        id=row.id, espn_league_id=row.espn_league_id, display_name=row.display_name
    )


@app.delete("/api/me/leagues/{league_row_id}")
def delete_my_league(
    league_row_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
):
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
    espn_league_id: int
    espn_s2: str | None
    swid: str | None
    display_name: str


def get_user_league(
    league_id: int,
    user: User = Depends(current_user),
    db: Session = Depends(get_db),
) -> LeagueContext:
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
    return LeagueContext(
        espn_league_id=row.espn_league_id,
        espn_s2=decrypt(row.espn_s2_encrypted),
        swid=decrypt(row.swid_encrypted),
        display_name=row.display_name,
    )


# --------------------------------------------------------------------------- #
# Helpers (cache + ESPN fetch). All take credentials explicitly.
# --------------------------------------------------------------------------- #


def _get_season_teams(
    league_id: int, year: int, espn_s2: str | None, swid: str | None, refresh: bool = False
) -> dict:
    if not refresh:
        cached = cache.get(league_id, year, "teams_v2")
        if cached:
            return cached
    league = get_league(league_id, year, espn_s2=espn_s2, swid=swid)
    payload = {
        "league_id": league_id,
        "year": year,
        "teams": serialize_teams(league),
    }
    cache.put(league_id, year, "teams_v2", payload)
    return payload


def _get_season_matchups(
    league_id: int, year: int, espn_s2: str | None, swid: str | None, refresh: bool = False
) -> list[dict]:
    if not refresh:
        cached = cache.get(league_id, year, "matchups_v2")
        if cached:
            return cached["matchups"]
    league = get_league(league_id, year, espn_s2=espn_s2, swid=swid)
    matchups = serialize_all_matchups(league)
    cache.put(league_id, year, "matchups_v2", {"matchups": matchups})
    return matchups


# --------------------------------------------------------------------------- #
# League info / years discovery
# --------------------------------------------------------------------------- #


@app.get("/api/leagues/{league_id}/info", response_model=LeagueInfo)
def league_info(ctx: LeagueContext = Depends(get_user_league)):
    try:
        years = discover_years(ctx.espn_league_id, espn_s2=ctx.espn_s2, swid=ctx.swid)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not discover years: {e}")
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
    try:
        return _get_season_teams(ctx.espn_league_id, year, ctx.espn_s2, ctx.swid, refresh)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ESPN error: {e}")


@app.get(
    "/api/leagues/{league_id}/seasons/{year}/scoreboard",
    response_model=SeasonScoreboard,
)
def scoreboard(year: int, refresh: bool = False, ctx: LeagueContext = Depends(get_user_league)):
    if not refresh:
        cached = cache.get(ctx.espn_league_id, year, "scoreboard_v2")
        if cached:
            return cached
    try:
        league = get_league(ctx.espn_league_id, year, espn_s2=ctx.espn_s2, swid=ctx.swid)
        data = serialize_scoreboard(league, year)
        payload = {"league_id": ctx.espn_league_id, **data}
        cache.put(ctx.espn_league_id, year, "scoreboard_v2", payload)
        return payload
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ESPN error: {e}")


@app.get(
    "/api/leagues/{league_id}/seasons/{year}/weeks/{week}/box_scores",
    response_model=WeekBoxScores,
)
def box_scores(
    year: int, week: int, refresh: bool = False, ctx: LeagueContext = Depends(get_user_league)
):
    if year < 2019:
        raise HTTPException(
            status_code=400,
            detail="Box scores are only available for seasons 2019 and later.",
        )
    cache_key = f"box_scores_v1_w{week}"
    if not refresh:
        cached = cache.get(ctx.espn_league_id, year, cache_key)
        if cached:
            return cached
    try:
        league = get_league(ctx.espn_league_id, year, espn_s2=ctx.espn_s2, swid=ctx.swid)
        matchups = serialize_box_scores(league, week)
        payload = {
            "league_id": ctx.espn_league_id,
            "year": year,
            "week": week,
            "matchups": matchups,
        }
        cache.put(ctx.espn_league_id, year, cache_key, payload)
        return payload
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ESPN error: {e}")


@app.get(
    "/api/leagues/{league_id}/seasons/{year}/playoffs",
    response_model=SeasonPlayoffs,
)
def playoffs(year: int, refresh: bool = False, ctx: LeagueContext = Depends(get_user_league)):
    if not refresh:
        cached = cache.get(ctx.espn_league_id, year, "playoffs_v1")
        if cached:
            return cached
    try:
        league = get_league(ctx.espn_league_id, year, espn_s2=ctx.espn_s2, swid=ctx.swid)
        data = serialize_playoffs(league)
        payload = {"league_id": ctx.espn_league_id, "year": year, **data}
        cache.put(ctx.espn_league_id, year, "playoffs_v1", payload)
        return payload
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ESPN error: {e}")


@app.get("/api/leagues/{league_id}/owner_history", response_model=LeagueOwnerHistory)
def owner_history(refresh: bool = False, ctx: LeagueContext = Depends(get_user_league)):
    try:
        years = discover_years(ctx.espn_league_id, espn_s2=ctx.espn_s2, swid=ctx.swid)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not discover years: {e}")
    seasons = []
    for year in years:
        try:
            seasons.append(
                _get_season_teams(ctx.espn_league_id, year, ctx.espn_s2, ctx.swid, refresh)
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"ESPN error for {year}: {e}")
    return {
        "league_id": ctx.espn_league_id,
        "years": years,
        "owners": build_owner_history(seasons),
    }


@app.get("/api/leagues/{league_id}/aggregate", response_model=LeagueAggregate)
def aggregate(
    start_year: int | None = None,
    end_year: int | None = None,
    refresh: bool = False,
    ctx: LeagueContext = Depends(get_user_league),
):
    try:
        available = discover_years(ctx.espn_league_id, espn_s2=ctx.espn_s2, swid=ctx.swid)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not discover years: {e}")
    sy = start_year if start_year is not None else available[0]
    ey = end_year if end_year is not None else available[-1]
    years = [y for y in available if sy <= y <= ey]
    seasons = []
    for year in years:
        try:
            seasons.append(
                _get_season_teams(ctx.espn_league_id, year, ctx.espn_s2, ctx.swid, refresh)
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"ESPN error for {year}: {e}")
    return {
        "league_id": ctx.espn_league_id,
        "start_year": sy,
        "end_year": ey,
        "years": years,
        "owners": aggregate_by_owner(seasons),
    }


@app.get("/api/leagues/{league_id}/head_to_head", response_model=HeadToHeadStats)
def head_to_head(
    owner_a: str,
    owner_b: str,
    refresh: bool = False,
    ctx: LeagueContext = Depends(get_user_league),
):
    if owner_a == owner_b:
        raise HTTPException(status_code=400, detail="owner_a and owner_b must differ")
    try:
        years = discover_years(ctx.espn_league_id, espn_s2=ctx.espn_s2, swid=ctx.swid)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not discover league years: {e}")

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
            raise HTTPException(status_code=502, detail=f"ESPN error for {year}: {e}")

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
