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


class OwnerSeason(BaseModel):
    year: int
    team_name: str
    seed: int
    final_standing: int
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


class OwnerHistory(BaseModel):
    owner_id: str
    owner_name: str
    current_team_name: str
    seasons: List[OwnerSeason]


class LeagueOwnerHistory(BaseModel):
    league_id: int
    years: List[int]
    owners: List[OwnerHistory]


class HeadToHeadMatchup(BaseModel):
    year: int
    week: int
    is_playoff: bool
    owner_a_team_name: str
    owner_b_team_name: str
    owner_a_score: float
    owner_b_score: float
    winner_owner_id: str | None


class HeadToHeadStats(BaseModel):
    owner_a_id: str
    owner_b_id: str
    owner_a_name: str
    owner_b_name: str
    owner_a_team_name: str
    owner_b_team_name: str
    total_matchups: int
    owner_a_wins: int
    owner_b_wins: int
    ties: int
    owner_a_total_pf: float
    owner_b_total_pf: float
    owner_a_avg_pf: float
    owner_b_avg_pf: float
    playoff_matchups: int
    owner_a_playoff_wins: int
    owner_b_playoff_wins: int
    playoff_ties: int
    matchups: List[HeadToHeadMatchup]
