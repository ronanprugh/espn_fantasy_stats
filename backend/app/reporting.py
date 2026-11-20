"""Error reporting to Sentry, off unless SENTRY_DSN is set.

When on, every unhandled exception and every `log.error` (our bugs, see
`errors.espn_failure`) becomes an error report. ESPN being down is a warning
and isn't reported. Nothing that can carry a credential leaves the process:

- no request cookies, Authorization header, IP addresses or request bodies
  (bodies carry passwords and ESPN cookies), and no local variables;
- any field named like a credential (ESPN's espn_s2 and SWID, tokens,
  passwords, invite codes, the session cookie) is replaced wherever it
  appears in the report, by `scrub_event` (Sentry's own denylist plus
  ours).

Performance tracing is off: only errors are sent.
"""

import os
from typing import Any

import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.starlette import StarletteIntegration
from sentry_sdk.scrubber import DEFAULT_DENYLIST

# Field names, compared lowercased, whose values are never sent.
CREDENTIAL_KEYS = {
    "espn_s2", "swid", "s2", "cookies", "password_hash", "code_hash", "token_hash",
    "invite_code", "current_password", "new_password", "database_url", "dsn",
}
DENYLIST = sorted({k.lower() for k in DEFAULT_DENYLIST} | CREDENTIAL_KEYS)
FILTERED = "[Filtered]"
# Request headers worth keeping for a report; everything else is dropped.
KEPT_HEADERS = {"user-agent", "accept", "content-type", "referer", "host"}


def _scrub(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            k: FILTERED if isinstance(k, str) and k.lower() in DENYLIST else _scrub(v)
            for k, v in value.items()
        }
    if isinstance(value, list):
        return [_scrub(v) for v in value]
    return value


def scrub_event(event: dict, hint: dict | None = None) -> dict:
    """Last pass over a report before it's sent (Sentry's `before_send`)."""
    request = event.get("request")
    if isinstance(request, dict):
        request.pop("cookies", None)
        request.pop("data", None)
        request.pop("env", None)
        headers = request.get("headers")
        if isinstance(headers, dict):
            request["headers"] = {k: v for k, v in headers.items() if k.lower() in KEPT_HEADERS}
    user = event.get("user")
    if isinstance(user, dict):
        event["user"] = {k: v for k, v in user.items() if k == "id"}
    for key in ("extra", "contexts", "breadcrumbs", "request", "tags"):
        if key in event:
            event[key] = _scrub(event[key])
    return event


def init_error_reporting(dsn: str | None = None, **options: Any) -> bool:
    """Start Sentry if a DSN is configured (SENTRY_DSN); True if it started.
    SENTRY_ENVIRONMENT names the deploy (default "production")."""
    dsn = dsn if dsn is not None else os.environ.get("SENTRY_DSN", "").strip()
    if not dsn:
        return False
    sentry_sdk.init(
        dsn=dsn,
        environment=os.environ.get("SENTRY_ENVIRONMENT", "production"),
        # Nothing from the request but its URL and a few plain headers.
        data_collection={
            "user_info": False,
            "cookies": {"mode": "off"},
            "http_headers": {"request": {"mode": "allowlist", "terms": sorted(KEPT_HEADERS)}},
            "http_bodies": [],
            "url_query_params": {"mode": "denylist"},
            "stack_frame_variables": False,
            "database_query_data": False,
        },
        traces_sample_rate=0,
        # A 5xx response isn't a report in itself: our bugs are reported by
        # their log.error (with the original traceback), and a 502 is ESPN.
        integrations=[
            StarletteIntegration(failed_request_status_codes=set()),
            FastApiIntegration(failed_request_status_codes=set()),
        ],
        before_send=scrub_event,
        **options,
    )
    return True
