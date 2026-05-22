from pydantic import BaseModel, Field
from typing import List


class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class UserResponse(BaseModel):
    id: int
    username: str
    is_admin: bool = False


class SignupRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64)
    password: str = Field(min_length=8)
    invite_code: str


class GenerateInviteRequest(BaseModel):
    expires_in_hours: int = Field(..., description="Must be 1, 6, 12, or 24")
    max_uses: int = Field(default=1, ge=1)


class InviteCodeResponse(BaseModel):
    code: str
    expires_at: str


class LeagueSummary(BaseModel):
    id: int
    espn_league_id: int
    display_name: str
    favorite_owner_id: str | None = None


class CreateLeagueRequest(BaseModel):
    espn_league_id: int
    display_name: str
    espn_s2: str | None = None
    swid: str | None = None


class UpdateLeagueRequest(BaseModel):
    display_name: str | None = None
    espn_s2: str | None = None
    swid: str | None = None
    favorite_owner_id: str | None = None
    # When True, clears the favorite. (Distinguishes from "leave unchanged".)
    clear_favorite: bool = False


class LeagueInfo(BaseModel):
    espn_league_id: int
    display_name: str
    years: List[int]


class TeamHubPlayer(BaseModel):
    name: str
    player_id: int
    position: str
    lineup_slot: str
    pro_team: str
    total_points: float
    injury_status: str = ""


class TeamHubLastMatchup(BaseModel):
    year: int
    week: int
    round_label: str
    is_playoff: bool
    own_team_id: int
    own_team_name: str
    own_score: float
    opp_team_id: int
    opp_team_name: str
    opp_owner_name: str
    opp_score: float
    result: str  # 'W', 'L', 'T', 'U'


class TeamHubAccolades(BaseModel):
    championships: int
    runner_ups: int
    third_places: int
    last_places: int
    championship_years: List[int]
    runner_up_years: List[int]
    third_place_years: List[int]
    last_place_years: List[int]


class RecordEntry(BaseModel):
    value: float
    year: int
    week: int
    opponent: str
    own_team_id: int
    opp_team_id: int


class TeamHubRecords(BaseModel):
    highest_score: RecordEntry | None
    lowest_score: RecordEntry | None
    biggest_win_margin: RecordEntry | None
    biggest_loss_margin: RecordEntry | None
    longest_win_streak: int
    longest_loss_streak: int


class TeamHubGame(BaseModel):
    """A single game on the team's season schedule."""
    week: int
    round_label: str
    is_playoff: bool
    is_bye: bool
    own_team_id: int
    own_team_name: str
    own_score: float
    opp_team_id: int | None
    opp_team_name: str
    opp_owner_name: str
    opp_score: float
    result: str  # 'W', 'L', 'T', 'U' for non-byes; 'BYE' for byes


class PositionTeamStats(BaseModel):
    team_id: int
    team_name: str
    owner_id: str
    owner_name: str
    total_points: float
    games_played: int
    avg_ppg: float
    playoff_points: float
    playoff_games: int
    playoff_ppg: float
    made_playoffs: bool


class SeasonPositionStats(BaseModel):
    position: str
    teams: List[PositionTeamStats]


class SeasonPositionalStats(BaseModel):
    league_id: int
    year: int
    reg_season_count: int
    positions: List[SeasonPositionStats]


class PositionOwnerAggregate(BaseModel):
    owner_id: str
    owner_name: str
    current_team_name: str
    seasons_with_data: int
    total_points: float
    games_played: int
    avg_ppg: float
    playoff_points: float
    playoff_games: int
    playoff_ppg: float


class PositionAggregate(BaseModel):
    position: str
    owners: List[PositionOwnerAggregate]


class LeaguePositionalAggregate(BaseModel):
    league_id: int
    years: List[int]
    positions: List[PositionAggregate]


class TeamHub(BaseModel):
    owner_id: str
    owner_name: str
    current_team_name: str  # most-recent team name (stable identity)

    # Year-specific (what the page is currently displaying)
    selected_year: int
    selected_team_id: int
    selected_team_name: str
    selected_finish: int
    selected_avg_pf: float

    # All-time aggregates (don't change as the year selector moves)
    seasons_played: int
    avg_finish: float
    career_avg_pf: float

    # Years this owner has data for, ascending — for the year dropdown
    available_years: List[int]

    roster: List[TeamHubPlayer]
    last_matchup: TeamHubLastMatchup | None
    schedule: List[TeamHubGame]
    accolades: TeamHubAccolades
    records: TeamHubRecords


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
    round_label: str
    owner_a_team_id: int
    owner_b_team_id: int
    owner_a_team_name: str
    owner_b_team_name: str
    owner_a_score: float
    owner_b_score: float
    winner_owner_id: str | None


class ScoreboardMatchup(BaseModel):
    week: int
    is_playoff: bool
    round_label: str
    is_bye: bool
    team_a_id: int
    team_a_name: str
    team_a_owner: str
    team_a_score: float
    team_b_id: int
    team_b_name: str
    team_b_owner: str
    team_b_score: float
    winner_id: int | None


class SeasonScoreboard(BaseModel):
    league_id: int
    year: int
    weeks: List[int]
    matchups: List[ScoreboardMatchup]


class BoxPlayer(BaseModel):
    name: str
    player_id: int
    position: str
    slot_position: str
    pro_team: str
    points: float
    projected_points: float


class BoxScoreTeam(BaseModel):
    team_id: int
    team_name: str
    owner_name: str
    total_points: float
    projected_points: float
    lineup: List[BoxPlayer]


class BoxScoreMatchup(BaseModel):
    week: int
    is_playoff: bool
    matchup_type: str
    home: BoxScoreTeam | None
    away: BoxScoreTeam | None


class WeekBoxScores(BaseModel):
    league_id: int
    year: int
    week: int
    matchups: List[BoxScoreMatchup]


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
