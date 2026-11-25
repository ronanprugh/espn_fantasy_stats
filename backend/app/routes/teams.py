"""One owner's Team Hub, and head-to-head records between owners.
"""


from fastapi import APIRouter, Depends, HTTPException

from .. import loaders
from ..accolades import accolades as count_accolades
from ..deps import LeagueContext, get_user_league
from ..errors import espn_failure
from ..espn_client import (
    WeekNotPlayedError,
    serialize_roster,
)
from ..rivalries import is_unplayed, rivalry_summary
from ..schemas import (
    HeadToHeadStats,
    RivalrySummary,
    SeasonRosters,
    TeamHub,
)
from ..season_state import season_over
from ..team_hub import career_records, roster_weeks, team_lineup, team_schedule

router = APIRouter()


@router.get(
    "/api/leagues/{league_id}/owners/{owner_id}/hub",
    response_model=TeamHub,
)
def team_hub(
    owner_id: str,
    year: int | None = None,
    refresh: bool = False,
    ctx: LeagueContext = Depends(get_user_league),
):
    """One owner's Team Hub: every season they played, career records and
    accolades, and for the selected season (the latest by default) the
    roster, schedule and last matchup."""
    try:
        all_years = loaders.discover_years(ctx.espn_league_id, espn_s2=ctx.espn_s2, swid=ctx.swid)
    except Exception as e:
        raise espn_failure(e, "discovering seasons") from e

    # Gather every season this owner played in.
    seasons_by_year: dict[int, dict] = {}
    payload_by_year: dict[int, dict] = {}
    for y in all_years:
        teams_payload = loaders._get_season_teams(
            ctx.espn_league_id, y, ctx.espn_s2, ctx.swid, refresh
        )
        td = next(
            (
                t
                for t in teams_payload["teams"]
                if t["owners"] and t["owners"][0]["id"] == owner_id
            ),
            None,
        )
        if td is not None:
            seasons_by_year[y] = td
            payload_by_year[y] = teams_payload

    if not seasons_by_year:
        raise HTTPException(status_code=404, detail="Owner not found in any season")

    available_years = sorted(seasons_by_year.keys())

    # Decide which year to display.
    if year is None:
        selected_year = available_years[-1]
    elif year not in seasons_by_year:
        raise HTTPException(
            status_code=404,
            detail=f"Owner did not play in {year}",
        )
    else:
        selected_year = year

    selected_td = seasons_by_year[selected_year]
    latest_td = seasons_by_year[available_years[-1]]

    # All-time aggregates (over every season the owner played).
    # Finished seasons only: a season in progress has a standing, not a finish.
    finishes = [
        td["final_standing"]
        for y, td in seasons_by_year.items()
        if season_over(payload_by_year[y]) and td["final_standing"]
    ]
    avg_finish = sum(finishes) / len(finishes) if finishes else 0.0
    total_pf = sum(td["points_for"] for td in seasons_by_year.values())
    total_games = sum(
        td["wins"] + td["losses"] + td["ties"] for td in seasons_by_year.values()
    )
    career_avg_pf = total_pf / total_games if total_games else 0.0

    # Per-scoring-format avg PPG (seasons are already fetched via loaders._get_season_teams above)
    _scoring_pf: dict[str, float] = {}
    _scoring_games: dict[str, int] = {}
    for y, td in seasons_by_year.items():
        teams_payload = loaders._get_season_teams(ctx.espn_league_id, y, ctx.espn_s2, ctx.swid)
        st = teams_payload.get("scoring_type", "standard")
        games = td["wins"] + td["losses"] + td["ties"]
        _scoring_pf[st] = _scoring_pf.get(st, 0.0) + td["points_for"]
        _scoring_games[st] = _scoring_games.get(st, 0) + games

    def _avg_for_type(key: str) -> float | None:
        g = _scoring_games.get(key, 0)
        return round(_scoring_pf[key] / g, 2) if g else None

    ppr_avg_pf = _avg_for_type("ppr")
    half_ppr_avg_pf = _avg_for_type("half_ppr")
    standard_avg_pf = _avg_for_type("standard")

    # Roster from the selected year.
    roster: list[dict] = []
    try:
        league = loaders.get_league(
            ctx.espn_league_id, selected_year, espn_s2=ctx.espn_s2, swid=ctx.swid
        )
        live_team = next(
            (t for t in league.teams if t.team_id == selected_td["team_id"]),
            None,
        )
        if live_team:
            roster = serialize_roster(live_team)
    except Exception:
        roster = []

    # Accolades: podium and last-place finishes, in finished seasons only.
    accolades = count_accolades(
        (y, td, payload_by_year[y]) for y, td in seasons_by_year.items()
    )

    # Career records over every season's decided games (app/team_hub.py).
    record_seasons = []
    for y in sorted(seasons_by_year):
        try:
            sb_y = loaders._get_season_scoreboard(ctx.espn_league_id, y, ctx.espn_s2, ctx.swid, refresh)
        except Exception:
            continue
        record_seasons.append((y, seasons_by_year[y]["team_id"], sb_y["matchups"]))
    records = career_records(record_seasons)

    # Schedule: every game (and bye) for the team that year, in week order,
    # and the latest game with points on the board for the Last Matchup card.
    try:
        sb = loaders._get_season_scoreboard(
            ctx.espn_league_id, selected_year, ctx.espn_s2, ctx.swid, refresh
        )
        schedule, latest_game = team_schedule(sb["matchups"], selected_td["team_id"])
        last_matchup = {"year": selected_year, **latest_game} if latest_game else None
    except Exception:
        schedule = []
        last_matchup = None

    owner_obj = latest_td["owners"][0] if latest_td["owners"] else {}
    owner_name = f"{owner_obj.get('first_name', '')} {owner_obj.get('last_name', '')}".strip()

    return {
        "owner_id": owner_id,
        "owner_name": owner_name or "—",
        "current_team_name": latest_td["team_name"],
        "selected_year": selected_year,
        "selected_team_id": selected_td["team_id"],
        "selected_team_name": selected_td["team_name"],
        "selected_finish": selected_td["final_standing"] or selected_td["standing"],
        "selected_avg_pf": selected_td["avg_points_for"],
        "seasons_played": len(seasons_by_year),
        "avg_finish": round(avg_finish, 2),
        "career_avg_pf": round(career_avg_pf, 2),
        "ppr_avg_pf": ppr_avg_pf,
        "half_ppr_avg_pf": half_ppr_avg_pf,
        "standard_avg_pf": standard_avg_pf,
        "available_years": available_years,
        "roster": roster,
        "last_matchup": last_matchup,
        "schedule": schedule,
        "accolades": accolades,
        "records": records,
    }


@router.get(
    "/api/leagues/{league_id}/seasons/{year}/teams/{team_id}/rosters",
    response_model=SeasonRosters,
)
def season_rosters(year: int, team_id: int, ctx: LeagueContext = Depends(get_user_league)):
    """A team's roster at the start of a season and at its end: the whole
    roster, bench and IR included, from the box scores of its first and last
    games (its latest so far in a season being played). 2019 on, as box
    scores are."""
    lid = ctx.espn_league_id
    base = {"league_id": lid, "year": year, "team_id": team_id, "in_progress": False, "start": None, "end": None}
    if year < 2019:
        return {**base, "supported": False}
    try:
        teams = loaders._get_season_teams(lid, year, ctx.espn_s2, ctx.swid)
        matchups = loaders._get_season_scoreboard(lid, year, ctx.espn_s2, ctx.swid)["matchups"]
        first, last = roster_weeks(matchups, team_id)

        def snapshot(week: int | None) -> dict | None:
            if week is None:
                return None
            try:
                box = loaders._get_season_box_scores(lid, year, week, ctx.espn_s2, ctx.swid)
            except WeekNotPlayedError:
                return None
            players = team_lineup(box, team_id)
            return {"week": week, "players": players} if players is not None else None

        start = snapshot(first)
        end = start if last == first else snapshot(last)
    except Exception as e:
        raise espn_failure(e, "loading ESPN data") from e
    return {**base, "supported": True, "in_progress": not season_over(teams), "start": start, "end": end}


@router.get("/api/leagues/{league_id}/head_to_head/summary", response_model=RivalrySummary)
def head_to_head_summary(
    owner: str,
    refresh: bool = False,
    ctx: LeagueContext = Depends(get_user_league),
):
    """One owner's record against every other owner, in one request.

    The Head to Head page shows this before an opponent is picked. It reads the
    same cached teams and matchups as the pairwise endpoint below, once per
    season, instead of the page firing a request per opponent.
    """
    try:
        years = loaders.discover_years(ctx.espn_league_id, espn_s2=ctx.espn_s2, swid=ctx.swid)
    except Exception as e:
        raise espn_failure(e, "discovering seasons") from e
    seasons = []
    for year in years:
        try:
            teams_payload = loaders._get_season_teams(ctx.espn_league_id, year, ctx.espn_s2, ctx.swid, refresh)
            matchups = loaders._get_season_matchups(ctx.espn_league_id, year, ctx.espn_s2, ctx.swid, refresh)
        except Exception as e:
            raise espn_failure(e, f"season {year}") from e
        seasons.append((year, teams_payload, matchups))
    return rivalry_summary(owner, seasons)


@router.get("/api/leagues/{league_id}/head_to_head", response_model=HeadToHeadStats)
def head_to_head(
    owner_a: str,
    owner_b: str,
    refresh: bool = False,
    ctx: LeagueContext = Depends(get_user_league),
):
    """Every meeting between two owners across every season, with their record,
    points and the matchup list."""
    if owner_a == owner_b:
        raise HTTPException(status_code=400, detail="owner_a and owner_b must differ")
    try:
        years = loaders.discover_years(ctx.espn_league_id, espn_s2=ctx.espn_s2, swid=ctx.swid)
    except Exception as e:
        raise espn_failure(e, "discovering seasons") from e

    matchups: list[dict] = []
    owner_a_name = owner_b_name = ""
    owner_a_team_name = owner_b_team_name = ""

    for year in years:
        try:
            teams_payload = loaders._get_season_teams(
                ctx.espn_league_id, year, ctx.espn_s2, ctx.swid, refresh
            )
            season_matchups = loaders._get_season_matchups(
                ctx.espn_league_id, year, ctx.espn_s2, ctx.swid, refresh
            )
        except Exception as e:
            raise espn_failure(e, f"season {year}") from e

        team_a_in_season = next(
            (
                t
                for t in teams_payload["teams"]
                if t["owners"] and t["owners"][0]["id"] == owner_a
            ),
            None,
        )
        team_b_in_season = next(
            (
                t
                for t in teams_payload["teams"]
                if t["owners"] and t["owners"][0]["id"] == owner_b
            ),
            None,
        )
        if not team_a_in_season or not team_b_in_season:
            continue

        a_owner = team_a_in_season["owners"][0]
        b_owner = team_b_in_season["owners"][0]
        owner_a_name = f"{a_owner['first_name']} {a_owner['last_name']}".strip()
        owner_b_name = f"{b_owner['first_name']} {b_owner['last_name']}".strip()
        owner_a_team_name = team_a_in_season["team_name"]
        owner_b_team_name = team_b_in_season["team_name"]

        a_team_id = team_a_in_season["team_id"]
        b_team_id = team_b_in_season["team_id"]

        for m in season_matchups:
            if {m["team_a_id"], m["team_b_id"]} != {a_team_id, b_team_id}:
                continue
            # A scheduled game that hasn't been played would count as a tie.
            if is_unplayed(m):
                continue
            if m["team_a_id"] == a_team_id:
                a_score, b_score = m["team_a_score"], m["team_b_score"]
            else:
                a_score, b_score = m["team_b_score"], m["team_a_score"]

            if m["winner_id"] == a_team_id:
                winner = owner_a
            elif m["winner_id"] == b_team_id:
                winner = owner_b
            else:
                winner = None

            matchups.append({
                "year": year,
                "week": m["week"],
                "is_playoff": m["is_playoff"],
                "round_label": m.get("round_label", "regular"),
                "owner_a_team_id": a_team_id,
                "owner_b_team_id": b_team_id,
                "owner_a_team_name": team_a_in_season["team_name"],
                "owner_b_team_name": team_b_in_season["team_name"],
                "owner_a_score": a_score,
                "owner_b_score": b_score,
                "winner_owner_id": winner,
            })

    matchups.sort(key=lambda m: (m["year"], m["week"]))
    total = len(matchups)
    a_wins = sum(1 for m in matchups if m["winner_owner_id"] == owner_a)
    b_wins = sum(1 for m in matchups if m["winner_owner_id"] == owner_b)
    ties = total - a_wins - b_wins
    a_pf = sum(m["owner_a_score"] for m in matchups)
    b_pf = sum(m["owner_b_score"] for m in matchups)
    po = [m for m in matchups if m["is_playoff"]]
    po_a_wins = sum(1 for m in po if m["winner_owner_id"] == owner_a)
    po_b_wins = sum(1 for m in po if m["winner_owner_id"] == owner_b)
    po_ties = len(po) - po_a_wins - po_b_wins

    return {
        "owner_a_id": owner_a,
        "owner_b_id": owner_b,
        "owner_a_name": owner_a_name,
        "owner_b_name": owner_b_name,
        "owner_a_team_name": owner_a_team_name,
        "owner_b_team_name": owner_b_team_name,
        "total_matchups": total,
        "owner_a_wins": a_wins,
        "owner_b_wins": b_wins,
        "ties": ties,
        "owner_a_total_pf": round(a_pf, 2),
        "owner_b_total_pf": round(b_pf, 2),
        "owner_a_avg_pf": round(a_pf / total, 2) if total else 0.0,
        "owner_b_avg_pf": round(b_pf / total, 2) if total else 0.0,
        "playoff_matchups": len(po),
        "owner_a_playoff_wins": po_a_wins,
        "owner_b_playoff_wins": po_b_wins,
        "playoff_ties": po_ties,
        "matchups": matchups,
    }
