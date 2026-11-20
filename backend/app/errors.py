"""How a failure while loading ESPN data becomes a response: ESPN's own
failures are 502s (a 403 when ESPN refuses the league's cookies), anything
else is our bug, logged with its traceback, a 500. No response carries
exception text.
"""


import logging

import requests
from espn_api.requests.espn_requests import ESPNAccessDenied, ESPNInvalidLeague, ESPNUnknownError
from fastapi import HTTPException

from .espn_client import (
    ESPNUnavailable,
)

log = logging.getLogger("espn_fantasy_stats")


# ESPN being down, slow or refusing, as opposed to a bug on our side.
ESPN_FAILURES = (ESPNInvalidLeague, ESPNUnknownError, ESPNUnavailable, requests.RequestException)


def espn_failure(e: Exception, what: str) -> HTTPException:
    """The response for an exception caught while loading ESPN data.

    - An HTTPException raised on purpose inside the `try` passes through.
    - ESPN refusing the league's cookies is a 403 saying so (not 401, which
      the frontend takes as the user's own session expiring).
    - ESPN failing is a 502 with a fixed message, logged as a warning.
    - Anything else is our bug: a 500, logged with its traceback.

    No response carries the exception's text: it can hold hostnames, SQL or
    credentials-adjacent detail, and it's no use to the reader anyway.
    """
    if isinstance(e, HTTPException):
        return e
    if isinstance(e, ESPNAccessDenied):
        log.warning("ESPN refused access (%s): %s", what, e)
        return HTTPException(
            status_code=403,
            detail="ESPN refused access to this league. If it's private, its cookies may have expired: "
            "update them on the Leagues page.",
        )
    if isinstance(e, ESPN_FAILURES):
        log.warning("ESPN failed (%s): %r", what, e)
        return HTTPException(status_code=502, detail="ESPN didn't answer just now. Try again in a minute.")
    log.error("Unexpected error (%s)", what, exc_info=e)
    return HTTPException(status_code=500, detail="Something went wrong on our side.")
