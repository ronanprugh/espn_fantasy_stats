"""espn_fantasy_stats backend: a FastAPI app over ESPN Fantasy Football data.

Module map (see backend/README.md for the full picture):

- main            FastAPI app, middleware, health check; includes the routers
- routes/         the endpoints, one router per area (auth, leagues, seasons,
                  transactions, teams, power_rankings)
- deps            get_user_league: the league dependency of every data route
- loaders         cached ESPN loaders (teams, matchups, box scores, activity,
                  trade results, positional stats)
- errors          espn_failure: how failures become responses
- config          environment variables, read once at import
- database        SQLAlchemy engine and the request-scoped session dependency
- models          ORM tables (users, leagues, cache, power rankings, trades)
- schemas         Pydantic request and response models (the API contract)
- auth            passwords, sessions, API tokens and the auth dependencies
- crypto          Fernet encryption of ESPN cookies at rest
- cache           Postgres-backed cache of ESPN payloads
- espn_client     espn_api wrapper: fetching, refresh points, serialisation
- season_state    whether a season or a game is finished
- accolades, rivalries, team_hub, power_rankings, trades
                  pure feature logic over cached payloads (unit tested)
- trade_store     stored trade results
- admin           command-line user and league management
"""
