"""What a failure looks like to the client: ESPN's problems are 502s (or a
403 for refused cookies), ours are 500s, and none carries exception text."""

import logging

import pytest
import requests
from espn_api.requests.espn_requests import ESPNAccessDenied
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app import main


def test_espn_failure_sorts_exceptions(caplog):
    assert main.espn_failure(requests.Timeout("slow"), "x").status_code == 502
    assert main.espn_failure(main.ESPNUnavailable("no seasons"), "x").status_code == 502
    denied = main.espn_failure(ESPNAccessDenied("League 77 cannot be accessed"), "x")
    assert denied.status_code == 403 and "cookies" in denied.detail
    on_purpose = HTTPException(status_code=404, detail="not played yet")
    assert main.espn_failure(on_purpose, "x") is on_purpose
    with caplog.at_level(logging.ERROR, logger="espn_fantasy_stats"):
        ours = main.espn_failure(KeyError("team_id"), "season 2024")
    assert ours.status_code == 500
    assert "season 2024" in caplog.text and "KeyError" in caplog.text  # logged with its traceback


@pytest.fixture
def league(monkeypatch):
    ctx = main.LeagueContext(espn_league_id=1, espn_s2=None, swid=None, display_name="L")
    main.app.dependency_overrides[main.get_user_league] = lambda: ctx
    yield
    main.app.dependency_overrides.clear()


@pytest.mark.parametrize("error, status", [
    (KeyError("postgres://user:hunter2@db.internal/fantasy"), 500),
    (requests.ConnectionError("host lm-api-reads.fantasy.espn.com: secret detail"), 502),
])
def test_responses_never_carry_exception_text(league, monkeypatch, error, status):
    def boom(*a, **k):
        raise error

    monkeypatch.setattr(main, "discover_years", boom)
    r = TestClient(main.app).get("/api/leagues/1/info")
    assert r.status_code == status
    assert "hunter2" not in r.text and "secret" not in r.text and "db.internal" not in r.text
