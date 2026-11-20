"""Cache keys: one list of the current ones, and pruning the rest."""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import cache
from app.models import Base, Cache


@pytest.fixture
def db(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine, tables=[Cache.__table__])
    Session = sessionmaker(bind=engine)
    monkeypatch.setattr(cache, "SessionLocal", Session)
    with Session() as s:
        for year, key in [(2024, cache.TEAMS), (2024, cache.box_scores_key(3)), (2024, "teams_v2"),
                          (2023, "teams_v2"), (2024, "activity_v3"), (2024, "box_scores_v0_w3")]:
            s.add(Cache(league_id=1, year=year, key=key, payload={}))
        s.commit()
    return Session


def test_current_keys():
    assert cache.is_current(cache.TEAMS) and cache.is_current(cache.box_scores_key(17))
    assert not cache.is_current("teams_v2") and not cache.is_current("box_scores_v0_w3")


def test_prune_deletes_only_retired_keys(db):
    assert cache.retired_keys() == {"teams_v2": 2, "activity_v3": 1, "box_scores_v0_w3": 1}
    assert cache.prune() == 4
    with db() as s:
        assert sorted(r.key for r in s.query(Cache)) == sorted([cache.TEAMS, cache.box_scores_key(3)])
    assert cache.prune() == 0


def test_prune_refuses_a_current_key(db):
    with pytest.raises(ValueError):
        cache.prune([cache.TEAMS])
