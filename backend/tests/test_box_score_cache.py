"""Which cached box scores are kept for good: only a week fetched after it
was over. A copy saved mid-game, or under a week ESPN hadn't reached (ESPN
answers with the current week's games), is fetched again."""

import datetime as dt

import pytest

from app import cache, loaders

LEAGUE, YEAR = 77, 2026


class FakeLeague:
    def __init__(self, current_week):
        self.current_week = current_week


@pytest.fixture
def espn(monkeypatch):
    """A live season ten weeks in, an in-memory cache, and a count of fetches."""
    state = {"current_week": 11, "played": 10, "fetches": [], "rows": {}, "now": dt.datetime(2026, 11, 20, 12, tzinfo=dt.timezone.utc)}

    def cache_get(league_id, year, key, fresh_since=None):
        row = state["rows"].get((league_id, year, key))
        if row is None or (fresh_since is not None and row[0] < fresh_since):
            return None
        return row[1]

    def cache_put(league_id, year, key, payload):
        state["rows"][(league_id, year, key)] = (state["now"], payload)

    def fetch(league, week):
        state["fetches"].append(week)
        return [{"week_fetched": week, "current": league.current_week}]

    monkeypatch.setattr(loaders.cache, "get", cache_get)
    monkeypatch.setattr(loaders.cache, "put", cache_put)
    monkeypatch.setattr(loaders, "is_live_season", lambda year: year == YEAR)
    monkeypatch.setattr(loaders, "get_league", lambda *a, **k: FakeLeague(state["current_week"]))
    monkeypatch.setattr(loaders, "serialize_box_scores", fetch)
    monkeypatch.setattr(loaders, "last_refresh_point", lambda: state["now"] - dt.timedelta(hours=1))
    monkeypatch.setattr(
        loaders, "_get_season_teams",
        lambda *a, **k: {"teams": [{"wins": state["played"], "losses": 0, "ties": 0}]},
    )
    return state


def box(week, year=YEAR):
    return loaders._get_season_box_scores(LEAGUE, year, week, None, None)


def store(espn, week, payload, year=YEAR, age=dt.timedelta(days=30)):
    espn["rows"][(LEAGUE, year, cache.box_scores_key(week))] = (espn["now"] - age, payload)


def test_a_finished_week_is_marked_complete_and_kept(espn):
    assert box(3)["complete"] is True
    assert box(3)["complete"] is True
    assert espn["fetches"] == [3]


def test_an_old_copy_saved_before_its_week_was_over_is_fetched_again(espn):
    # Week 3 cached back in week 2 (ESPN's week-2 games under week 3's key),
    # long out of the refresh window: not kept as it is.
    store(espn, 3, {"week": 3, "matchups": ["week 2's games"], "complete": False})
    assert box(3)["matchups"] == [{"week_fetched": 3, "current": 11}]
    # A copy from before `complete` existed is fetched again too.
    store(espn, 4, {"week": 4, "matchups": ["unknown"]})
    assert box(4)["complete"] is True
    assert espn["fetches"] == [3, 4]


def test_the_week_being_played_is_not_complete(espn):
    assert box(11)["complete"] is False
    # Within the refresh window it's served until the next refresh point...
    assert box(11)["complete"] is False
    assert espn["fetches"] == [11]
    # ...and once the week is over and has left the window, fetched again.
    espn["current_week"], espn["played"] = 14, 13
    espn["now"] += dt.timedelta(days=21)
    assert box(11)["complete"] is True
    assert espn["fetches"] == [11, 11]


def test_recent_weeks_still_go_stale_at_refresh_points(espn):
    store(espn, 10, {"week": 10, "matchups": [], "complete": True}, age=dt.timedelta(hours=2))
    box(10)
    assert espn["fetches"] == [10]  # before the last refresh point: stat corrections


def test_a_finished_seasons_weeks_are_complete(espn):
    store(espn, 5, {"week": 5, "matchups": ["saved mid-game"], "complete": False}, year=2025)
    assert box(5, year=2025)["complete"] is True
    assert box(5, year=2025)["complete"] is True
    assert espn["fetches"] == [5]
