"""Postgres-backed cache for ESPN payloads (the `cache` table).

Rows are keyed on (ESPN league id, season, key), not on the user, so everyone
who has added a league shares one copy of its data. Keys carry a version
suffix (`teams_v3`, `box_scores_v2_w5`): bump it whenever the shape of a
payload changes, and old rows are simply never read again.

Freshness is decided by the caller through `fresh_since` (see
`espn_client.last_refresh_point`); finished seasons are cached indefinitely.
"""

import datetime as dt
import re
from collections.abc import Iterable
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert

from .database import SessionLocal
from .models import Cache


# Every key in use. Bump a key's version when its payload's shape changes;
# the old rows are then unreachable, and `prune` deletes them.
TEAMS = "teams_v3"
MATCHUPS = "matchups_v2"
SCOREBOARD = "scoreboard_v2"
PLAYOFFS = "playoffs_v1"
# v4: rebuilt from box scores fetched again under box_scores_v2.
POSITIONAL_STATS = "positional_stats_v4"
ACTIVITY = "activity_v4"
# v2: carries `complete`; every week is fetched again once, replacing copies
# saved mid-game or under a week ESPN hadn't reached (loaders._get_season_box_scores).
_BOX_SCORES = "box_scores_v2"


def box_scores_key(week: int) -> str:
    """One week's box scores: a key per week."""
    return f"{_BOX_SCORES}_w{week}"


CURRENT_KEYS = frozenset({TEAMS, MATCHUPS, SCOREBOARD, PLAYOFFS, POSITIONAL_STATS, ACTIVITY})
_CURRENT_PATTERN = re.compile(rf"^{_BOX_SCORES}_w\d+$")


def is_current(key: str) -> bool:
    """Whether a stored row's key is one the app still reads."""
    return key in CURRENT_KEYS or bool(_CURRENT_PATTERN.match(key))


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
    """Store `payload` (anything JSON-serialisable), replacing any earlier row
    and stamping it as fetched now."""
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
    """Delete one cached payload, or every payload for the season without `key`."""
    with SessionLocal() as db:
        q = db.query(Cache).filter(Cache.league_id == league_id, Cache.year == year)
        if key:
            q = q.filter(Cache.key == key)
        q.delete()
        db.commit()


def retired_keys() -> dict[str, int]:
    """Rows per key the app no longer reads (from a version bump)."""
    with SessionLocal() as db:
        counts = db.execute(select(Cache.key, func.count()).group_by(Cache.key)).all()
    return {key: n for key, n in counts if not is_current(key)}


def prune(keys: Iterable[str] | None = None) -> int:
    """Delete rows under retired keys (all of them, or just `keys`, each of
    which must be retired). Returns how many rows were deleted."""
    targets = list(keys) if keys is not None else list(retired_keys())
    if any(is_current(k) for k in targets):
        raise ValueError("Refusing to delete rows under a key the app still reads")
    if not targets:
        return 0
    with SessionLocal() as db:
        n = db.query(Cache).filter(Cache.key.in_(targets)).delete(synchronize_session=False)
        db.commit()
    return n
