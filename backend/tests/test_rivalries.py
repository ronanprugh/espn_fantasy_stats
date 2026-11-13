from fastapi.testclient import TestClient

from app import main
from app.rivalries import is_unplayed, rivalry_summary


def _teams(owners_by_team):
    """{team_id: owner_id} → a season's teams payload."""
    return {"teams": [
        {"team_id": tid, "team_name": f"{oid} team {tid}",
         "owners": [{"id": oid, "first_name": "Owner", "last_name": oid}]}
        for tid, oid in owners_by_team.items()
    ]}


def _game(week, a, a_pts, b, b_pts, playoff=False, played=True):
    if not played:
        return {"week": week, "is_playoff": playoff, "team_a_id": a, "team_b_id": b,
                "team_a_score": 0.0, "team_b_score": 0.0, "winner_id": None}
    winner = a if a_pts > b_pts else b if b_pts > a_pts else None
    return {"week": week, "is_playoff": playoff, "team_a_id": a, "team_b_id": b,
            "team_a_score": a_pts, "team_b_score": b_pts, "winner_id": winner}


# Two seasons. Team ids change hands: in 2023 o1 is team 1, in 2024 team 3.
SEASONS = [
    (2023, _teams({1: "o1", 2: "o2", 3: "o3", 4: "o4"}), [
        _game(1, 1, 100, 2, 90),
        _game(2, 3, 120, 1, 110),
        _game(3, 2, 95, 1, 95),            # tie
        _game(15, 1, 130, 2, 100, playoff=True),
    ]),
    (2024, _teams({3: "o1", 1: "o2", 2: "o3", 4: "o4"}), [
        _game(1, 3, 105, 1, 101),           # o1 (team 3) beats o2 (team 1)
        _game(2, 2, 99, 3, 98),             # o3 (team 2) beats o1
        _game(9, 3, 0, 1, 0, played=False),  # future game: skipped
    ]),
]


def _row(summary, oid):
    return next(r for r in summary["opponents"] if r["opponent_id"] == oid)


def test_matches_meetings_by_owner_across_changing_team_ids():
    s = rivalry_summary("o1", SEASONS)
    o2 = _row(s, "o2")
    assert (o2["meetings"], o2["wins"], o2["losses"], o2["ties"]) == (4, 3, 0, 1)
    o3 = _row(s, "o3")
    assert (o3["meetings"], o3["wins"], o3["losses"]) == (2, 0, 2)


def test_points_averages_and_playoffs():
    o2 = _row(rivalry_summary("o1", SEASONS), "o2")
    assert o2["points_for"] == 100 + 95 + 130 + 105
    assert o2["points_against"] == 90 + 95 + 100 + 101
    assert o2["avg_pf"] == round(430 / 4, 2)
    assert (o2["playoff_meetings"], o2["playoff_wins"], o2["playoff_losses"]) == (1, 1, 0)


def test_last_meeting_is_the_latest_played_game():
    o2 = _row(rivalry_summary("o1", SEASONS), "o2")
    assert o2["last_meeting"]["year"] == 2024 and o2["last_meeting"]["week"] == 1
    assert o2["last_meeting"]["result"] == "W"
    assert (o2["last_meeting"]["own_team_id"], o2["last_meeting"]["opponent_team_id"]) == (3, 1)


def test_unplayed_games_are_skipped():
    assert is_unplayed(SEASONS[1][2][2])
    assert not is_unplayed(SEASONS[0][2][2])  # a real tie has points


def test_everyone_gets_a_row_sorted_by_meetings():
    s = rivalry_summary("o1", SEASONS)
    assert [r["opponent_id"] for r in s["opponents"]] == ["o2", "o3", "o4"]
    o4 = _row(s, "o4")
    assert o4["meetings"] == 0 and o4["avg_pf"] is None and o4["last_meeting"] is None
    assert s["owner_name"] == "Owner o1" and s["owner_team_name"] == "o1 team 3"


def test_summary_endpoint(monkeypatch):
    by_year = {y: (t, m) for y, t, m in SEASONS}
    ctx = main.LeagueContext(espn_league_id=1, espn_s2=None, swid=None, display_name="Test League")
    monkeypatch.setattr(main, "discover_years", lambda *a, **k: [2023, 2024])
    monkeypatch.setattr(main, "_get_season_teams", lambda lid, y, *a, **k: by_year[y][0])
    monkeypatch.setattr(main, "_get_season_matchups", lambda lid, y, *a, **k: by_year[y][1])
    main.app.dependency_overrides[main.get_user_league] = lambda: ctx
    try:
        client = TestClient(main.app)
        r = client.get("/api/leagues/1/head_to_head/summary", params={"owner": "o1"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["owner_id"] == "o1"
        assert [o["opponent_id"] for o in body["opponents"]] == ["o2", "o3", "o4"]
        assert body["opponents"][0]["wins"] == 3
    finally:
        main.app.dependency_overrides.clear()
