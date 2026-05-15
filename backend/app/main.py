from dataclasses import dataclass

from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from starlette.middleware.sessions import SessionMiddleware

from . import cache
from .auth import current_user, hash_password, login, logout, verify_password
from .config import ALLOWED_ORIGINS, COOKIE_SAME_SITE, COOKIE_SECURE, SECRET_KEY
from .crypto import decrypt, encrypt
from .database import get_db
from .espn_client import (
    POSITIONS_ORDER,
    aggregate_by_owner,
    build_owner_history,
    compute_positional_week_points,
    discover_years,
    get_league,
    serialize_all_matchups,
    serialize_box_scores,
    serialize_playoffs,
    serialize_roster,
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
    LeaguePositionalAggregate,
    SeasonPositionalStats,
    SeasonScoreboard,
    SeasonTeams,
    TeamHub,
    UpdateLeagueRequest,
    UserResponse,
    WeekBoxScores,
)

app = FastAPI(title="espn_fantasy_stats")

app.add_middleware(
    SessionMiddleware,
    secret_key=SECRET_KEY,
    same_site=COOKIE_SAME_SITE,
    https_only=COOKIE_SECURE,
    max_age=60 * 60 * 24 * 30,  # 30 days
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
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
            id=r.id,
            espn_league_id=r.espn_league_id,
            display_name=r.display_name,
            favorite_owner_id=r.favorite_owner_id,
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
    row = (
        db.query(LeagueModel)
        .filter(LeagueModel.id == league_row_id, LeagueModel.user_id == user.id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="League not found")
    if payload.display_name is not None:
        row.display_name = payload.display_name
    if payload.espn_s2 is not None:
        row.espn_s2_encrypted = encrypt(payload.espn_s2) if payload.espn_s2 else None
    if payload.swid is not None:
        row.swid_encrypted = encrypt(payload.swid) if payload.swid else None
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


def _get_season_box_scores(
    league_id: int, year: int, week: int, espn_s2: str | None, swid: str | None,
    refresh: bool = False,
) -> dict:
    """Cached per-week box scores (the same payload the API endpoint serves)."""
    from .espn_client import serialize_box_scores as _ser  # local import for clarity
    cache_key = f"box_scores_v1_w{week}"
    if not refresh:
        cached = cache.get(league_id, year, cache_key)
        if cached:
            return cached
    league = get_league(league_id, year, espn_s2=espn_s2, swid=swid)
    matchups = _ser(league, week)
    payload = {
        "league_id": league_id,
        "year": year,
        "week": week,
        "matchups": matchups,
    }
    cache.put(league_id, year, cache_key, payload)
    return payload


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
        cached = cache.get(league_id, year, "positional_stats_v3")
        if cached:
            return cached

    teams_payload = _get_season_teams(league_id, year, espn_s2, swid, refresh)
    matchups = _get_season_matchups(league_id, year, espn_s2, swid, refresh)

    league = get_league(league_id, year, espn_s2=espn_s2, swid=swid)
    reg_season_count = league.settings.reg_season_count
    playoff_team_count = league.settings.playoff_team_count
    total_weeks = max((len(t.outcomes) for t in league.teams), default=0)

    # Build per-week set of team_ids that played a real championship-bracket game.
    championship_teams_by_week: dict[int, set[int]] = {}
    for m in matchups:
        if m.get("round_label") in {"playoff", "semifinal", "championship"}:
            championship_teams_by_week.setdefault(m["week"], set()).update(
                {m["team_a_id"], m["team_b_id"]}
            )

    # team_id -> position -> { tot_pts, tot_games, po_pts, po_games }
    acc: dict[int, dict[str, dict]] = {}

    for week in range(1, total_weeks + 1):
        try:
            bs = _get_season_box_scores(league_id, year, week, espn_s2, swid, refresh)
        except Exception:
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
    }
    cache.put(league_id, year, "positional_stats_v3", payload)
    return payload


def _get_season_scoreboard(
    league_id: int, year: int, espn_s2: str | None, swid: str | None, refresh: bool = False
) -> dict:
    if not refresh:
        cached = cache.get(league_id, year, "scoreboard_v2")
        if cached:
            return cached
    league = get_league(league_id, year, espn_s2=espn_s2, swid=swid)
    data = serialize_scoreboard(league, year)
    payload = {"league_id": league_id, **data}
    cache.put(league_id, year, "scoreboard_v2", payload)
    return payload


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
    try:
        return _get_season_scoreboard(ctx.espn_league_id, year, ctx.espn_s2, ctx.swid, refresh)
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
    "/api/leagues/{league_id}/seasons/{year}/positional_stats",
    response_model=SeasonPositionalStats,
)
def positional_stats_for_year(
    year: int,
    refresh: bool = False,
    ctx: LeagueContext = Depends(get_user_league),
):
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
        raise HTTPException(status_code=502, detail=f"ESPN error: {e}")


@app.get(
    "/api/leagues/{league_id}/positional_stats/aggregate",
    response_model=LeaguePositionalAggregate,
)
def positional_stats_aggregate(
    refresh: bool = False,
    ctx: LeagueContext = Depends(get_user_league),
):
    try:
        all_years = discover_years(
            ctx.espn_league_id, espn_s2=ctx.espn_s2, swid=ctx.swid
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not discover years: {e}")

    years = [y for y in all_years if y >= 2019]
    if not years:
        raise HTTPException(
            status_code=400,
            detail="No seasons with box-score data (2019+) found.",
        )

    # Aggregate per position per owner across years.
    # owners[pos][owner_id] = {meta + tallies}
    by_pos: dict[str, dict[str, dict]] = {p: {} for p in POSITIONS_ORDER}

    for year in years:
        try:
            season = _compute_positional_stats_for_year(
                ctx.espn_league_id, year, ctx.espn_s2, ctx.swid, refresh
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"ESPN error for {year}: {e}")
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
    }


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
    try:
        all_years = discover_years(ctx.espn_league_id, espn_s2=ctx.espn_s2, swid=ctx.swid)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not discover years: {e}")

    # Gather every season this owner played in.
    seasons_by_year: dict[int, dict] = {}
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
    finishes = [
        (td["final_standing"] or td["standing"])
        for td in seasons_by_year.values()
        if (td["final_standing"] or td["standing"])
    ]
    avg_finish = sum(finishes) / len(finishes) if finishes else 0.0
    total_pf = sum(td["points_for"] for td in seasons_by_year.values())
    total_games = sum(
        td["wins"] + td["losses"] + td["ties"] for td in seasons_by_year.values()
    )
    career_avg_pf = total_pf / total_games if total_games else 0.0

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

    # Schedule: every game (and bye) for the team that year, in week order.
    # Also derive last_matchup from this same loop (most recent non-bye game).
    schedule: list[dict] = []
    last_matchup: dict | None = None
    try:
        sb = _get_season_scoreboard(
            ctx.espn_league_id, selected_year, ctx.espn_s2, ctx.swid, refresh
        )
        team_id = selected_td["team_id"]
        my_games = [
            m
            for m in sb["matchups"]
            if m["team_a_id"] == team_id or m["team_b_id"] == team_id
        ]
        my_games.sort(key=lambda x: x["week"])

        for m in my_games:
            if m["is_bye"]:
                schedule.append({
                    "week": m["week"],
                    "round_label": m.get("round_label", "regular"),
                    "is_playoff": m["is_playoff"],
                    "is_bye": True,
                    "own_team_id": team_id,
                    "own_team_name": m["team_a_name"],
                    "own_score": m["team_a_score"],
                    "opp_team_id": None,
                    "opp_team_name": "",
                    "opp_owner_name": "",
                    "opp_score": 0.0,
                    "result": "BYE",
                })
                continue

            if m["team_a_id"] == team_id:
                own_id, own_name, own_score = (
                    m["team_a_id"], m["team_a_name"], m["team_a_score"],
                )
                opp_id, opp_name, opp_owner, opp_score = (
                    m["team_b_id"], m["team_b_name"], m["team_b_owner"], m["team_b_score"],
                )
            else:
                own_id, own_name, own_score = (
                    m["team_b_id"], m["team_b_name"], m["team_b_score"],
                )
                opp_id, opp_name, opp_owner, opp_score = (
                    m["team_a_id"], m["team_a_name"], m["team_a_owner"], m["team_a_score"],
                )

            if m["winner_id"] == own_id:
                result = "W"
            elif m["winner_id"] == opp_id:
                result = "L"
            elif m["winner_id"] is None and own_score == opp_score:
                result = "T"
            else:
                result = "U"

            game = {
                "week": m["week"],
                "round_label": m.get("round_label", "regular"),
                "is_playoff": m["is_playoff"],
                "is_bye": False,
                "own_team_id": own_id,
                "own_team_name": own_name,
                "own_score": own_score,
                "opp_team_id": opp_id,
                "opp_team_name": opp_name,
                "opp_owner_name": opp_owner,
                "opp_score": opp_score,
                "result": result,
            }
            schedule.append(game)
            last_matchup = {"year": selected_year, **game}
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
        "available_years": available_years,
        "roster": roster,
        "last_matchup": last_matchup,
        "schedule": schedule,
    }


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
