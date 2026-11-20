"""The FastAPI application: middleware, the health check, and the routers.

Everything lives under `/api`. Endpoints are grouped by area in `app/routes/`:

- auth            login, logout, signup with an invite code, password change,
                  personal API tokens, invite codes (admins)
- leagues         the signed-in user's leagues (`/api/me/leagues`)
- seasons         `/api/leagues/{league_id}/...` season data: teams, scoreboard,
                  box scores, playoffs, positional stats, owner history...
- transactions    transactions and trades
- teams           Team Hub, head to head
- power_rankings  power rankings

`league_id` in `/api/leagues/{league_id}/...` is the ESPN league id;
`deps.get_user_league` checks the user has added that league (and that ESPN
confirmed their access) and decrypts its cookies. Data endpoints read
through `loaders`: the cached payload when it's fresh enough, otherwise
fetched from ESPN through `espn_client`, serialised, stored and returned
(`?refresh=true` skips the cache). Failures go through
`errors.espn_failure`. Feature logic lives in its own modules (team_hub,
rivalries, trades, power_rankings...) as pure functions.

Interactive API docs are served at `/docs` when the backend is running.
"""

import logging
import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from starlette.middleware.sessions import SessionMiddleware

from . import cache  # noqa: F401  (tests patch main.cache)
from .config import ALLOWED_ORIGINS, COOKIE_SAME_SITE, COOKIE_SECURE, SECRET_KEY
from .deps import LeagueContext, get_user_league  # noqa: F401  (re-exported for tests)
from .errors import ESPN_FAILURES, espn_failure, log  # noqa: F401  (re-exported)
from .espn_client import ESPNUnavailable, WeekNotPlayedError  # noqa: F401  (re-exported)
from .reporting import init_error_reporting
from .routes import auth, leagues, power_rankings, seasons, teams, transactions

logging.basicConfig(
    level=os.environ.get("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
# Sentry, when SENTRY_DSN is set; credentials are scrubbed (app/reporting.py).
init_error_reporting()

app = FastAPI(title="espn_fantasy_stats")

app.add_middleware(
    SessionMiddleware,
    secret_key=SECRET_KEY,
    same_site=COOKIE_SAME_SITE,
    https_only=COOKIE_SECURE,
    max_age=60 * 60 * 24 * 30,  # 30 days
)

# Power rankings ship every write-up in one response; text compresses ~4x.
app.add_middleware(GZipMiddleware, minimum_size=1000)


@app.middleware("http")
async def no_sniffing(request: Request, call_next):
    """Browsers must take every response as the type it says it is."""
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    """Liveness probe. Deliberately does not touch Postgres — the keep-warm
    cron hits this every few minutes, and waking Neon that often would burn
    its free compute-hour budget for no benefit."""
    return {"ok": True}


# In the order the endpoints were declared before the split.
for module in (auth, leagues, seasons, transactions, teams, power_rankings):
    app.include_router(module.router)
