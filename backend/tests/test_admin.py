"""The admin CLI, on a throwaway SQLite database."""

from types import SimpleNamespace as NS

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import admin
from app.models import ApiToken, Base, InviteCode, League, User


@pytest.fixture
def Session(monkeypatch):
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(
        engine, tables=[User.__table__, League.__table__, InviteCode.__table__, ApiToken.__table__]
    )
    factory = sessionmaker(bind=engine)
    monkeypatch.setattr(admin, "SessionLocal", factory)
    return factory


def test_create_user_as_admin_and_toggle(Session, capsys):
    admin.create_user(NS(username="ronan", password="correct horse", admin=True))
    with Session() as db:
        assert db.query(User).one().is_admin is True

    admin.set_admin(NS(username="ronan", revoke=True))
    with Session() as db:
        assert db.query(User).one().is_admin is False
    assert "no longer an admin" in capsys.readouterr().out

    admin.set_admin(NS(username="ronan", revoke=False))
    with Session() as db:
        assert db.query(User).one().is_admin is True


def test_set_admin_needs_an_existing_user(Session):
    with pytest.raises(SystemExit):
        admin.set_admin(NS(username="nobody", revoke=False))
