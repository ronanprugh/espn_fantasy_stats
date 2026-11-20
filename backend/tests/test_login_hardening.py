"""Signing in: repeated failures are slowed down, and changing a password
ends the user's other sessions."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import admin, auth, main
from app.auth import hash_password
from app.database import get_db
from app.models import ApiToken, Base, InviteCode, User

PASSWORD = "correct horse"


@pytest.fixture
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine, tables=[User.__table__, ApiToken.__table__, InviteCode.__table__])
    Session = sessionmaker(bind=engine, autocommit=False, autoflush=False)

    def override():
        s = Session()
        try:
            yield s
        finally:
            s.close()

    main.app.dependency_overrides[get_db] = override
    s = Session()
    s.add(User(username="ronan", password_hash=hash_password(PASSWORD)))
    s.commit()
    try:
        yield s
    finally:
        s.close()
        main.app.dependency_overrides.clear()


def sign_in(client: TestClient, password: str = PASSWORD, username: str = "ronan", ip: str | None = None):
    headers = {"X-Forwarded-For": f"{ip}, 10.0.0.1"} if ip else None
    return client.post("/api/auth/login", json={"username": username, "password": password}, headers=headers)


# --- Rate limits ------------------------------------------------------------

def test_too_many_wrong_passwords_lock_the_username_for_a_while(db):
    client = TestClient(main.app)
    for i in range(auth.LOGIN_FAILURES_PER_USERNAME):
        # From a different address each time: the username's own limit applies.
        assert sign_in(client, "wrong", ip=f"203.0.113.{i}").status_code == 401
    r = sign_in(client, ip="198.51.100.1")
    assert r.status_code == 429
    assert "Try again in 15 minutes" in r.json()["detail"]
    # Usernames are counted whatever their case.
    assert sign_in(client, username="RONAN", ip="198.51.100.2").status_code == 429


def test_a_successful_sign_in_clears_the_usernames_count(db):
    client = TestClient(main.app)
    for _ in range(auth.LOGIN_FAILURES_PER_USERNAME - 1):
        assert sign_in(client, "wrong").status_code == 401
    assert sign_in(client).status_code == 200
    for _ in range(auth.LOGIN_FAILURES_PER_USERNAME - 1):
        assert sign_in(client, "wrong").status_code == 401
    assert sign_in(client).status_code == 200


def test_one_client_guessing_many_usernames_is_slowed_down(db):
    client = TestClient(main.app)
    for i in range(auth.LOGIN_FAILURES_PER_CLIENT):
        assert sign_in(client, "wrong", username=f"user{i}", ip="203.0.113.9").status_code == 401
    assert sign_in(client, ip="203.0.113.9").status_code == 429
    # Someone else is unaffected.
    assert sign_in(client, ip="203.0.113.10").status_code == 200


def test_the_count_forgets_failures_older_than_the_window(db, monkeypatch):
    now = [1000.0]
    monkeypatch.setattr(auth.time, "monotonic", lambda: now[0])
    client = TestClient(main.app)
    for _ in range(auth.LOGIN_FAILURES_PER_USERNAME):
        sign_in(client, "wrong")
    assert sign_in(client).status_code == 429
    now[0] += auth.ATTEMPT_WINDOW_S - 60
    assert "1 minute." in sign_in(client).json()["detail"]
    now[0] += 61
    assert sign_in(client).status_code == 200


def test_too_many_bad_invite_codes_are_slowed_down(db):
    client = TestClient(main.app)
    body = {"username": "new", "password": "long enough pw", "invite_code": "nope"}
    for _ in range(auth.SIGNUP_FAILURES_PER_CLIENT):
        assert client.post("/api/auth/signup", json=body).status_code == 400
    assert client.post("/api/auth/signup", json=body).status_code == 429


# --- Sessions ending --------------------------------------------------------

def test_changing_the_password_ends_other_sessions_but_not_this_one(db):
    here, elsewhere = TestClient(main.app), TestClient(main.app)
    assert sign_in(here).status_code == 200
    assert sign_in(elsewhere).status_code == 200
    r = here.post("/api/auth/change_password", json={"current_password": PASSWORD, "new_password": "new password!"})
    assert r.status_code == 200, r.text
    assert here.get("/api/auth/me").status_code == 200
    assert elsewhere.get("/api/auth/me").status_code == 401
    # Signing in again with the new password works.
    assert sign_in(elsewhere, "new password!").status_code == 200
    assert elsewhere.get("/api/auth/me").status_code == 200


def test_sessions_from_before_versions_existed_still_work(db):
    client = TestClient(main.app)
    assert sign_in(client).status_code == 200
    # A cookie written before this change has a user id and no version.
    user = db.query(User).one()
    assert user.session_version == 0
    req = type("R", (), {"session": {"user_id": user.id}})()
    assert auth._signed_in_user(req, db) is user


def test_an_admin_password_reset_ends_every_session(db, monkeypatch):
    client = TestClient(main.app)
    assert sign_in(client).status_code == 200
    monkeypatch.setattr(admin, "SessionLocal", lambda: _Ctx(db))
    monkeypatch.setattr(admin, "_read_password", lambda _: "reset password!")
    admin.reset_password(type("A", (), {"username": "ronan", "password": None})())
    assert client.get("/api/auth/me").status_code == 401


class _Ctx:
    def __init__(self, db):
        self.db = db

    def __enter__(self):
        return self.db

    def __exit__(self, *exc):
        return False
