from app.espn_client import build_owner_history


def _team(tid, oid, standing, final):
    return {
        "team_id": tid, "team_name": f"team {tid}", "standing": standing,
        "final_standing": final, "wins": 1, "losses": 1, "ties": 0,
        "playoff_wins": 0, "playoff_losses": 0, "points_for": 200.0,
        "points_against": 190.0, "avg_points_for": 100.0,
        "avg_points_against": 95.0, "avg_plus_minus": 5.0,
        "owners": [{"id": oid, "first_name": "Owner", "last_name": oid}],
    }


def test_in_progress_marks_the_whole_season():
    seasons = [
        {"year": 2024, "teams": [_team(1, "o1", 2, 1), _team(2, "o2", 1, 2)]},
        # One team still without a final standing makes the season current for
        # everyone, even the team that happens to have one.
        {"year": 2025, "teams": [_team(1, "o1", 1, 0), _team(2, "o2", 2, 2)]},
    ]
    owners = {o["owner_id"]: o for o in build_owner_history(seasons)}
    o1 = owners["o1"]["seasons"]
    assert [s["in_progress"] for s in o1] == [False, True]
    assert [s["in_progress"] for s in owners["o2"]["seasons"]] == [False, True]
    # final_standing falls back to the current standing while in progress.
    assert o1[1]["final_standing"] == 1
