"""Season data: the league's seasons, teams and standings, scoreboard, box
scores, playoffs, positional stats, owner history, career totals and close
games.
"""


from fastapi import APIRouter, Depends, HTTPException

from .. import cache, loaders
from ..deps import LeagueContext, get_user_league
from ..errors import espn_failure
from ..espn_client import (
    CLOSE_GAME_MARGIN,
    POSITIONS_ORDER,
    WeekNotPlayedError,
    aggregate_by_owner,
    build_owner_history,
    close_game_records,
    serialize_playoffs,
)
from ..schemas import (
    AllSeasons,
    CloseGames,
    LeagueAggregate,
    LeagueInfo,
    LeagueOwnerHistory,
    LeaguePositionalAggregate,
    SeasonPlayoffs,
    SeasonPositionalStats,
    SeasonScoreboard,
    SeasonTeams,
    WeekBoxScores,
)

router = APIRouter()


@router.get("/api/leagues/{league_id}/info", response_model=LeagueInfo)
def league_info(ctx: LeagueContext = Depends(get_user_league)):
    """The league's display name and every season it has played."""
    try:
        years = loaders.discover_years(ctx.espn_league_id, espn_s2=ctx.espn_s2, swid=ctx.swid)
    except Exception as e:
        raise espn_failure(e, "discovering seasons") from e
    return LeagueInfo(
        espn_league_id=ctx.espn_league_id,
        display_name=ctx.display_name,
        years=years,
    )


@router.get("/api/leagues/{league_id}/seasons/{year}/teams", response_model=SeasonTeams)
def teams(year: int, refresh: bool = False, ctx: LeagueContext = Depends(get_user_league)):
    """Every team in a season: owners, record, points, standings and weekly scores."""
    try:
        return loaders._get_season_teams(ctx.espn_league_id, year, ctx.espn_s2, ctx.swid, refresh)
    except Exception as e:
        raise espn_failure(e, "loading ESPN data") from e


@router.get(
    "/api/leagues/{league_id}/seasons/{year}/scoreboard",
    response_model=SeasonScoreboard,
)
def scoreboard(year: int, refresh: bool = False, ctx: LeagueContext = Depends(get_user_league)):
    """Every matchup in a season, week by week, with names, scores and round."""
    try:
        return loaders._get_season_scoreboard(ctx.espn_league_id, year, ctx.espn_s2, ctx.swid, refresh)
    except Exception as e:
        raise espn_failure(e, "loading ESPN data") from e


@router.get(
    "/api/leagues/{league_id}/seasons/{year}/weeks/{week}/box_scores",
    response_model=WeekBoxScores,
)
def box_scores(
    year: int, week: int, refresh: bool = False, ctx: LeagueContext = Depends(get_user_league)
):
    """Every game in one week with both lineups, player by player (2019 on).
    404 for a week of the live season that hasn't been reached."""
    if year < 2019:
        raise HTTPException(
            status_code=400,
            detail="Box scores are only available for seasons 2019 and later.",
        )
    try:
        return loaders._get_season_box_scores(
            ctx.espn_league_id, year, week, ctx.espn_s2, ctx.swid, refresh
        )
    except WeekNotPlayedError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise espn_failure(e, "loading ESPN data") from e


@router.get(
    "/api/leagues/{league_id}/seasons/{year}/positional_stats",
    response_model=SeasonPositionalStats,
)
def positional_stats_for_year(
    year: int,
    refresh: bool = False,
    ctx: LeagueContext = Depends(get_user_league),
):
    """Points by lineup position (QB, RB, ... D/ST) for each team in a season,
    regular season and championship-bracket playoffs (2019 on)."""
    if year < 2019:
        raise HTTPException(
            status_code=400,
            detail="Positional stats require seasons from 2019 onward (box-score data).",
        )
    try:
        return loaders._compute_positional_stats_for_year(
            ctx.espn_league_id, year, ctx.espn_s2, ctx.swid, refresh
        )
    except Exception as e:
        raise espn_failure(e, "loading ESPN data") from e


@router.get(
    "/api/leagues/{league_id}/positional_stats/aggregate",
    response_model=LeaguePositionalAggregate,
)
def positional_stats_aggregate(
    refresh: bool = False,
    ctx: LeagueContext = Depends(get_user_league),
):
    """Positional stats summed per owner across every season from 2019 on."""
    try:
        all_years = loaders.discover_years(
            ctx.espn_league_id, espn_s2=ctx.espn_s2, swid=ctx.swid
        )
    except Exception as e:
        raise espn_failure(e, "discovering seasons") from e

    years = [y for y in all_years if y >= 2019]
    if not years:
        raise HTTPException(
            status_code=400,
            detail="No seasons with box-score data (2019+) found.",
        )

    # Aggregate per position per owner across years.
    # owners[pos][owner_id] = {meta + tallies}
    by_pos: dict[str, dict[str, dict]] = {p: {} for p in POSITIONS_ORDER}
    missing_weeks: dict[int, list[int]] = {}

    for year in years:
        try:
            season = loaders._compute_positional_stats_for_year(
                ctx.espn_league_id, year, ctx.espn_s2, ctx.swid, refresh
            )
        except Exception as e:
            raise espn_failure(e, f"season {year}") from e
        if season.get("missing_weeks"):
            missing_weeks[year] = season["missing_weeks"]
        for pos_block in season["positions"]:
            pos = pos_block["position"]
            for row in pos_block["teams"]:
                oid = row["owner_id"]
                if not oid:
                    continue
                agg = by_pos[pos].setdefault(oid, {
                    "owner_id": oid,
                    "owner_name": row["owner_name"],
                    "current_team_name": row["team_name"],
                    "seasons_with_data": 0,
                    "total_points": 0.0,
                    "games_played": 0,
                    "playoff_points": 0.0,
                    "playoff_games": 0,
                })
                # Most-recent year wins for name fields (we iterate chronologically).
                agg["owner_name"] = row["owner_name"]
                agg["current_team_name"] = row["team_name"]
                agg["seasons_with_data"] += 1
                agg["total_points"] += row["total_points"]
                agg["games_played"] += row["games_played"]
                agg["playoff_points"] += row["playoff_points"]
                agg["playoff_games"] += row["playoff_games"]

    positions = []
    for pos in POSITIONS_ORDER:
        owners = []
        for agg in by_pos[pos].values():
            tg = agg["games_played"]
            pg = agg["playoff_games"]
            owners.append({
                **agg,
                "total_points": round(agg["total_points"], 2),
                "avg_ppg": round(agg["total_points"] / tg, 2) if tg else 0.0,
                "playoff_points": round(agg["playoff_points"], 2),
                "playoff_ppg": round(agg["playoff_points"] / pg, 2) if pg else 0.0,
            })
        owners.sort(key=lambda r: r["total_points"], reverse=True)
        positions.append({"position": pos, "owners": owners})

    return {
        "league_id": ctx.espn_league_id,
        "years": years,
        "positions": positions,
        "missing_weeks": missing_weeks,
    }


@router.get(
    "/api/leagues/{league_id}/seasons/{year}/playoffs",
    response_model=SeasonPlayoffs,
)
def playoffs(year: int, refresh: bool = False, ctx: LeagueContext = Depends(get_user_league)):
    """A season's playoff teams and every playoff-week matchup, for the bracket."""
    if not refresh:
        cached = cache.get(ctx.espn_league_id, year, cache.PLAYOFFS, fresh_since=loaders._fresh_since(year))
        if cached:
            return cached
    try:
        league = loaders.get_league(ctx.espn_league_id, year, espn_s2=ctx.espn_s2, swid=ctx.swid)
        data = serialize_playoffs(league)
        payload = {"league_id": ctx.espn_league_id, "year": year, **data}
        cache.put(ctx.espn_league_id, year, cache.PLAYOFFS, payload)
        return payload
    except Exception as e:
        raise espn_failure(e, "loading ESPN data") from e


@router.get("/api/leagues/{league_id}/owner_history", response_model=LeagueOwnerHistory)
def owner_history(refresh: bool = False, ctx: LeagueContext = Depends(get_user_league)):
    """Every owner's season-by-season results, for Trends and owner pickers."""
    try:
        years = loaders.discover_years(ctx.espn_league_id, espn_s2=ctx.espn_s2, swid=ctx.swid)
    except Exception as e:
        raise espn_failure(e, "discovering seasons") from e
    seasons = []
    for year in years:
        try:
            seasons.append(
                loaders._get_season_teams(ctx.espn_league_id, year, ctx.espn_s2, ctx.swid, refresh)
            )
        except Exception as e:
            raise espn_failure(e, f"season {year}") from e
    return {
        "league_id": ctx.espn_league_id,
        "years": years,
        "owners": build_owner_history(seasons),
    }


@router.get("/api/leagues/{league_id}/seasons", response_model=AllSeasons)
def all_seasons(refresh: bool = False, ctx: LeagueContext = Depends(get_user_league)):
    """Every team-season the league has played, one SeasonTeams per year.

    Unlike /aggregate this keeps each season separate, so the client can rank
    individual seasons against each other. scoring_type rides along per year
    because the league has changed formats, and a PPR points total isn't
    comparable to a standard one.
    """
    try:
        years = loaders.discover_years(ctx.espn_league_id, espn_s2=ctx.espn_s2, swid=ctx.swid)
    except Exception as e:
        raise espn_failure(e, "discovering seasons") from e
    return {
        "league_id": ctx.espn_league_id,
        "years": years,
        "seasons": loaders._load_season_teams(ctx, years, refresh),
    }


@router.get("/api/leagues/{league_id}/close_games", response_model=CloseGames)
def close_games(refresh: bool = False, ctx: LeagueContext = Depends(get_user_league)):
    """Close-game records for every season.

    Split from /seasons because it needs each season's full matchup list, which
    on a cold cache means a fresh ESPN fetch per year. The client renders the
    season table first and fills this column in when it arrives.
    """
    try:
        years = loaders.discover_years(ctx.espn_league_id, espn_s2=ctx.espn_s2, swid=ctx.swid)
    except Exception as e:
        raise espn_failure(e, "discovering seasons") from e
    seasons = []
    for year, teams_payload in zip(years, loaders._load_season_teams(ctx, years, refresh)):
        games = max(
            (t["wins"] + t["losses"] + t["ties"] for t in teams_payload["teams"]), default=0
        )
        try:
            matchups = loaders._get_season_matchups(
                ctx.espn_league_id, year, ctx.espn_s2, ctx.swid, refresh
            )
        except Exception as e:
            raise espn_failure(e, f"season {year}") from e
        records = close_game_records(matchups, games)
        seasons.append({
            "year": year,
            "records": [{"team_id": tid, **rec} for tid, rec in records.items()],
        })
    return {"league_id": ctx.espn_league_id, "margin": CLOSE_GAME_MARGIN, "seasons": seasons}


@router.get("/api/leagues/{league_id}/aggregate", response_model=LeagueAggregate)
def aggregate(
    start_year: int | None = None,
    end_year: int | None = None,
    refresh: bool = False,
    ctx: LeagueContext = Depends(get_user_league),
):
    """Career totals per owner over the seasons from `start_year` to `end_year`
    (inclusive; every season by default)."""
    try:
        available = loaders.discover_years(ctx.espn_league_id, espn_s2=ctx.espn_s2, swid=ctx.swid)
    except Exception as e:
        raise espn_failure(e, "discovering seasons") from e
    sy = start_year if start_year is not None else available[0]
    ey = end_year if end_year is not None else available[-1]
    years = [y for y in available if sy <= y <= ey]
    seasons = loaders._load_season_teams(ctx, years, refresh)
    return {
        "league_id": ctx.espn_league_id,
        "start_year": sy,
        "end_year": ey,
        "years": years,
        "owners": aggregate_by_owner(seasons),
    }
