from datetime import datetime, timezone
from types import SimpleNamespace as NS

from app.trades import EASTERN, kickoff, trade_outcomes, trades_from_activity, week_of


def ms(y, mo, d, h=12):
    return int(datetime(y, mo, d, h, tzinfo=EASTERN).timestamp() * 1000)


def test_kickoff_is_the_thursday_after_labor_day():
    assert kickoff(2025).isoformat() == "2025-09-04"
    assert kickoff(2026).isoformat() == "2026-09-10"
    assert kickoff(2019).isoformat() == "2019-09-05"


def test_week_of_runs_tuesday_to_monday():
    # 2026: week 1 is Tue 8 Sep – Mon 14 Sep.
    assert week_of(ms(2026, 8, 20), 2026) == 1     # preseason counts as week 1
    assert week_of(ms(2026, 9, 8), 2026) == 1
    assert week_of(ms(2026, 9, 14), 2026) == 1
    assert week_of(ms(2026, 9, 15), 2026) == 2
    assert week_of(ms(2026, 11, 18), 2026) == 11


def team(tid, oid, name):
    return NS(team_id=tid, team_name=name, owners=[{"id": oid, "firstName": "O", "lastName": oid}])


def player(pid, name, pos):
    return NS(playerId=pid, name=name, position=pos)


A, B = team(1, "o1", "Alpha"), team(2, "o2", "Bravo")
JSN, KYREN, DAK = player(10, "Jaxon Smith-Njigba", "WR"), player(11, "Kyren Williams", "RB"), player(20, "Dak Prescott", "QB")

TRADE = NS(date=ms(2026, 10, 7), actions=[
    (A, "TRADE_SENT", JSN, 0), (B, "TRADE_RECEIVED", JSN, 0),
    (A, "TRADE_SENT", KYREN, 0), (B, "TRADE_RECEIVED", KYREN, 0),
    (B, "TRADE_SENT", DAK, 0), (A, "TRADE_RECEIVED", DAK, 0),
])


def test_trades_from_activity_groups_each_side():
    [t] = trades_from_activity([TRADE], 2026)
    assert t["week"] == 5
    by_team = {s["team_id"]: s for s in t["sides"]}
    assert [p["name"] for p in by_team[1]["received"]] == ["Dak Prescott"]
    assert [p["name"] for p in by_team[2]["received"]] == ["Jaxon Smith-Njigba", "Kyren Williams"]
    assert by_team[1]["owner_id"] == "o1" and by_team[2]["team_name"] == "Bravo"
    assert [p["name"] for p in by_team[1]["sent"]] == ["Jaxon Smith-Njigba", "Kyren Williams"]


def test_skips_activity_without_two_teams_and_unknown_players_survive():
    lone = NS(date=ms(2026, 10, 1), actions=[(A, "TRADE_SENT", JSN, 0)])
    odd = NS(date=ms(2026, 10, 2), actions=[(A, "TRADE_SENT", 999, 0), (B, "TRADE_RECEIVED", 999, 0),
                                            (B, "TRADE_SENT", DAK, 0), (A, "TRADE_RECEIVED", DAK, 0)])
    trades = trades_from_activity([lone, odd], 2026)
    assert len(trades) == 1
    bravo = [s for s in trades[0]["sides"] if s["team_id"] == 2][0]
    assert bravo["received"] == [{"player_id": 999, "name": "Player 999", "position": ""}]


def box(team_lineups):
    """{team_id: [(player_id, slot, points)]} -> one week's box score payload."""
    sides = [{"team_id": tid, "lineup": [{"player_id": p, "slot_position": s, "points": pts} for p, s, pts in lu]}
             for tid, lu in team_lineups.items()]
    return {"matchups": [{"home": sides[0], "away": sides[1] if len(sides) > 1 else None}]}


def test_outcomes_count_starts_after_the_trade_for_the_new_team():
    trades = trades_from_activity([TRADE], 2026)  # week 5
    weeks = {
        4: box({1: [(10, "WR", 30.0), (11, "RB", 20.0)], 2: [(20, "QB", 25.0)]}),  # before: ignored
        5: box({1: [(20, "QB", 24.0)], 2: [(10, "WR", 18.0), (11, "BE", 12.0)]}),
        6: box({1: [(20, "QB", 21.0)], 2: [(10, "WR", 22.0), (11, "RB", 9.0)]}),
    }
    [t] = trade_outcomes(trades, weeks)
    by_team = {s["team_id"]: s for s in t["sides"]}
    assert by_team[1]["started_points"] == 45.0
    bravo = {p["name"]: p for p in by_team[2]["received"]}
    assert bravo["Jaxon Smith-Njigba"]["started_points"] == 40.0
    assert bravo["Kyren Williams"] == {**bravo["Kyren Williams"], "started_points": 9.0, "bench_points": 12.0, "weeks_started": 1}
    assert by_team[2]["started_points"] == 49.0
    assert t["winner_team_id"] == 2 and t["margin"] == 4.0


def test_no_winner_before_anyone_plays():
    [t] = trade_outcomes(trades_from_activity([TRADE], 2026), {})
    assert t["winner_team_id"] is None and t["margin"] == 0


def test_players_who_leave_the_new_team_stop_counting():
    trades = trades_from_activity([TRADE], 2026)
    weeks = {
        5: box({1: [(20, "QB", 24.0)], 2: [(10, "WR", 18.0)]}),
        6: box({1: [], 2: [(10, "WR", 22.0)]}),  # Dak gone from Alpha (dropped/traded on)
    }
    [t] = trade_outcomes(trades, weeks)
    alpha = [s for s in t["sides"] if s["team_id"] == 1][0]
    assert alpha["started_points"] == 24.0


def test_trades_endpoint(monkeypatch):
    from fastapi.testclient import TestClient

    from app import main

    pages = []

    class FakeLeague:
        def recent_activity(self, size, msg_type, offset):
            pages.append((size, msg_type, offset))
            return [TRADE] if offset == 0 else []

    weeks = {
        5: box({1: [(20, "QB", 24.0)], 2: [(10, "WR", 18.0)]}),
        6: box({1: [(20, "QB", 21.0)], 2: [(10, "WR", 30.0)]}),
    }

    def box_scores(lid, year, week, *a, **k):
        if week > 6:
            raise main.WeekNotPlayedError("not yet")
        return weeks.get(week, {"matchups": []})

    ctx = main.LeagueContext(espn_league_id=1, espn_s2=None, swid=None, display_name="Test League")
    monkeypatch.setattr(main.cache, "get", lambda *a, **k: None)
    monkeypatch.setattr(main.cache, "put", lambda *a, **k: None)
    monkeypatch.setattr(main, "get_league", lambda *a, **k: FakeLeague())
    monkeypatch.setattr(main, "_get_season_scoreboard", lambda *a, **k: {"weeks": list(range(1, 18))})
    monkeypatch.setattr(main, "_get_season_box_scores", box_scores)
    main.app.dependency_overrides[main.get_user_league] = lambda: ctx
    try:
        client = TestClient(main.app)
        body = client.get("/api/leagues/1/seasons/2026/trades").json()
        assert body["supported"] is True
        [t] = body["trades"]
        assert t["week"] == 5 and t["winner_team_id"] == 2 and t["margin"] == 3.0
        assert pages == [(50, "TRADED", 0)]

        old = client.get("/api/leagues/1/seasons/2018/trades").json()
        assert old == {"league_id": 1, "year": 2018, "supported": False, "trades": []}
    finally:
        main.app.dependency_overrides.clear()
