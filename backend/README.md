# Backend

FastAPI app over ESPN Fantasy Football data, with Postgres for users, leagues,
a shared cache of ESPN responses, power rankings and stored trade results.
Setup and running it locally are in the [root README](../README.md); this page
is how the code fits together.

With the server running, interactive API docs are at
<http://localhost:8000/docs>: every endpoint, its parameters and its response
shape.

## Layout

```
backend/
├── app/
│   ├── main.py            FastAPI app, middleware, every endpoint
│   ├── config.py          environment variables (see .env.example)
│   ├── database.py        engine, SessionLocal, get_db dependency
│   ├── models.py          ORM tables
│   ├── schemas.py         Pydantic request/response models (the API contract)
│   ├── auth.py            passwords, sessions, API tokens, auth dependencies
│   ├── crypto.py          Fernet encryption of ESPN cookies
│   ├── cache.py           Postgres cache of ESPN payloads
│   ├── espn_client.py     espn_api wrapper: fetch, refresh points, serialise
│   ├── season_state.py    is a season / game finished?
│   ├── accolades.py       Team Hub trophies          ┐
│   ├── team_hub.py        Team Hub records, schedule │ pure functions over
│   ├── rivalries.py       Head to Head summary       │ cached payloads,
│   ├── power_rankings.py  rankings import and layout │ unit tested
│   ├── trades.py          transactions, trade WAR    ┘
│   ├── trade_store.py     stored trade results
│   └── admin.py           admin CLI (python -m app.admin)
├── alembic/               migrations (see alembic/README)
├── scripts/               one-off diagnostics
└── tests/                 pytest suite
```

## How a request flows

1. **Auth.** `SessionMiddleware` keeps the signed-in user's id in a signed
   cookie. Endpoints depend on `auth.current_user`, which also accepts a
   personal API token (`Authorization: Bearer efs_…`) for read-only requests.
   A 401 always means "no valid credentials": the frontend signs the user out
   on any 401, so wrong input from a signed-in user is a 400.
2. **League access.** Every `/api/leagues/{league_id}/…` endpoint depends on
   `get_user_league`. `league_id` is the **ESPN** league id; the dependency
   checks the user has added that league and decrypts its cookies into a
   `LeagueContext`. ESPN data is cached and shared by league id, so a league
   row is only usable once ESPN has confirmed its cookies (or none, for a
   public league) can read the league (`espn_client.check_league_access`):
   when it's added, when its cookies change, and on first use for older rows.
3. **Data.** A `_get_season_*` helper reads the payload from the `cache`
   table. If it's missing or stale it fetches from ESPN through
   `espn_client`, serialises it to plain dicts, stores it and returns it.
   `?refresh=true` skips the cache.
4. **Failures.** Wrap ESPN loading in `try`/`except Exception as e:
   raise espn_failure(e, "what was being loaded") from e`. ESPN's own failures
   become a 502 (or a 403 when ESPN refuses the league's cookies), anything
   else is logged with its traceback and becomes a 500, and no response
   carries exception text. Set `LOG_LEVEL` to change logging (default INFO).
5. **Feature logic.** The pure modules (`team_hub`, `rivalries`,
   `power_rankings`, `trades`, …) turn those payloads into the response. They
   take dicts and return dicts, so tests need no ESPN and no database.

## Caching and freshness

- The `cache` table is keyed on (ESPN league id, season, key), so every user
  who adds a league shares one copy. Keys carry a version: `teams_v3`,
  `matchups_v2`, `scoreboard_v2`, `playoffs_v1`, `positional_stats_v3`,
  `activity_v3`, `box_scores_v1_w{week}`. **Bump the version whenever a
  payload's shape changes**; old rows are then ignored.
- **Finished seasons** are cached indefinitely.
- **The live season** goes stale at fixed weekly *refresh points*
  (`espn_client.REFRESH_POINTS`, Eastern time): midnight daily, Sunday 4:30pm
  and 8:15pm, Monday 1am and Tuesday 9am. Nothing runs on a schedule. The
  first request after a refresh point re-fetches.
- `espn_client.get_league` also keeps espn_api `League` objects in memory per
  process, on the same refresh points. `discover_years` is cached per process
  until restart.
- Trade results are expensive (every week's box scores), so they are stored
  in `trade_records`/`trade_record_sides`/`trade_record_players`, with
  `trade_syncs` saying when. A finished season's results are final. A season
  whose ESPN data was missing or partial is never stored as final.

## ESPN quirks worth knowing

- **Team ids are per season.** A team slot can change hands, so anything
  spanning seasons groups by owner id.
- **Box scores and league activity start in 2019.** Endpoints return 400, or
  `supported: false`, for earlier seasons.
- **Unplayed and live games.** ESPN lists a live season's whole schedule, so
  `season_state` decides what counts as a result. Unplayed games are 0–0 with
  no winner. Games in progress have points but no winner.
- **Asking for a future week** returns the current week's data under the
  future week's number. `_get_season_box_scores` raises `WeekNotPlayedError`
  instead.
- **Past seasons' transactions.** The activity feed (`/communication/`)
  answers 404 for past seasons, and espn_api passes that on as "no activity".
  For those seasons the app reads `mTransactions2`, which keeps waiver claims,
  pickups and drops. It lists an accepted trade's players only to members who
  were in that trade, so other past trades are rebuilt
  (`trades.trades_from_rosters`): each player's owner is followed through the
  draft, pickups, drops and weekly rosters, and a player who turns up with,
  or is dropped by, a team other than his owner was traded to it.
  Limits of the rebuild, since rosters are weekly: two trades between the same
  two teams within a week of each other show as one (the page compares the
  count with ESPN's and says so), and a player traded twice in a week
  is credited through the middle team only when that's unambiguous. The
  middle team's line then says "traded on to …".
  `scripts/diagnose_transactions.py` prints what ESPN returns for each season
  of your league.

## Common changes

- **New endpoint:** add a response model to `schemas.py` and the endpoint to
  `main.py` (with a docstring; it shows in `/docs`). Mirror the type and add a
  fetch function in `frontend/src/api.ts`. Put real logic in a pure module
  with tests.
- **Model change:** edit `models.py`, then
  `alembic revision --autogenerate -m "…"`. Review the generated file, and
  keep migrations additive where you can (see alembic/README).
- **Changing a cached payload's shape:** bump its cache key's version.

## Tests and lint

```bash
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest          # in-memory SQLite and ESPN fakes; no Postgres needed
.venv/bin/ruff check .
```

CI (`.github/workflows/ci.yml`) runs both on every pull request.

## Admin CLI

```bash
.venv/bin/python -m app.admin create-user --username NAME [--admin]
.venv/bin/python -m app.admin set-admin --username NAME [--revoke]
.venv/bin/python -m app.admin add-league --username NAME --league-id ID --name "League" [--espn-s2 … --swid …]
.venv/bin/python -m app.admin reset-password --username NAME
.venv/bin/python -m app.admin list-users
.venv/bin/python -m app.admin seed-from-env --username NAME [--name "League"]
```

Admins can generate invite codes from the Account page. To run these
against production, point `DATABASE_URL` at Neon.
