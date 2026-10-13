import datetime as dt
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert

from .database import SessionLocal
from .models import Cache


def get(
    league_id: int, year: int, key: str, fresh_since: dt.datetime | None = None
) -> Any | None:
    """Cached payload, or None if missing or written before `fresh_since`.

    `fresh_since` must be timezone-aware. updated_at is a naive timestamp in
    the database session's timezone (it's stamped by now()), and Postgres
    converts it with that same session timezone when comparing it to an aware
    value, so the comparison is correct whatever the server's zone is.
    """
    stmt = select(Cache.payload).where(
        Cache.league_id == league_id, Cache.year == year, Cache.key == key
    )
    if fresh_since is not None:
        stmt = stmt.where(Cache.updated_at >= fresh_since)
    with SessionLocal() as db:
        return db.execute(stmt).scalar_one_or_none()


def put(league_id: int, year: int, key: str, payload: Any) -> None:
    stmt = insert(Cache).values(
        league_id=league_id, year=year, key=key, payload=payload
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["league_id", "year", "key"],
        # updated_at has only a server default, which fires on insert, not on
        # conflict — without bumping it here every row would look as old as
        # its first fetch and `get(fresh_since=...)` would never be satisfied.
        set_={"payload": stmt.excluded.payload, "updated_at": func.now()},
    )
    with SessionLocal() as db:
        db.execute(stmt)
        db.commit()


def invalidate(league_id: int, year: int, key: str | None = None) -> None:
    with SessionLocal() as db:
        q = db.query(Cache).filter(Cache.league_id == league_id, Cache.year == year)
        if key:
            q = q.filter(Cache.key == key)
        q.delete()
        db.commit()
