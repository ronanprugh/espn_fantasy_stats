"""The cache against real Postgres: its upsert is Postgres SQL, so SQLite
can't stand in. Runs when TEST_DATABASE_URL points at a migrated database
(CI's migrations job sets it); skipped otherwise."""

import datetime as dt
import os

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app import cache

URL = os.environ.get("TEST_DATABASE_URL")
pytestmark = pytest.mark.skipif(not URL, reason="needs TEST_DATABASE_URL (a migrated Postgres)")


@pytest.fixture
def pg(monkeypatch):
    engine = create_engine(URL)
    monkeypatch.setattr(cache, "SessionLocal", sessionmaker(bind=engine))
    with engine.begin() as c:
        c.execute(text("DELETE FROM cache WHERE league_id = -1"))
    yield engine
    with engine.begin() as c:
        c.execute(text("DELETE FROM cache WHERE league_id = -1"))


def test_put_get_and_replace(pg):
    cache.put(-1, 2024, cache.TEAMS, {"v": 1})
    assert cache.get(-1, 2024, cache.TEAMS) == {"v": 1}
    cache.put(-1, 2024, cache.TEAMS, {"v": 2})
    assert cache.get(-1, 2024, cache.TEAMS) == {"v": 2}
    assert cache.get(-1, 2024, cache.MATCHUPS) is None


def test_fresh_since_and_the_upsert_bumping_updated_at(pg):
    cache.put(-1, 2024, cache.TEAMS, {"v": 1})
    with pg.begin() as c:  # make the row an hour old
        c.execute(text("UPDATE cache SET updated_at = now() - interval '1 hour' WHERE league_id = -1"))
    half_hour_ago = dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=30)
    assert cache.get(-1, 2024, cache.TEAMS, fresh_since=half_hour_ago) is None
    # Re-storing must count as fresh again: the upsert sets updated_at itself,
    # since the server default only fires on insert.
    cache.put(-1, 2024, cache.TEAMS, {"v": 2})
    assert cache.get(-1, 2024, cache.TEAMS, fresh_since=half_hour_ago) == {"v": 2}


def test_invalidate(pg):
    cache.put(-1, 2024, cache.TEAMS, {})
    cache.put(-1, 2024, cache.MATCHUPS, {})
    cache.invalidate(-1, 2024, cache.TEAMS)
    assert cache.get(-1, 2024, cache.TEAMS) is None and cache.get(-1, 2024, cache.MATCHUPS) == {}
    cache.invalidate(-1, 2024)
    assert cache.get(-1, 2024, cache.MATCHUPS) is None
