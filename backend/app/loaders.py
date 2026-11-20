"""Every season's ESPN data, through the cache: read the payload when it's
fresh enough (`_fresh_since`), otherwise fetch from ESPN through
`espn_client`, serialise, store and return. Also the loaders behind
transactions and trades (the activity feed, its transactions-view
fallback, stored trade results) and positional stats.

Routes call these as `loaders.<name>`, so a test patches one place.
"""


import datetime as dt
import json

import requests
from sqlalchemy.orm import Session

from . import cache, trade_store
from .deps import LeagueContext
from .errors import espn_failure
from .espn_client import (
    ESPN_TIMEOUT,
    POSITIONS_ORDER,
    WeekNotPlayedError,
    compute_positional_week_points,
    discover_years,
    get_league,
    get_scoring_type,
    is_live_season,
    last_refresh_point,
    serialize_all_matchups,
    serialize_box_scores,
    serialize_scoreboard,
    serialize_teams,
)
from .season_state import season_over
from .trades import (
    ACTIVITY_MESSAGE_TYPES,
    activity_from_topic,
    activity_from_transaction,
    player_position,
    team_fields,
    topic_key,
    topic_player_ids,
    trade_events,
    trade_outcomes,
    trades_from_activity,
    trades_from_rosters,
    trades_that_went_through,
    transaction_player_ids,
)


def _fresh_since(year: int) -> dt.datetime | None:
    """Oldest acceptable fetch time for a season's cached data: the latest
    refresh point (see REFRESH_POINTS) while it's being played, none once
    it's over."""
    return last_refresh_point() if is_live_season(year) else None


def _get_season_teams(
    league_id: int, year: int, espn_s2: str | None, swid: str | None, refresh: bool = False
) -> dict:
    if not refresh:
        cached = cache.get(league_id, year, cache.TEAMS, fresh_since=_fresh_since(year))
        if cached:
            return cached
    league = get_league(league_id, year, espn_s2=espn_s2, swid=swid)
    payload = {
        "league_id": league_id,
        "year": year,
        "scoring_type": get_scoring_type(league),
        "teams": serialize_teams(league),
    }
    cache.put(league_id, year, cache.TEAMS, payload)
    return payload


def _get_season_matchups(
    league_id: int, year: int, espn_s2: str | None, swid: str | None, refresh: bool = False
) -> list[dict]:
    if not refresh:
        cached = cache.get(league_id, year, cache.MATCHUPS, fresh_since=_fresh_since(year))
        if cached:
            return cached["matchups"]
    league = get_league(league_id, year, espn_s2=espn_s2, swid=swid)
    matchups = serialize_all_matchups(league)
    cache.put(league_id, year, cache.MATCHUPS, {"matchups": matchups})
    return matchups


def _get_season_box_scores(
    league_id: int, year: int, week: int, espn_s2: str | None, swid: str | None,
    refresh: bool = False,
) -> dict:
    """Cached per-week box scores (the same payload the API endpoint serves).

    A copy is kept for good only if the week was over when it was fetched
    (`complete`); one fetched while the week was being played is fetched
    again. Without that, a copy saved mid-game, or before the guard below
    existed, under a week ESPN hadn't reached (ESPN answers with the current
    week's games), was kept for good once the week left the refresh window.

    In a live season the two most recently completed weeks and later also go
    stale at each refresh point, so ESPN's stat corrections, which land the
    Tuesday after the games, are picked up. Earlier complete weeks are final:
    refreshing them would turn every positional-stats rebuild into one ESPN
    fetch per week of the season.

    Raises WeekNotPlayedError for a week of the live season ESPN hasn't
    reached yet.
    """
    # Before the cache lookup, so box scores cached under a future week's key
    # back when nothing guarded this (they hold the then-current week's data)
    # are never served. They're replaced once that week is actually played.
    live = is_live_season(year)
    if live and week > get_league(league_id, year, espn_s2, swid).current_week:
        raise WeekNotPlayedError(f"Week {week} of {year} hasn't been played yet.")
    cache_key = cache.box_scores_key(week)
    fresh_since = None
    if live:
        teams = _get_season_teams(league_id, year, espn_s2, swid)["teams"]
        played = max((t["wins"] + t["losses"] + t["ties"] for t in teams), default=0)
        if week >= played - 1:
            fresh_since = last_refresh_point()
    if not refresh:
        cached = cache.get(league_id, year, cache_key, fresh_since=fresh_since)
        # Outside the refresh window only a copy of a finished week will do.
        if cached and (cached.get("complete") or fresh_since is not None):
            return cached
    league = get_league(league_id, year, espn_s2=espn_s2, swid=swid)
    matchups = serialize_box_scores(league, week)
    payload = {
        "league_id": league_id,
        "year": year,
        "week": week,
        "matchups": matchups,
        # Over when fetched: ESPN has moved on to a later week, or the season
        # is over.
        "complete": not live or week < league.current_week,
    }
    cache.put(league_id, year, cache_key, payload)
    return payload


# ESPN's activity feed pages 25 at a time; a season of adds and drops can
# run to several hundred.
ACTIVITY_PAGE = 25


ACTIVITY_MAX_PAGES = 200


# Players looked up per player-card request.
PLAYER_CARD_CHUNK = 100


def _communication_page(league, headers: dict) -> dict:
    """One page of the league's activity feed (ESPN's "communication").

    espn_api answers a 404 here with an empty page, which is how ESPN replies
    for many past seasons, so an empty page can mean "not served" as well as
    "nothing happened". And for a season espn_api reads from the leagueHistory
    endpoint, its league_get would append "/communication/" after that
    endpoint's `?seasonId=` query, so the feed is requested from the season's
    own endpoint instead. Anything but a page of topics comes back as {}.
    """
    req = league.espn_request
    params = {"view": "kona_league_communication"}
    endpoint = getattr(req, "LEAGUE_ENDPOINT", "")
    if "/leagueHistory/" in endpoint:
        base = endpoint.split("/leagueHistory/")[0]
        url = f"{base}/seasons/{req.year}/segments/0/leagues/{req.league_id}/communication/"
        r = requests.get(url, params=params, headers=headers, cookies=req.cookies, timeout=ESPN_TIMEOUT)
        data = r.json() if r.status_code == 200 else {}
    else:
        data = req.league_get(extend="/communication/", params=params, headers=headers)
    return data if isinstance(data, dict) else {}


def _fetch_activity_topics(league) -> list[dict]:
    """Every activity topic in the league season, newest first, read straight
    from ESPN (the same request espn_api's recent_activity makes, without its
    per-player lookups). Pages until ESPN returns nothing new: a short page
    isn't taken as the end, since ESPN may cap a page below the size asked."""
    topics: list[dict] = []
    seen: set[str] = set()
    offset = 0
    for _ in range(ACTIVITY_MAX_PAGES):
        filters = {
            "topics": {
                "filterType": {"value": ["ACTIVITY_TRANSACTIONS"]},
                "limit": ACTIVITY_PAGE,
                "limitPerMessageSet": {"value": 25},
                "offset": offset,
                "sortMessageDate": {"sortPriority": 1, "sortAsc": False},
                "sortFor": {"sortPriority": 2, "sortAsc": False},
                "filterIncludeMessageTypeIds": {"value": ACTIVITY_MESSAGE_TYPES},
            }
        }
        data = _communication_page(league, {"x-fantasy-filter": json.dumps(filters)})
        batch = data.get("topics") or []
        fresh = [t for t in batch if topic_key(t) not in seen]
        if not fresh:
            break
        seen.update(topic_key(t) for t in fresh)
        topics.extend(fresh)
        offset += len(batch)
    return topics


def _fetch_transactions(league) -> list[dict]:
    """Every transaction in the season from ESPN's transactions view
    (`mTransactions2`), one request per scoring period, deduplicated by id.
    The fallback for seasons the activity feed doesn't serve."""
    found: dict[str, dict] = {}
    last = getattr(league, "finalScoringPeriod", None) or 18
    for period in range(1, last + 1):
        data = league.espn_request.league_get(
            params={"view": "mTransactions2", "scoringPeriodId": period}
        )
        for tx in (data or {}).get("transactions") or []:
            found.setdefault(str(tx.get("id") or len(found)), tx)
    return sorted(found.values(), key=lambda t: t.get("processDate") or t.get("proposedDate") or 0, reverse=True)


def _has_games(league) -> bool:
    return any((getattr(t, "wins", 0) + getattr(t, "losses", 0) + getattr(t, "ties", 0)) > 0 for t in league.teams)


def _player_directory(league, player_ids: set[int]) -> dict[int, dict]:
    """Name and position for each player, in a request per hundred players
    rather than espn_api's two per player. Falls back to the league's name map
    (names only) for anyone the player cards miss."""
    names = getattr(league, "player_map", {}) or {}
    ids = sorted(player_ids)
    out: dict[int, dict] = {}
    for i in range(0, len(ids), PLAYER_CARD_CHUNK):
        try:
            data = league.espn_request.get_player_card(
                ids[i:i + PLAYER_CARD_CHUNK], getattr(league, "finalScoringPeriod", None) or 18
            )
        except Exception:
            data = {}
        for entry in (data or {}).get("players") or []:
            info = entry.get("player") or entry
            pid = info.get("id", entry.get("id"))
            if isinstance(pid, int):
                out[pid] = {
                    "name": info.get("fullName") or names.get(pid) or f"Player {pid}",
                    "position": player_position(info),
                }
    for pid in ids:
        if pid not in out and isinstance(names.get(pid), str):
            out[pid] = {"name": names[pid], "position": ""}
    return out


ACTIVITY_KEY = cache.ACTIVITY


def _load_season_activity(
    league_id: int, year: int, espn_s2: str | None, swid: str | None, refresh: bool = False
) -> dict:
    """Every transaction in the season (2019 on): trades, waiver claims,
    free-agent pickups and drops, as plain dicts (app/trades.py), in
    `{"activities": [...], "unavailable": bool, "source": ..., "trade_events":
    [...]}`. One fetch serves trades and transactions.

    Read from the activity feed, or for a season the feed doesn't serve, from
    the transactions view. A season with games but nothing from either source
    is `unavailable`: ESPN didn't say, which is not the same as nothing
    happening. That answer is cached only until the next refresh point, so a
    season is never stuck empty; real answers are cached like other ESPN data.
    """
    if not refresh:
        cached = cache.get(league_id, year, ACTIVITY_KEY, fresh_since=_fresh_since(year))
        if cached and cached.get("unavailable"):
            cached = cache.get(league_id, year, ACTIVITY_KEY, fresh_since=last_refresh_point())
        if cached:
            return cached
    league = get_league(league_id, year, espn_s2=espn_s2, swid=swid)
    teams = {t.team_id: team_fields(t) for t in league.teams}
    topics = _fetch_activity_topics(league)
    events: list[dict] = []
    espn_trades = None
    if topics:
        source = "feed"
        players = _player_directory(league, topic_player_ids(topics))
        activities = [activity_from_topic(t, teams.get, players) for t in topics]
    elif _has_games(league):
        # The transactions view keeps a past season's waiver claims, pickups
        # and drops, but of its trades only when they went through: the
        # players are rebuilt from the rosters (_season_trade_results).
        source = "transactions"
        transactions = _fetch_transactions(league)
        players = _player_directory(league, transaction_player_ids(transactions))
        activities = [a for t in transactions if (a := activity_from_transaction(t, teams.get, players))]
        events = trade_events(transactions)
        espn_trades = trades_that_went_through(transactions)
    else:
        source, activities = "none", []
    payload = {
        "activities": activities,
        "unavailable": not activities and _has_games(league),
        "source": source,
        "trade_events": events,
        # For seasons rebuilt from rosters: ESPN's own count, to check against.
        "espn_trade_count": espn_trades,
    }
    cache.put(league_id, year, ACTIVITY_KEY, payload)
    return payload


def _get_season_activity(
    league_id: int, year: int, espn_s2: str | None, swid: str | None, refresh: bool = False
) -> list[dict]:
    """The season's activities alone (see _load_season_activity)."""
    return _load_season_activity(league_id, year, espn_s2, swid, refresh)["activities"]


def _season_trade_results(
    db: Session, ctx: LeagueContext, year: int, refresh: bool = False
) -> list[dict]:
    """The season's trades with their results, from the stored calculation
    (app/trade_store.py) when it's current, else calculated and stored."""
    lid = ctx.espn_league_id
    if not refresh and trade_store.is_current(db, lid, year):
        return trade_store.load(db, lid, [year])
    activity = _load_season_activity(lid, year, ctx.espn_s2, ctx.swid, refresh)
    # From the transactions view, trades are rebuilt from the rosters: that
    # view lists the players of a past trade only to a member who was in it,
    # so the trades it does list are the viewer's own, not the league's. Not with nothing from it at all, though: without its pickups
    # to tell them apart, every waiver claim would look like a trade.
    from_rosters = activity.get("source") == "transactions" and not activity["unavailable"]
    trades = [] if from_rosters else trades_from_activity(activity["activities"], year)
    season_teams = _get_season_teams(lid, year, ctx.espn_s2, ctx.swid)
    # Final once the season is over: its results can't change after that.
    # Not while ESPN's data for it was missing or partial, though: final
    # results are kept for good, so those are recalculated next time instead.
    final = season_over(season_teams) and not activity["unavailable"]
    # Every completed week's box scores: WAR's baselines and the points per
    # game draw on the whole season. The week being played is left out until
    # it's over, so its partial scores don't count as games.
    box_by_week: dict[int, dict] = {}
    if trades or from_rosters:
        weeks = _get_season_scoreboard(lid, year, ctx.espn_s2, ctx.swid)["weeks"]
        current = None
        if is_live_season(year) and not final:
            current = get_league(lid, year, espn_s2=ctx.espn_s2, swid=ctx.swid).current_week
        for week in weeks:
            if current is not None and week >= current:
                break
            try:
                box_by_week[week] = _get_season_box_scores(lid, year, week, ctx.espn_s2, ctx.swid)
            except WeekNotPlayedError:
                break
            except Exception:
                # A week ESPN wouldn't serve: calculate without it for now,
                # and try again after the next refresh point.
                final = False
                continue
    if from_rosters:
        teams = {t["team_id"]: _team_fields(t) for t in season_teams["teams"]}
        # Trades ESPN lists in full (a member's own) stand as listed; the
        # rosters fill in everyone else's.
        known = trades_from_activity(activity["activities"], year)
        trades = trades_from_rosters(
            box_by_week, activity["activities"], activity.get("trade_events", []), teams.get, year, known
        )
    trade_store.save(
        db, lid, year, trade_outcomes(trades, box_by_week), final, activity.get("espn_trade_count")
    )
    return trade_store.load(db, lid, [year])


def _team_fields(team: dict) -> dict:
    """A serialized team (SeasonTeams) as the fields a trade side keeps."""
    owner = team["owners"][0] if team.get("owners") else {}
    return {
        "team_id": team["team_id"],
        "team_name": team["team_name"],
        "owner_id": owner.get("id", ""),
        "owner_name": f"{owner.get('first_name', '')} {owner.get('last_name', '')}".strip() or "—",
    }


def _activity_unavailable(ctx: LeagueContext, year: int) -> bool:
    """Whether ESPN gave nothing for a season that was played (cached)."""
    return _load_season_activity(ctx.espn_league_id, year, ctx.espn_s2, ctx.swid)["unavailable"]


def _transaction_years(ctx: LeagueContext) -> list[int]:
    years = discover_years(ctx.espn_league_id, espn_s2=ctx.espn_s2, swid=ctx.swid)
    return [y for y in years if y >= 2019]


def _compute_positional_stats_for_year(
    league_id: int, year: int, espn_s2: str | None, swid: str | None, refresh: bool = False
) -> dict:
    """Build per-position-per-team stats for one season. Requires year >= 2019.

    "Playoff" stats only count weeks where the team played in the championship
    bracket (round_label in playoff/semifinal/championship). Consolation and
    toilet-bowl weeks count toward total_points/games_played but NOT toward
    playoff_points/playoff_games — same convention as elsewhere in the app.
    """
    if year < 2019:
        raise ValueError("Positional stats require 2019 or later")

    if not refresh:
        cached = cache.get(league_id, year, cache.POSITIONAL_STATS, fresh_since=_fresh_since(year))
        if cached and cached.get("missing_weeks"):
            # Built without a week ESPN wouldn't serve: good only until the
            # next refresh point, then tried again.
            cached = cache.get(league_id, year, cache.POSITIONAL_STATS, fresh_since=last_refresh_point())
        if cached:
            return cached

    teams_payload = _get_season_teams(league_id, year, espn_s2, swid, refresh)
    matchups = _get_season_matchups(league_id, year, espn_s2, swid, refresh)

    league = get_league(league_id, year, espn_s2=espn_s2, swid=swid)
    reg_season_count = league.settings.reg_season_count
    playoff_team_count = league.settings.playoff_team_count
    total_weeks = max((len(t.outcomes) for t in league.teams), default=0)
    if is_live_season(year):
        played = max(
            (t["wins"] + t["losses"] + t["ties"] for t in teams_payload["teams"]), default=0
        )
        # Completed weeks only. The week in progress would count partial
        # points as a full game, and right after ESPN closes out a week the
        # next one is "current" before a snap is played, so it would count
        # every lineup slot as a 0-point game.
        total_weeks = min(total_weeks, played)

    # Build per-week set of team_ids that played a real championship-bracket game.
    championship_teams_by_week: dict[int, set[int]] = {}
    for m in matchups:
        if m.get("round_label") in {"playoff", "semifinal", "championship"}:
            championship_teams_by_week.setdefault(m["week"], set()).update(
                {m["team_a_id"], m["team_b_id"]}
            )

    # team_id -> position -> { tot_pts, tot_games, po_pts, po_games }
    acc: dict[int, dict[str, dict]] = {}
    missing_weeks: list[int] = []

    for week in range(1, total_weeks + 1):
        try:
            bs = _get_season_box_scores(league_id, year, week, espn_s2, swid, refresh)
        except Exception:
            # Counted without this week for now, and said so; the payload is
            # then cached only until the next refresh point (see above).
            missing_weeks.append(week)
            continue
        week_points = compute_positional_week_points(bs)
        championship_set = championship_teams_by_week.get(week, set())
        for team_id, by_pos in week_points.items():
            in_championship_bracket = team_id in championship_set
            for pos, pts in by_pos.items():
                row = (
                    acc.setdefault(team_id, {})
                    .setdefault(pos, {"tot_pts": 0.0, "tot_games": 0, "po_pts": 0.0, "po_games": 0})
                )
                row["tot_pts"] += pts
                row["tot_games"] += 1
                if in_championship_bracket:
                    row["po_pts"] += pts
                    row["po_games"] += 1

    positions: list[dict] = []
    for pos in POSITIONS_ORDER:
        rows: list[dict] = []
        for team in teams_payload["teams"]:
            stats = acc.get(team["team_id"], {}).get(pos, {
                "tot_pts": 0.0, "tot_games": 0, "po_pts": 0.0, "po_games": 0,
            })
            owner = team["owners"][0] if team["owners"] else {}
            owner_name = (
                f"{owner.get('first_name', '')} {owner.get('last_name', '')}".strip() or "—"
            )
            rows.append({
                "team_id": team["team_id"],
                "team_name": team["team_name"],
                "owner_id": owner.get("id", ""),
                "owner_name": owner_name,
                "total_points": round(stats["tot_pts"], 2),
                "games_played": stats["tot_games"],
                "avg_ppg": round(stats["tot_pts"] / stats["tot_games"], 2) if stats["tot_games"] else 0.0,
                "playoff_points": round(stats["po_pts"], 2),
                "playoff_games": stats["po_games"],
                "playoff_ppg": round(stats["po_pts"] / stats["po_games"], 2) if stats["po_games"] else 0.0,
                "made_playoffs": team["standing"] <= playoff_team_count,
            })
        rows.sort(key=lambda r: r["total_points"], reverse=True)
        positions.append({"position": pos, "teams": rows})

    payload = {
        "league_id": league_id,
        "year": year,
        "reg_season_count": reg_season_count,
        "positions": positions,
        "missing_weeks": missing_weeks,
    }
    cache.put(league_id, year, cache.POSITIONAL_STATS, payload)
    return payload


def _get_season_scoreboard(
    league_id: int, year: int, espn_s2: str | None, swid: str | None, refresh: bool = False
) -> dict:
    if not refresh:
        cached = cache.get(league_id, year, cache.SCOREBOARD, fresh_since=_fresh_since(year))
        if cached:
            return cached
    league = get_league(league_id, year, espn_s2=espn_s2, swid=swid)
    data = serialize_scoreboard(league, year)
    payload = {"league_id": league_id, **data}
    cache.put(league_id, year, cache.SCOREBOARD, payload)
    return payload


def _load_season_teams(ctx: LeagueContext, years: list[int], refresh: bool) -> list[dict]:
    seasons = []
    for year in years:
        try:
            seasons.append(
                _get_season_teams(ctx.espn_league_id, year, ctx.espn_s2, ctx.swid, refresh)
            )
        except Exception as e:
            raise espn_failure(e, f"season {year}") from e
    return seasons
