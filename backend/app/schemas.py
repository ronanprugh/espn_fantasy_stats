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
    playoff_wins: int
    playoff_losses: int
    points_for: float
    points_against: float
    avg_points_for: float
    avg_points_against: float
    avg_plus_minus: float
    final_standing: int
    standing: int
    scores: List[float]


class SeasonTeams(BaseModel):
    league_id: int
    year: int
    teams: List[Team]


class OwnerAggregate(BaseModel):
    owner_id: str
    owner_name: str
    team_names: List[str]
    seasons_played: int
    avg_finish: float
    wins: int
    losses: int
    ties: int
    playoff_wins: int
    playoff_losses: int
    points_for: float
    points_against: float
    avg_points_for: float
    avg_points_against: float
    avg_plus_minus: float


class LeagueAggregate(BaseModel):
    league_id: int
    start_year: int
    end_year: int
    years: List[int]
    owners: List[OwnerAggregate]


class PlayoffTeam(BaseModel):
    team_id: int
    team_name: str
    owner_name: str
    seed: int
    final_standing: int


class PlayoffMatchup(BaseModel):
    week: int
    team_a_id: int
    team_b_id: int
    team_a_score: float
    team_b_score: float
    is_bye: bool
    winner_id: int | None


class SeasonPlayoffs(BaseModel):
    league_id: int
    year: int
    playoff_team_count: int
    reg_season_count: int
    playoff_weeks: List[int]
    teams: List[PlayoffTeam]
    matchups: List[PlayoffMatchup]
