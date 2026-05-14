from typing import Any

from sqlalchemy.dialects.postgresql import insert

from .database import SessionLocal
from .models import Cache


def get(league_id: int, year: int, key: str) -> Any | None:
    with SessionLocal() as db:
        row = db.get(Cache, (league_id, year, key))
        return row.payload if row else None


def put(league_id: int, year: int, key: str, payload: Any) -> None:
    stmt = insert(Cache).values(
        league_id=league_id, year=year, key=key, payload=payload
    )
    stmt = stmt.on_conflict_do_update(
        index_elements=["league_id", "year", "key"],
        set_={"payload": stmt.excluded.payload},
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
