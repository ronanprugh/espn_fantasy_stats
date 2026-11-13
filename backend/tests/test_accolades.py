from app.accolades import accolades, season_over


def _season(finals):
    """A season payload from each team's final standing (0 = none yet)."""
    return {"teams": [{"team_id": i, "final_standing": f} for i, f in enumerate(finals)]}


def test_season_over_needs_every_final_standing():
    assert season_over(_season([1, 2, 3, 4]))
    assert not season_over(_season([1, 0, 3, 4]))


def test_a_season_in_progress_never_counts():
    # Leading in week 10 is not a championship; the season has no finals yet.
    live = _season([0, 0, 0, 0])
    team = {"final_standing": 0, "standing": 1}
    assert accolades([(2026, team, live)])["championships"] == 0


def test_counts_finished_seasons():
    seasons = [
        (2023, {"final_standing": 1}, _season([1, 2, 3, 4])),
        (2024, {"final_standing": 2}, _season([2, 1, 3, 4])),
        (2025, {"final_standing": 4}, _season([4, 1, 2, 3])),
        (2026, {"final_standing": 0}, _season([0, 0, 0, 0])),
    ]
    a = accolades(seasons)
    assert a["championship_years"] == [2023]
    assert a["runner_up_years"] == [2024]
    assert a["third_place_years"] == []
    assert a["last_place_years"] == [2025]


def test_last_place_is_per_season_league_size():
    # 7th of 10 is not last, even if it is this owner's worst finish.
    seasons = [
        (2023, {"final_standing": 7}, _season(list(range(1, 11)))),
        (2024, {"final_standing": 8}, _season(list(range(1, 9)))),
    ]
    assert accolades(seasons)["last_place_years"] == [2024]


def test_team_hub_endpoint_skips_the_season_in_progress(monkeypatch):
    from fastapi.testclient import TestClient

    from app import main

    def team(tid, oid, standing, final):
        return {
            "team_id": tid, "team_name": f"team {tid}", "standing": standing,
            "final_standing": final, "wins": 5, "losses": 2, "ties": 0,
            "playoff_wins": 0, "playoff_losses": 0, "points_for": 700.0,
            "points_against": 650.0, "avg_points_for": 100.0,
            "avg_points_against": 92.9, "avg_plus_minus": 7.1,
            "owners": [{"id": oid, "first_name": "Owner", "last_name": oid}],
        }

    payloads = {
        # o1 won 2025...
        2025: {"scoring_type": "ppr", "teams": [team(1, "o1", 2, 1), team(2, "o2", 1, 2)]},
        # ...and leads 2026, which has no final standings yet.
        2026: {"scoring_type": "ppr", "teams": [team(1, "o1", 1, 0), team(2, "o2", 2, 0)]},
    }

    def no_league(*a, **k):
        raise RuntimeError("no ESPN in tests")

    ctx = main.LeagueContext(espn_league_id=1, espn_s2=None, swid=None, display_name="Test League")
    monkeypatch.setattr(main, "discover_years", lambda *a, **k: [2025, 2026])
    monkeypatch.setattr(main, "_get_season_teams", lambda lid, y, *a, **k: payloads[y])
    monkeypatch.setattr(main, "_get_season_scoreboard", lambda *a, **k: {"matchups": []})
    monkeypatch.setattr(main, "get_league", no_league)
    main.app.dependency_overrides[main.get_user_league] = lambda: ctx
    try:
        r = TestClient(main.app).get("/api/leagues/1/owners/o1/hub")
        assert r.status_code == 200, r.text
        acc = r.json()["accolades"]
        assert acc["championships"] == 1
        assert acc["championship_years"] == [2025]
    finally:
        main.app.dependency_overrides.clear()
