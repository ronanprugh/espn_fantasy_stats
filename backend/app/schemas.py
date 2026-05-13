from pydantic import BaseModel
from typing import List


class Owner(BaseModel):
    id: str
    first_name: str
    last_name: str


class Team(BaseModel):
    team_id: int
    team_name: str
    abbrev: str
    owners: List[Owner]
    wins: int
    losses: int
    ties: int
    points_for: float
    points_against: float
    final_standing: int
    standing: int
    scores: List[float]


class SeasonTeams(BaseModel):
    league_id: int
    year: int
    teams: List[Team]
