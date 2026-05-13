from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import cache
from .config import LEAGUE_ID
from .espn_client import get_league, serialize_teams
from .schemas import SeasonTeams

app = FastAPI(title="espn_fantasy_stats")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/config")
def config():
    return {"league_id": LEAGUE_ID}


@app.get("/api/leagues/{league_id}/seasons/{year}/teams", response_model=SeasonTeams)
def teams(league_id: int, year: int, refresh: bool = False):
    if not refresh:
        cached = cache.get(league_id, year, "teams_v2")
        if cached:
            return cached

    try:
        league = get_league(league_id, year)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ESPN error: {e}")

    payload = {
        "league_id": league_id,
        "year": year,
        "teams": serialize_teams(league),
    }
    cache.put(league_id, year, "teams_v2", payload)
    return payload
