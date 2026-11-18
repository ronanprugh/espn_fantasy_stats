"""Personal API tokens, end to end through the app, on a throwaway SQLite
database holding just the tables these endpoints touch."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import main
from app.auth import hash_password
from app.database import get_db
from app.models import ApiToken, Base, League, User


@pytest.fixture
def db_session():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(
        engine, tables=[User.__table__, League.__table__, ApiToken.__table__]
    )
    Session = sessionmaker(bind=engine, autocommit=False, autoflush=False)

    def override():
        db = Session()
        try:
            yield db
        finally:
            db.close()

    main.app.dependency_overrides[get_db] = override
    db = Session()
    db.add(User(username="ronan", password_hash=hash_password("correct horse")))
    db.commit()
    try:
        yield db
    finally:
        db.close()
        main.app.dependency_overrides.clear()


def _signed_in() -> TestClient:
    client = TestClient(main.app)
    r = client.post("/api/auth/login", json={"username": "ronan", "password": "correct horse"})
    assert r.status_code == 200, r.text
    return client


def _bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def test_token_reads_but_never_writes(db_session):
    browser = _signed_in()
    r = browser.post("/api/me/tokens", json={"name": "Claude"})
    assert r.status_code == 201, r.text
    created = r.json()
    token = created["token"]
    assert token.startswith("efs_") and created["prefix"] == token[:10]

    # Only a hash is stored.
    row = db_session.query(ApiToken).one()
    assert row.token_hash != token and len(row.token_hash) == 64

    api = TestClient(main.app)  # no session cookie
    assert api.get("/api/me/leagues", headers=_bearer(token)).status_code == 200
    assert api.get("/api/auth/me", headers=_bearer(token)).json()["username"] == "ronan"

    # Writes need a signed-in session.
    r = api.post(
        "/api/me/leagues",
        headers=_bearer(token),
        json={"espn_league_id": 1, "display_name": "x"},
    )
    assert r.status_code == 403
    assert api.post(
        "/api/auth/change_password",
        headers=_bearer(token),
        json={"current_password": "correct horse", "new_password": "something else"},
    ).status_code == 403

    # A token can't list or mint tokens.
    assert api.get("/api/me/tokens", headers=_bearer(token)).status_code == 401

    # Use is recorded.
    db_session.expire_all()
    assert db_session.query(ApiToken).one().last_used_at is not None


def test_bad_and_missing_tokens_are_refused(db_session):
    api = TestClient(main.app)
    assert api.get("/api/me/leagues").status_code == 401
    assert api.get("/api/me/leagues", headers=_bearer("efs_nope")).status_code == 401
    assert api.get("/api/me/leagues", headers={"Authorization": "Basic abc"}).status_code == 401


def test_revoked_token_stops_working(db_session):
    browser = _signed_in()
    created = browser.post("/api/me/tokens", json={"name": "temp"}).json()
    api = TestClient(main.app)
    assert api.get("/api/me/leagues", headers=_bearer(created["token"])).status_code == 200

    listed = browser.get("/api/me/tokens").json()
    assert [t["name"] for t in listed] == ["temp"]
    assert "token" not in listed[0]

    assert browser.delete(f"/api/me/tokens/{created['id']}").status_code == 200
    assert api.get("/api/me/leagues", headers=_bearer(created["token"])).status_code == 401


def test_cannot_revoke_someone_elses_token(db_session):
    db_session.add(User(username="other", password_hash=hash_password("pw123456")))
    db_session.commit()
    other = db_session.query(User).filter_by(username="other").one()
    db_session.add(ApiToken(user_id=other.id, name="theirs", token_hash="0" * 64, prefix="efs_xxxxxx"))
    db_session.commit()
    theirs = db_session.query(ApiToken).filter_by(name="theirs").one()

    browser = _signed_in()
    assert browser.delete(f"/api/me/tokens/{theirs.id}").status_code == 404
    assert browser.get("/api/me/tokens").json() == []
