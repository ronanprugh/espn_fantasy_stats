"""Positional stats never keep a season short a week for good: a week ESPN
wouldn't serve is left out, reported, and tried again after the next
refresh point."""

from datetime import datetime, timezone
from types import SimpleNamespace as NS

from app import main


def box(points):
    """One week: Alpha (1) starts a QB scoring `points`."""
    lineup = [{"player_id": 9, "position": "QB", "slot_position": "QB", "points": points, "projected_points": 10.0}]
    return {"matchups": [{"home": {"team_id": 1, "total_points": points, "lineup": lineup}, "away": None}]}


def wire(monkeypatch, fail_weeks, store):
    teams = {"teams": [{"team_id": 1, "team_name": "Alpha", "standing": 1, "wins": 3, "losses": 0, "ties": 0,
                        "owners": [{"id": "o1", "first_name": "A", "last_name": "One"}]}]}
    league = NS(settings=NS(reg_season_count=3, playoff_team_count=1), teams=[NS(outcomes=["W", "W", "W"])])

    def box_scores(lid, year, week, *a, **k):
        if week in fail_weeks:
            raise ConnectionResetError("ESPN hiccup")
        return box(10.0 * week)

    def get(lid, year, key, fresh_since=None):
        row = store.get(key)
        if row is None or (fresh_since is not None and row["at"] < fresh_since):
            return None
        return row["payload"]

    def put(lid, year, key, payload):
        store[key] = {"payload": payload, "at": store.get("now", datetime(2025, 1, 1, tzinfo=timezone.utc))}

    monkeypatch.setattr(main.cache, "get", get)
    monkeypatch.setattr(main.cache, "put", put)
    monkeypatch.setattr(main, "is_live_season", lambda year: False)
    monkeypatch.setattr(main, "get_league", lambda *a, **k: league)
    monkeypatch.setattr(main, "_get_season_teams", lambda *a, **k: teams)
    monkeypatch.setattr(main, "_get_season_matchups", lambda *a, **k: [])
    monkeypatch.setattr(main, "_get_season_box_scores", box_scores)


def qb(payload):
    return next(p for p in payload["positions"] if p["position"] == "QB")["teams"][0]


def test_a_week_espn_wont_serve_is_reported_and_retried(monkeypatch):
    store = {}
    fail = {2}
    wire(monkeypatch, fail, store)
    monkeypatch.setattr(main, "last_refresh_point", lambda: datetime(2025, 1, 2, tzinfo=timezone.utc))

    first = main._compute_positional_stats_for_year(1, 2024, None, None)
    assert first["missing_weeks"] == [2]
    assert qb(first)["games_played"] == 2 and qb(first)["total_points"] == 40.0

    # Stored before the latest refresh point, so it's rebuilt; ESPN serves
    # week 2 now, and the season is complete.
    fail.clear()
    second = main._compute_positional_stats_for_year(1, 2024, None, None)
    assert second["missing_weeks"] == [] and qb(second)["games_played"] == 3


def test_a_complete_finished_season_is_kept(monkeypatch):
    store = {}
    wire(monkeypatch, set(), store)
    monkeypatch.setattr(main, "last_refresh_point", lambda: datetime(2030, 1, 1, tzinfo=timezone.utc))
    main._compute_positional_stats_for_year(1, 2024, None, None)
    # Even long after, a complete finished season comes from the cache.
    monkeypatch.setattr(main, "_get_season_box_scores", lambda *a, **k: (_ for _ in ()).throw(AssertionError("refetched")))
    assert qb(main._compute_positional_stats_for_year(1, 2024, None, None))["games_played"] == 3
