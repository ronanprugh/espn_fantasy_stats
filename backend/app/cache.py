import json
import sqlite3
import time
from typing import Optional

from .config import CACHE_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS cache (
    league_id INTEGER NOT NULL,
    year INTEGER NOT NULL,
    key TEXT NOT NULL,
    payload TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (league_id, year, key)
);
"""


def _conn():
    conn = sqlite3.connect(CACHE_PATH)
    conn.execute(SCHEMA)
    return conn


def get(league_id: int, year: int, key: str) -> Optional[dict]:
    with _conn() as conn:
        row = conn.execute(
            "SELECT payload FROM cache WHERE league_id=? AND year=? AND key=?",
            (league_id, year, key),
        ).fetchone()
    return json.loads(row[0]) if row else None


def put(league_id: int, year: int, key: str, payload: dict) -> None:
    with _conn() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO cache (league_id, year, key, payload, updated_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (league_id, year, key, json.dumps(payload), int(time.time())),
        )


def invalidate(league_id: int, year: int, key: Optional[str] = None) -> None:
    with _conn() as conn:
        if key:
            conn.execute(
                "DELETE FROM cache WHERE league_id=? AND year=? AND key=?",
                (league_id, year, key),
            )
        else:
            conn.execute(
                "DELETE FROM cache WHERE league_id=? AND year=?",
                (league_id, year),
            )
