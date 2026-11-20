"""espn_client's serializers and aggregations, on small stand-ins for
espn_api's objects: how matchups are deduplicated and labelled by playoff
round, close-game records, and positional points per week."""

from types import SimpleNamespace as NS

from app.espn_client import close_game_records, compute_positional_week_points, serialize_all_matchups


def team(tid, standing, opponents, outcomes, scores):
    return NS(team_id=tid, standing=standing, schedule=[NS(team_id=o) for o in opponents],
              outcomes=outcomes, scores=scores)


def four_team_league():
    """Two regular-season weeks, then a four-team bracket: semifinals in
    week 3 (1 beats 4, 2 beats 3) and the final in week 4 (1 beats 2), with
    3 and 4 playing for third. Team 4 drew in week 1."""
    teams = [
        team(1, 1, [2, 3, 4, 2], ["W", "W", "W", "W"], [110.0, 120.0, 130.0, 140.0]),
        team(2, 2, [1, 4, 3, 1], ["L", "W", "W", "L"], [100.0, 115.0, 125.0, 120.0]),
        team(3, 3, [4, 1, 2, 4], ["T", "L", "L", "W"], [90.0, 95.0, 105.0, 99.0]),
        team(4, 4, [3, 2, 1, 3], ["T", "L", "L", "L"], [90.0, 80.0, 85.0, 98.0]),
    ]
    return NS(teams=teams, settings=NS(reg_season_count=2, playoff_team_count=4))


def by_week_pair(matchups):
    return {(m["week"], frozenset((m["team_a_id"], m["team_b_id"]))): m for m in matchups}


def test_each_game_appears_once_with_its_winner():
    matchups = serialize_all_matchups(four_team_league())
    assert len(matchups) == 8  # 4 weeks x 2 games, not once per team
    games = by_week_pair(matchups)
    assert games[(1, frozenset((1, 2)))]["winner_id"] == 1
    tie = games[(1, frozenset((3, 4)))]
    assert tie["winner_id"] is None and tie["team_a_score"] == tie["team_b_score"] == 90.0
    assert not games[(2, frozenset((1, 3)))]["is_playoff"] and games[(3, frozenset((1, 4)))]["is_playoff"]


def test_playoff_rounds_follow_who_is_still_alive():
    games = by_week_pair(serialize_all_matchups(four_team_league()))
    assert games[(2, frozenset((2, 4)))]["round_label"] == "regular"
    assert games[(3, frozenset((1, 4)))]["round_label"] == "semifinal"
    assert games[(3, frozenset((2, 3)))]["round_label"] == "semifinal"
    assert games[(4, frozenset((1, 2)))]["round_label"] == "championship"
    # Both lost their semifinal: the third-place game is consolation.
    assert games[(4, frozenset((3, 4)))]["round_label"] == "consolation"


def test_teams_out_of_the_playoffs_play_consolation_from_the_start():
    league = four_team_league()
    league.settings.playoff_team_count = 2  # only 1 and 2 make it
    games = by_week_pair(serialize_all_matchups(league))
    assert games[(3, frozenset((2, 3)))]["round_label"] == "consolation"  # 3 was never in
    assert games[(4, frozenset((1, 2)))]["round_label"] == "championship"


def test_close_games_count_regular_season_games_played():
    matchups = serialize_all_matchups(four_team_league())
    records = close_game_records(matchups, games_played=2)
    # Week 1: 1 beat 2 by 10 (not close), 3 and 4 tied. Week 2: 2 beat 4 by
    # 35, 1 beat 3 by 25. Playoff weeks never count.
    assert records == {3: {"wins": 0, "losses": 0, "ties": 1}, 4: {"wins": 0, "losses": 0, "ties": 1}}
    # A wider margin brings in week 1's 10-point game.
    wide = close_game_records(matchups, games_played=2, margin=11)
    assert wide[1] == {"wins": 1, "losses": 0, "ties": 0} and wide[2] == {"wins": 0, "losses": 1, "ties": 0}
    # Weeks past games_played (unplayed, or in progress) never count.
    assert close_game_records(matchups, games_played=0) == {}


def test_positional_points_credit_flex_starts_to_both_buckets():
    week = {"matchups": [{"home": {"team_id": 1, "lineup": [
        {"slot_position": "QB", "position": "QB", "points": 20.0},
        {"slot_position": "RB/WR/TE", "position": "WR", "points": 12.5},
        {"slot_position": "WR", "position": "WR", "points": 7.5},
        {"slot_position": "BE", "position": "RB", "points": 30.0},
        {"slot_position": "IR", "position": "TE", "points": 4.0},
    ]}, "away": None}]}
    assert compute_positional_week_points(week) == {1: {"QB": 20.0, "FLEX": 12.5, "WR": 20.0}}
