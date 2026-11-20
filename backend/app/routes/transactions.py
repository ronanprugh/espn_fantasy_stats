"""Transactions: waiver claims, pickups and drops, and trades with their
results, by season or across every season since 2019.
"""


from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import loaders, trade_store
from ..database import get_db
from ..deps import LeagueContext, get_user_league
from ..errors import espn_failure
from ..schemas import (
    LeagueMoves,
    LeagueTrades,
    SeasonMoves,
    SeasonTrades,
)
from ..trades import (
    moves_from_activity,
)

router = APIRouter()


@router.get("/api/leagues/{league_id}/seasons/{year}/transactions", response_model=SeasonMoves)
def season_transactions(year: int, refresh: bool = False, ctx: LeagueContext = Depends(get_user_league)):
    """The season's waiver claims, free-agent pickups and drops (trades are on
    /trades). ESPN only keeps league activity from 2019 on."""
    if year < 2019:
        return {"league_id": ctx.espn_league_id, "year": year, "supported": False, "moves": []}
    try:
        activity = loaders._load_season_activity(ctx.espn_league_id, year, ctx.espn_s2, ctx.swid, refresh)
    except Exception as e:
        raise espn_failure(e, "loading ESPN data") from e
    moves = [{**m, "year": year} for m in moves_from_activity(activity["activities"], year)]
    return {
        "league_id": ctx.espn_league_id,
        "year": year,
        "supported": True,
        "unavailable": activity["unavailable"],
        "moves": moves,
    }


@router.get("/api/leagues/{league_id}/transactions", response_model=LeagueMoves)
def all_transactions(ctx: LeagueContext = Depends(get_user_league)):
    """Every season's waiver claims, pickups and drops (2019 on), in one
    request for the All seasons view."""
    try:
        years = loaders._transaction_years(ctx)
        moves, unavailable = [], []
        for year in years:
            activity = loaders._load_season_activity(ctx.espn_league_id, year, ctx.espn_s2, ctx.swid)
            if activity["unavailable"]:
                unavailable.append(year)
            moves += [{**m, "year": year} for m in moves_from_activity(activity["activities"], year)]
    except Exception as e:
        raise espn_failure(e, "loading ESPN data") from e
    return {"league_id": ctx.espn_league_id, "years": years, "unavailable_years": unavailable, "moves": moves}


@router.get("/api/leagues/{league_id}/seasons/{year}/trades", response_model=SeasonTrades)
def season_trades(
    year: int,
    refresh: bool = False,
    ctx: LeagueContext = Depends(get_user_league),
    db: Session = Depends(get_db),
):
    """Every trade in a season, with what each side's new players went on to
    score for it (app/trades.py), from the stored results (app/trade_store.py).
    ESPN only keeps trades from 2019 on."""
    if year < 2019:
        return {"league_id": ctx.espn_league_id, "year": year, "supported": False, "trades": []}
    try:
        trades = loaders._season_trade_results(db, ctx, year, refresh)
        unavailable = not trades and loaders._activity_unavailable(ctx, year)
        espn_count = trade_store.espn_trade_counts(db, ctx.espn_league_id, [year]).get(year)
    except Exception as e:
        raise espn_failure(e, "loading ESPN data") from e
    return {
        "league_id": ctx.espn_league_id,
        "year": year,
        "supported": True,
        "unavailable": unavailable,
        "espn_trade_count": espn_count,
        "trades": trades,
    }


@router.get("/api/leagues/{league_id}/trades", response_model=LeagueTrades)
def all_trades(ctx: LeagueContext = Depends(get_user_league), db: Session = Depends(get_db)):
    """Every season's trades with their results (2019 on), in one request for
    the All seasons view. Seasons whose results are stored come straight from
    the database; any others are calculated first."""
    try:
        years = loaders._transaction_years(ctx)
        for year in years:
            if not trade_store.is_current(db, ctx.espn_league_id, year):
                loaders._season_trade_results(db, ctx, year)
        trades = trade_store.load(db, ctx.espn_league_id, years)
        traded = {t["year"] for t in trades}
        unavailable = [y for y in years if y not in traded and loaders._activity_unavailable(ctx, y)]
        counts = trade_store.espn_trade_counts(db, ctx.espn_league_id, years)
    except Exception as e:
        raise espn_failure(e, "loading ESPN data") from e
    return {
        "league_id": ctx.espn_league_id,
        "years": years,
        "unavailable_years": unavailable,
        "espn_trade_counts": counts,
        "trades": trades,
    }
