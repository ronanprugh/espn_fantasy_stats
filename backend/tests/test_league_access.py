"""Who can use a league's data, and what a power rankings image can be.

ESPN data is cached and shared by league id, so a league row is what grants
a user access to it: rows are only used once ESPN confirms the row's cookies
can read the league. Power rankings images are served from the app's own
origin, so only real images, by their bytes, are stored or served.
"""

import base64
import datetime as dt

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import espn_client, main
from app import power_rankings as pr
from app.auth import hash_password
from app.database import get_db
from app.espn_client import LeagueAccess
from app.models import ApiToken, Base, League, PowerRankingEntry, PowerRankingPost, User

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
HTML = b"<html><script>alert(1)</script></html>"


@pytest.fixture
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine, tables=[
        User.__table__, League.__table__, ApiToken.__table__,
        PowerRankingPost.__table__, PowerRankingEntry.__table__,
    ])
    Session = sessionmaker(bind=engine, autocommit=False, autoflush=False)

    def override():
        s = Session()
        try:
            yield s
        finally:
            s.close()

    main.app.dependency_overrides[get_db] = override
    s = Session()
    s.add(User(username="ronan", password_hash=hash_password("correct horse")))
    s.commit()
    try:
        yield s
    finally:
        s.close()
        main.app.dependency_overrides.clear()


@pytest.fixture
def espn(monkeypatch):
    """ESPN's answer to the access check, and how often it was asked."""
    state = {"answer": LeagueAccess.OK, "calls": []}

    def check(league_id, espn_s2, swid):
        state["calls"].append((league_id, espn_s2, swid))
        if isinstance(state["answer"], Exception):
            raise state["answer"]
        return state["answer"]

    monkeypatch.setattr(main, "check_league_access", check)
    return state


def signed_in() -> TestClient:
    client = TestClient(main.app)
    assert client.post("/api/auth/login", json={"username": "ronan", "password": "correct horse"}).status_code == 200
    return client


ADD = {"espn_league_id": 77, "display_name": "Private League", "espn_s2": "s2", "swid": "{swid}"}


# --- Adding a league --------------------------------------------------------------

def test_a_league_espn_wont_show_these_cookies_is_not_added(db, espn):
    espn["answer"] = LeagueAccess.DENIED
    r = signed_in().post("/api/me/leagues", json={**ADD, "espn_s2": None, "swid": None})
    assert r.status_code == 403 and "cookies" in r.json()["detail"]
    assert db.query(League).count() == 0
    assert espn["calls"] == [(77, None, None)]


def test_an_unknown_league_is_not_added(db, espn):
    espn["answer"] = LeagueAccess.NOT_FOUND
    assert signed_in().post("/api/me/leagues", json=ADD).status_code == 404
    assert db.query(League).count() == 0


def test_espn_being_down_does_not_count_as_access(db, espn):
    espn["answer"] = RuntimeError("ESPN returned HTTP 503")
    assert signed_in().post("/api/me/leagues", json=ADD).status_code == 502
    assert db.query(League).count() == 0


def test_a_league_espn_confirms_is_added_and_marked_verified(db, espn):
    r = signed_in().post("/api/me/leagues", json=ADD)
    assert r.status_code == 200, r.text
    row = db.query(League).one()
    assert row.access_verified_at is not None
    assert espn["calls"] == [(77, "s2", "{swid}")]


# --- Using a league ---------------------------------------------------------------

def unverified_league(db) -> League:
    row = League(user_id=1, espn_league_id=77, display_name="Old row", access_verified_at=None)
    db.add(row)
    db.commit()
    return row


def test_a_row_added_before_the_check_is_checked_once_on_first_use(db, espn, monkeypatch):
    unverified_league(db)
    monkeypatch.setattr(main, "discover_years", lambda *a, **k: [2025])
    client = signed_in()
    assert client.get("/api/leagues/77/info").status_code == 200
    assert client.get("/api/leagues/77/info").status_code == 200
    assert len(espn["calls"]) == 1  # verified once, then trusted
    db.expire_all()
    assert db.query(League).one().access_verified_at is not None


def test_a_row_espn_doesnt_confirm_cannot_read_shared_data(db, espn, monkeypatch):
    unverified_league(db)
    espn["answer"] = LeagueAccess.DENIED
    monkeypatch.setattr(main, "discover_years", lambda *a, **k: pytest.fail("shared data was read"))
    client = signed_in()
    assert client.get("/api/leagues/77/info").status_code == 403
    assert client.delete("/api/leagues/77/power_rankings").status_code == 403
    db.expire_all()
    assert db.query(League).one().access_verified_at is None


def test_new_cookies_must_pass_the_check(db, espn):
    client = signed_in()
    league_id = client.post("/api/me/leagues", json=ADD).json()["id"]
    espn["answer"] = LeagueAccess.DENIED
    r = client.patch(f"/api/me/leagues/{league_id}", json={"espn_s2": "wrong"})
    assert r.status_code == 403
    assert espn["calls"][-1] == (77, "wrong", "{swid}")  # checked with the other cookie kept
    # Renaming needs no check.
    calls = len(espn["calls"])
    assert client.patch(f"/api/me/leagues/{league_id}", json={"display_name": "New"}).status_code == 200
    assert len(espn["calls"]) == calls


# --- The ESPN check itself --------------------------------------------------------

class Reply:
    def __init__(self, status, body=None):
        self.status_code, self._body = status, body if body is not None else {}

    def json(self):
        return self._body


def test_check_league_access_reads_espns_answers(monkeypatch):
    def run(statuses, then=Reply(404)):
        replies = iter(statuses)
        asked = []

        def get(url, **kw):
            asked.append((url, kw.get("params")))
            return next(replies, then)

        monkeypatch.setattr(espn_client.requests, "get", get)
        return espn_client.check_league_access(77, "s2", "{swid}"), asked

    assert run([Reply(200, {"id": 77})])[0] == LeagueAccess.OK
    assert run([Reply(404), Reply(401)])[0] == LeagueAccess.DENIED
    answer, asked = run([])
    assert answer == LeagueAccess.NOT_FOUND
    # Every season back to the first one probed, on both endpoints.
    seasons = {p.get("seasonId") or int(u.split("/seasons/")[1].split("/")[0]) for u, p in asked}
    assert min(seasons) == espn_client.FIRST_PROBE_SEASON
    # A dead league that last played years ago is still found.
    old = [Reply(404)] * 2 * (espn_client.current_season_year() - 2019) + [Reply(200, {"id": 77})]
    assert run(old)[0] == LeagueAccess.OK
    with pytest.raises(RuntimeError):
        run([Reply(503)])


def test_check_league_access_sends_cookies_only_as_a_pair(monkeypatch):
    sent = []

    def get(url, params=None, cookies=None, timeout=None):
        sent.append(cookies)
        return Reply(200, {"id": 77})

    monkeypatch.setattr(espn_client.requests, "get", get)
    espn_client.check_league_access(77, "s2", "{swid}")
    espn_client.check_league_access(77, None, None)
    espn_client.check_league_access(77, "s2", None)
    assert sent == [{"espn_s2": "s2", "SWID": "{swid}"}, None, None]


# --- Power rankings images --------------------------------------------------------

def test_image_type_comes_from_the_bytes():
    assert pr.image_type(PNG) == "image/png"
    assert pr.image_type(b"\xff\xd8\xff\xe0rest") == "image/jpeg"
    assert pr.image_type(b"GIF89a...") == "image/gif"
    assert pr.image_type(b"RIFF\x00\x00\x00\x00WEBPVP8 ") == "image/webp"
    assert pr.image_type(HTML) is None
    assert pr.image_type(b"") is None and pr.image_type(None) is None


TEAMS = {2025: [{"team_id": 1, "team_name": "Alpha", "abbrev": "A"}]}


def post(image: bytes, mime: str) -> dict:
    return {
        "season": 2025, "week": 1, "posted_at": "2025-09-01T12:00:00", "format": "image",
        "image_base64": base64.b64encode(image).decode(), "image_mime": mime,
    }


def test_an_import_with_a_non_image_is_rejected_whatever_it_claims(db):
    with pytest.raises(pr.ImportError_, match="isn't a PNG, JPEG, GIF or WebP"):
        pr.store_import(db, 77, [post(HTML, "image/png")], TEAMS)


def test_an_imported_image_keeps_the_type_its_bytes_show(db):
    pr.store_import(db, 77, [post(PNG, "text/html")], TEAMS)
    assert db.query(PowerRankingPost).one().image_mime == "image/png"


def stored_post(db, image: bytes, mime: str) -> int:
    row = PowerRankingPost(
        espn_league_id=77, season=2025, week=1, posted_at=dt.datetime(2025, 9, 1), title="T", author="A",
        kind="rankings", format="image", body="", image=image, image_mime=mime,
    )
    db.add(row)
    db.commit()
    return row.id


def test_images_are_served_as_images_only(db, espn):
    db.add(League(user_id=1, espn_league_id=77, display_name="L", access_verified_at=dt.datetime(2026, 1, 1)))
    db.commit()
    client = signed_in()

    good = client.get(f"/api/leagues/77/power_rankings/posts/{stored_post(db, PNG, 'image/png')}/image")
    assert good.status_code == 200
    assert good.headers["content-type"] == "image/png"
    assert good.headers["x-content-type-options"] == "nosniff"
    assert "sandbox" in good.headers["content-security-policy"]

    # A page stored as an "image" before the import check existed is never served.
    bad = client.get(f"/api/leagues/77/power_rankings/posts/{stored_post(db, HTML, 'text/html')}/image")
    assert bad.status_code == 404 and "html" not in bad.headers["content-type"]


def test_every_response_says_nosniff():
    assert TestClient(main.app).get("/api/health").headers["x-content-type-options"] == "nosniff"
