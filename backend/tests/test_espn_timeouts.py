"""Every ESPN request has a time limit, including the ones espn_api makes."""

import espn_api.requests.espn_requests as espn_requests

from app import espn_client


def test_espn_api_requests_get_a_default_timeout(monkeypatch):
    seen = {}

    def get(url, **kwargs):
        seen.update(kwargs)
        raise RuntimeError("stop here")

    monkeypatch.setattr(espn_client.requests, "get", get)
    req = espn_requests.EspnFantasyRequests("nfl", 2025, 77)
    try:
        req.league_get(params={"view": "mSettings"})
    except RuntimeError:
        pass
    assert seen["timeout"] == espn_client.ESPN_TIMEOUT


def test_an_explicit_timeout_is_kept_and_other_names_pass_through(monkeypatch):
    seen = {}
    monkeypatch.setattr(espn_client.requests, "get", lambda url, **kw: seen.update(kw))
    espn_requests.requests.get("https://example.invalid", timeout=5)
    assert seen["timeout"] == 5
    assert espn_requests.requests.exceptions is espn_client.requests.exceptions
