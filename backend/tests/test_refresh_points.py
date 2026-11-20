"""When live-season data goes stale (espn_client.REFRESH_POINTS)."""

from datetime import datetime

import pytest

from app.espn_client import EASTERN, last_refresh_point


def et(y, mo, d, h=0, mi=0):
    return datetime(y, mo, d, h, mi, tzinfo=EASTERN)


# Week of Sun 15 Nov 2026 – Tue 17 Nov 2026 (15 Nov is a Sunday).
@pytest.mark.parametrize("now, expected", [
    # Sunday: midnight, then after the early window, then the late window.
    (et(2026, 11, 15, 13, 0), et(2026, 11, 15, 0, 0)),
    (et(2026, 11, 15, 16, 29), et(2026, 11, 15, 0, 0)),
    (et(2026, 11, 15, 16, 30), et(2026, 11, 15, 16, 30)),
    (et(2026, 11, 15, 19, 0), et(2026, 11, 15, 16, 30)),
    (et(2026, 11, 15, 22, 0), et(2026, 11, 15, 20, 15)),
    # After Sunday night's game: Monday midnight, then 1am.
    (et(2026, 11, 16, 0, 30), et(2026, 11, 16, 0, 0)),
    (et(2026, 11, 16, 12, 0), et(2026, 11, 16, 1, 0)),
    # After Monday night's game: Tuesday midnight, then 9am corrections.
    (et(2026, 11, 17, 8, 59), et(2026, 11, 17, 0, 0)),
    (et(2026, 11, 17, 9, 0), et(2026, 11, 17, 9, 0)),
    (et(2026, 11, 17, 23, 0), et(2026, 11, 17, 9, 0)),
    # Every other day: midnight (Friday catches Thursday night's game).
    (et(2026, 11, 18, 15, 0), et(2026, 11, 18, 0, 0)),
    (et(2026, 11, 20, 8, 0), et(2026, 11, 20, 0, 0)),
    (et(2026, 11, 21, 23, 59), et(2026, 11, 21, 0, 0)),
])
def test_last_refresh_point(now, expected):
    assert last_refresh_point(now) == expected


def test_never_in_the_future_and_never_more_than_a_day_old():
    # Every 7 minutes across a whole week.
    start = et(2026, 11, 15)
    for i in range(0, 7 * 24 * 60, 7):
        now = start.timestamp() + i * 60
        now_dt = datetime.fromtimestamp(now, EASTERN)
        point = last_refresh_point(now_dt)
        assert point <= now_dt
        assert (now_dt - point).total_seconds() < 24 * 3600


def test_accepts_utc_input():
    # 21:00 UTC on Sun 15 Nov is 4pm Eastern: still before the 4:30 point.
    from datetime import timezone
    utc = datetime(2026, 11, 15, 21, 0, tzinfo=timezone.utc)
    assert last_refresh_point(utc) == et(2026, 11, 15, 0, 0)


def test_daylight_saving_switch_keeps_wall_clock_times():
    # 1 Nov 2026 is the autumn switch. Sunday 4:30pm is still 4:30pm Eastern.
    assert last_refresh_point(et(2026, 11, 1, 17, 0)) == et(2026, 11, 1, 16, 30)


def test_discovered_seasons_are_rediscovered_after_a_refresh_point(monkeypatch):
    from datetime import datetime, timezone
    from types import SimpleNamespace as NS

    from app import espn_client

    seasons = {"previous": [2024]}

    def league(league_id, year, espn_s2=None, swid=None):
        return NS(previousSeasons=list(seasons["previous"]), teams=[NS(wins=1, losses=0, ties=0)])

    monkeypatch.setattr(espn_client, "get_league", league)
    monkeypatch.setattr(espn_client, "_years_cache", {})
    point = {"at": datetime(2026, 11, 20, 5, tzinfo=timezone.utc)}
    monkeypatch.setattr(espn_client, "last_refresh_point", lambda now=None: point["at"])

    first = espn_client.discover_years(5)
    seasons["previous"] = [2024, 2025]  # ESPN now lists another season
    assert espn_client.discover_years(5) == first  # same refresh window: cached
    point["at"] = datetime(2099, 1, 1, tzinfo=timezone.utc)  # a refresh point has passed
    assert 2025 in espn_client.discover_years(5)
