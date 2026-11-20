"""Error reports (Sentry, when SENTRY_DSN is set): our bugs are reported,
ESPN being down isn't, and no credential is ever in a report."""

import json

import pytest
import sentry_sdk
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from sentry_sdk.transport import Transport

from app import reporting
from app.errors import espn_failure
from app.espn_client import ESPNUnavailable

SECRETS = ["s2-secret-value", "{swid-secret}", "efs_token_secret", "hunter2-password", "session-cookie-secret"]


class Capture(Transport):
    def __init__(self, options=None):
        super().__init__(options)
        self.events = []

    def capture_envelope(self, envelope):
        for item in envelope.items:
            if item.type == "event":
                self.events.append(json.loads(item.payload.get_bytes()))


@pytest.fixture
def reports():
    transport = Capture()
    assert reporting.init_error_reporting("https://public@example.invalid/1", transport=transport)
    try:
        yield transport.events
    finally:
        sentry_sdk.init()  # off again


def app_that_fails() -> FastAPI:
    app = FastAPI()

    @app.post("/bug")
    async def bug(request: Request):
        body = await request.json()
        espn_s2, swid = body["espn_s2"], body["swid"]  # noqa: F841  (locals a report must not carry)
        try:
            raise RuntimeError("our bug")
        except Exception as e:
            raise espn_failure(e, "loading teams") from e

    @app.post("/espn-down")
    def espn_down():
        try:
            raise ESPNUnavailable("ESPN returned HTTP 503")
        except Exception as e:
            raise espn_failure(e, "loading teams") from e

    @app.post("/crash")
    def crash():
        raise ValueError("unhandled")

    return app


def client_for(app: FastAPI) -> TestClient:
    client = TestClient(app, raise_server_exceptions=False)
    client.cookies.update({"session": SECRETS[4], "espn_s2": SECRETS[0]})
    return client


def call(client: TestClient, path: str):
    return client.post(
        f"{path}?swid={SECRETS[1]}&season=2025",
        json={"espn_s2": SECRETS[0], "swid": SECRETS[1], "password": SECRETS[3]},
        headers={"Authorization": f"Bearer {SECRETS[2]}", "X-Forwarded-For": "203.0.113.5"},
    )


def test_off_without_a_dsn(monkeypatch):
    monkeypatch.delenv("SENTRY_DSN", raising=False)
    assert reporting.init_error_reporting() is False


def test_our_bugs_and_crashes_are_reported_without_credentials(reports):
    client = client_for(app_that_fails())
    assert call(client, "/bug").status_code == 500
    assert call(client, "/crash").status_code == 500
    sentry_sdk.flush()
    # One report each: the bug's own traceback, not also its 500 response.
    assert len(reports) == 2
    messages = json.dumps(reports)
    assert "our bug" in messages and "unhandled" in messages
    assert "season=2025" in messages  # the URL is kept, its swid isn't
    for secret in SECRETS + ["203.0.113.5"]:
        assert secret not in messages, secret


def test_espn_being_down_is_not_reported(reports):
    client = client_for(app_that_fails())
    assert call(client, "/espn-down").status_code == 502
    sentry_sdk.flush()
    assert reports == []


def test_scrub_event_drops_and_filters_credentials():
    event = {
        "request": {
            "url": "https://x/api/leagues/1/teams",
            "cookies": {"session": "s"},
            "data": {"password": "p"},
            "headers": {"Authorization": "Bearer t", "Cookie": "c", "User-Agent": "ua", "X-Forwarded-For": "ip"},
        },
        "user": {"id": 3, "ip_address": "203.0.113.5", "username": "ronan"},
        "extra": {"league": {"espn_s2": "s2", "SWID": "w", "season": 2025}, "list": [{"token_hash": "h"}]},
    }
    out = reporting.scrub_event(event)
    assert out["request"] == {"url": "https://x/api/leagues/1/teams", "headers": {"User-Agent": "ua"}}
    assert out["user"] == {"id": 3}
    assert out["extra"] == {
        "league": {"espn_s2": "[Filtered]", "SWID": "[Filtered]", "season": 2025},
        "list": [{"token_hash": "[Filtered]"}],
    }
