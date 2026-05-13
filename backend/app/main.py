from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import cache
from .config import LEAGUE_ID
from .espn_client import aggregate_by_owner, get_league, serialize_teams
from .schemas import LeagueAggregate, SeasonTeams

app = FastAPI(title="espn_fantasy_stats")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DEFAULT_START_YEAR = 2016
DEFAULT_END_YEAR = 2024


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


@app.get("/api/config")
def config():
    return {
        "league_id": LEAGUE_ID,
        "start_year": DEFAULT_START_YEAR,
        "end_year": DEFAULT_END_YEAR,
    }


@app.get("/api/leagues/{league_id}/seasons/{year}/teams", response_model=SeasonTeams)
def teams(league_id: int, year: int, refresh: bool = False):
    try:
        return _get_season_teams(league_id, year, refresh)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ESPN error: {e}")


@app.get("/api/leagues/{league_id}/aggregate", response_model=LeagueAggregate)
def aggregate(
    league_id: int,
    start_year: int = DEFAULT_START_YEAR,
    end_year: int = DEFAULT_END_YEAR,
    refresh: bool = False,
):
    years = list(range(start_year, end_year + 1))
    seasons = []
    for year in years:
        try:
            seasons.append(_get_season_teams(league_id, year, refresh))
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"ESPN error for {year}: {e}")

    return {
        "league_id": league_id,
        "start_year": start_year,
        "end_year": end_year,
        "years": years,
        "owners": aggregate_by_owner(seasons),
    }
