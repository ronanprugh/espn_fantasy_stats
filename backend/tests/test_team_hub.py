from app.espn_client import aggregate_by_owner
from app.season_state import is_decided, result_for
from app.team_hub import career_records, team_schedule


def _game(week, a, a_pts, b, b_pts, winner, round_label="regular"):
    return {
        "week": week, "is_playoff": round_label != "regular", "round_label": round_label,
        "is_bye": False,
        "team_a_id": a, "team_a_name": f"Team {a}", "team_a_owner": f"Owner {a}", "team_a_score": a_pts,
        "team_b_id": b, "team_b_name": f"Team {b}", "team_b_owner": f"Owner {b}", "team_b_score": b_pts,
        "winner_id": winner,
    }


# A live season for team 1: two results, a game being played, two future weeks.
LIVE = [
    _game(1, 1, 120.0, 2, 100.0, 1),
    _game(2, 3, 110.0, 1, 90.0, 3),
    _game(3, 1, 40.5, 4, 22.0, None),   # being played
    _game(4, 1, 0.0, 2, 0.0, None),     # future
    _game(5, 3, 0.0, 1, 0.0, None),     # future
]


def test_is_decided_and_result_for():
    assert is_decided(LIVE[0]) and result_for(LIVE[0], 1) == "W"
    assert result_for(LIVE[1], 1) == "L"
    assert not is_decided(LIVE[2]) and result_for(LIVE[2], 1) == "U"
    assert not is_decided(LIVE[3]) and result_for(LIVE[3], 1) == "U"
    tie = _game(6, 1, 99.5, 2, 99.5, None)
    assert is_decided(tie) and result_for(tie, 1) == "T"


def test_records_ignore_future_and_live_games():
    r = career_records([(2026, 1, LIVE)])
    # Before: the future weeks' 0.0 was the lowest score.
    assert r["lowest_score"]["value"] == 90.0
    assert r["highest_score"]["value"] == 120.0
    # The live game's partial 40.5–22.0 isn't the biggest win.
    assert r["biggest_win_margin"]["value"] == 20.0
    assert r["biggest_loss_margin"]["value"] == 20.0


def test_streaks_are_not_broken_by_future_weeks():
    past = [_game(w, 1, 100.0 + w, 2, 90.0, 1) for w in range(1, 4)]
    live = [_game(1, 1, 101.0, 2, 90.0, 1), _game(2, 1, 0.0, 2, 0.0, None), _game(3, 1, 0.0, 2, 0.0, None)]
    r = career_records([(2025, 1, past), (2026, 1, live)])
    assert r["longest_win_streak"] == 4


def test_schedule_marks_future_games_unplayed_and_finds_the_latest_game():
    schedule, latest = team_schedule(LIVE, 1)
    assert [g["result"] for g in schedule] == ["W", "L", "U", "U", "U"]
    # The latest game with points is the one being played, not week 5.
    assert latest["week"] == 3
    assert latest["opp_team_name"] == "Team 4"


def test_schedule_before_any_game_has_no_latest():
    _, latest = team_schedule([_game(1, 1, 0.0, 2, 0.0, None)], 1)
    assert latest is None


def _teams(rows):
    return {"teams": [
        {"team_id": tid, "team_name": f"t{tid}", "owners": [{"id": oid, "first_name": "O", "last_name": oid}],
         "wins": 1, "losses": 1, "ties": 0, "playoff_wins": 0, "playoff_losses": 0,
         "points_for": 200.0, "points_against": 200.0, "standing": standing, "final_standing": final}
        for tid, oid, standing, final in rows
    ]}


def test_average_finish_counts_finished_seasons_only():
    seasons = [
        _teams([(1, "o1", 2, 3), (2, "o2", 1, 1)]),
        # In progress: o1 leads, but that's a standing, not a finish.
        _teams([(1, "o1", 1, 0), (2, "o2", 2, 0)]),
    ]
    by_owner = {r["owner_id"]: r for r in aggregate_by_owner(seasons)}
    assert by_owner["o1"]["avg_finish"] == 3.0
    assert by_owner["o1"]["seasons_played"] == 2


def test_average_finish_is_zero_without_a_finished_season():
    rows = aggregate_by_owner([_teams([(1, "o1", 1, 0), (2, "o2", 2, 0)])])
    assert all(r["avg_finish"] == 0.0 for r in rows)


def test_team_hub_endpoint_in_a_live_season(monkeypatch):
    from fastapi.testclient import TestClient

    from app import main

    def team(tid, oid, standing, final):
        return {
            "team_id": tid, "team_name": f"Team {tid}", "standing": standing,
            "final_standing": final, "wins": 1, "losses": 1, "ties": 0,
            "playoff_wins": 0, "playoff_losses": 0, "points_for": 210.0,
            "points_against": 210.0, "avg_points_for": 105.0,
            "avg_points_against": 105.0, "avg_plus_minus": 0.0,
            "owners": [{"id": oid, "first_name": "Owner", "last_name": oid}],
        }

    payloads = {
        2025: {"scoring_type": "ppr", "teams": [team(1, "o1", 1, 4), team(2, "o2", 2, 1)]},
        2026: {"scoring_type": "ppr", "teams": [team(1, "o1", 1, 0), team(2, "o2", 2, 0)]},
    }
    boards = {
        2025: {"matchups": [_game(1, 1, 95.0, 2, 100.0, 2)]},
        2026: {"matchups": LIVE},
    }

    def no_league(*a, **k):
        raise RuntimeError("no ESPN in tests")

    ctx = main.LeagueContext(espn_league_id=1, espn_s2=None, swid=None, display_name="Test League")
    monkeypatch.setattr(main, "discover_years", lambda *a, **k: [2025, 2026])
    monkeypatch.setattr(main, "_get_season_teams", lambda lid, y, *a, **k: payloads[y])
    monkeypatch.setattr(main, "_get_season_scoreboard", lambda lid, y, *a, **k: boards[y])
    monkeypatch.setattr(main, "get_league", no_league)
    main.app.dependency_overrides[main.get_user_league] = lambda: ctx
    try:
        r = TestClient(main.app).get("/api/leagues/1/owners/o1/hub")
        assert r.status_code == 200, r.text
        hub = r.json()
        assert hub["records"]["lowest_score"]["value"] == 90.0
        assert [g["result"] for g in hub["schedule"]] == ["W", "L", "U", "U", "U"]
        assert hub["last_matchup"]["week"] == 3
        # 4th in 2025; 2026's 1st place is a standing, not a finish.
        assert hub["avg_finish"] == 4.0
    finally:
        main.app.dependency_overrides.clear()
