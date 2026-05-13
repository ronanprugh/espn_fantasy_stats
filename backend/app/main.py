from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import cache
from .config import LEAGUE_ID
from .espn_client import (
    aggregate_by_owner,
    build_owner_history,
    discover_years,
    get_league,
    serialize_all_matchups,
    serialize_playoffs,
    serialize_teams,
)
from .schemas import (
    HeadToHeadStats,
    LeagueAggregate,
    LeagueOwnerHistory,
    SeasonPlayoffs,
    SeasonTeams,
)

app = FastAPI(title="espn_fantasy_stats")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _get_season_teams(league_id: int, year: int, refresh: bool = False) -> dict:
    if not refresh:
        cached = cache.get(league_id, year, "teams_v2")
        if cached:
            return cached

    league = get_league(league_id, year)
    payload = {
        "league_id": league_id,
        "year": year,
        "teams": serialize_teams(league),
    }
    cache.put(league_id, year, "teams_v2", payload)
    return payload


def _get_season_matchups(league_id: int, year: int, refresh: bool = False) -> list[dict]:
    if not refresh:
        cached = cache.get(league_id, year, "matchups_v1")
        if cached:
            return cached["matchups"]

    league = get_league(league_id, year)
    matchups = serialize_all_matchups(league)
    cache.put(league_id, year, "matchups_v1", {"matchups": matchups})
    return matchups


@app.get("/api/config")
def config():
    try:
        years = discover_years(LEAGUE_ID)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not discover league years: {e}")
    return {
        "league_id": LEAGUE_ID,
        "years": years,
    }


@app.get("/api/leagues/{league_id}/seasons/{year}/teams", response_model=SeasonTeams)
def teams(league_id: int, year: int, refresh: bool = False):
    try:
        return _get_season_teams(league_id, year, refresh)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ESPN error: {e}")


@app.get("/api/leagues/{league_id}/head_to_head", response_model=HeadToHeadStats)
def head_to_head(league_id: int, owner_a: str, owner_b: str, refresh: bool = False):
    if owner_a == owner_b:
        raise HTTPException(status_code=400, detail="owner_a and owner_b must differ")
    try:
        years = discover_years(league_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not discover league years: {e}")

    matchups: list[dict] = []
    owner_a_name = owner_b_name = ""
    owner_a_team_name = owner_b_team_name = ""

    for year in years:
        try:
            teams_payload = _get_season_teams(league_id, year, refresh)
            season_matchups = _get_season_matchups(league_id, year, refresh)
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"ESPN error for {year}: {e}")

        team_a_in_season = next(
            (t for t in teams_payload["teams"] if t["owners"] and t["owners"][0]["id"] == owner_a),
            None,
        )
        team_b_in_season = next(
            (t for t in teams_payload["teams"] if t["owners"] and t["owners"][0]["id"] == owner_b),
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


@app.get("/api/leagues/{league_id}/owner_history", response_model=LeagueOwnerHistory)
def owner_history(league_id: int, refresh: bool = False):
    try:
        years = discover_years(league_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not discover league years: {e}")

    seasons = []
    for year in years:
        try:
            seasons.append(_get_season_teams(league_id, year, refresh))
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"ESPN error for {year}: {e}")

    return {
        "league_id": league_id,
        "years": years,
        "owners": build_owner_history(seasons),
    }


@app.get(
    "/api/leagues/{league_id}/seasons/{year}/playoffs",
    response_model=SeasonPlayoffs,
)
def playoffs(league_id: int, year: int, refresh: bool = False):
    if not refresh:
        cached = cache.get(league_id, year, "playoffs_v1")
        if cached:
            return cached
    try:
        league = get_league(league_id, year)
        data = serialize_playoffs(league)
        payload = {"league_id": league_id, "year": year, **data}
        cache.put(league_id, year, "playoffs_v1", payload)
        return payload
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ESPN error: {e}")


@app.get("/api/leagues/{league_id}/aggregate", response_model=LeagueAggregate)
def aggregate(
    league_id: int,
    start_year: int | None = None,
    end_year: int | None = None,
    refresh: bool = False,
):
    try:
        available = discover_years(league_id)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not discover league years: {e}")

    sy = start_year if start_year is not None else available[0]
    ey = end_year if end_year is not None else available[-1]
    years = [y for y in available if sy <= y <= ey]

    seasons = []
    for year in years:
        try:
            seasons.append(_get_season_teams(league_id, year, refresh))
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"ESPN error for {year}: {e}")

    return {
        "league_id": league_id,
        "start_year": sy,
        "end_year": ey,
        "years": years,
        "owners": aggregate_by_owner(seasons),
    }
