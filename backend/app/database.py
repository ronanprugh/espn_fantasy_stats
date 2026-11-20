"""SQLAlchemy engine and session factory for the app's Postgres database.

`SessionLocal` is used directly by code that runs outside a request (the
cache, the admin CLI); endpoints take a session from `get_db` instead, so
tests can swap it for an in-memory database with `dependency_overrides`.
"""

from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from .config import DATABASE_URL

engine = create_engine(DATABASE_URL, future=True, pool_pre_ping=True)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)


def get_db() -> Iterator[Session]:
    """FastAPI dependency yielding a request-scoped DB session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
