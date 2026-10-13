import datetime as dt
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert

from .database import SessionLocal
from .models import Cache


def get(
    league_id: int, year: int, key: str, max_age: dt.timedelta | None = None
) -> Any | None:
    """Cached payload, or None if missing or older than `max_age`.

    The age check runs in SQL against the database clock, the same clock
    `put` stamps updated_at with, so no timezone conversion is involved.
    """
    stmt = select(Cache.payload).where(
        Cache.league_id == league_id, Cache.year == year, Cache.key == key
    )
    if max_age is not None:
        stmt = stmt.where(Cache.updated_at > func.now() - max_age)
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
        # its first fetch and `get(max_age=...)` would never be satisfied.
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
