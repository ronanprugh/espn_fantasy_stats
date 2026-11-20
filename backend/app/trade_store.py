"""Calculated trade results, stored (TradeRecord) so the Transactions page
reads them back instead of rebuilding each trade's outcome from every week's
box scores on every visit.

A season's results are calculated once it's over and kept for good; while it
is being played they're recalculated after each refresh point
(espn_client.REFRESH_POINTS), since every week adds points.
"""

from __future__ import annotations

import datetime as dt
from collections.abc import Iterable

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .espn_client import last_refresh_point
from .models import TradeRecord, TradeRecordPlayer, TradeRecordSide, TradeSync


def _utc_naive(when: dt.datetime) -> dt.datetime:
    return when.astimezone(dt.timezone.utc).replace(tzinfo=None)


def is_current(db: Session, league_id: int, season: int, now: dt.datetime | None = None) -> bool:
    """Whether the stored results for a season can be used as they are."""
    sync = db.get(TradeSync, (league_id, season))
    if sync is None:
        return False
    if sync.final:
        return True
    return sync.computed_at >= _utc_naive(last_refresh_point(now))


def save(db: Session, league_id: int, season: int, trades: Iterable[dict], final: bool) -> None:
    """Replace a season's stored results with `trades` (trade_outcomes output).

    Two requests can calculate the same season at once (two people opening
    it on a cold cache). Whichever commits second finds the other's rows and
    backs off: both calculated the same thing.
    """
    db.query(TradeRecord).filter(
        TradeRecord.espn_league_id == league_id, TradeRecord.season == season
    ).delete(synchronize_session=False)
    for t in trades:
        record = TradeRecord(
            espn_league_id=league_id,
            season=season,
            uid=t["uid"],
            occurred_at=t["date"],
            week=t["week"],
            winner_team_id=t["winner_team_id"],
            margin=t["margin"],
        )
        for side in t["sides"]:
            team = {k: side[k] for k in ("team_id", "team_name", "owner_id", "owner_name")}
            record.sides.append(TradeRecordSide(
                team_id=side["team_id"],
                war=side["war"],
                ppg=side["ppg"],
                ppg_if_kept=side["ppg_if_kept"],
                games=side["games"],
            ))
            for p in side["received"]:
                record.players.append(TradeRecordPlayer(
                    **team,
                    action="received",
                    player_id=p["player_id"],
                    player_name=p["name"],
                    position=p["position"],
                    started_points=p["started_points"],
                    bench_points=p["bench_points"],
                    weeks_started=p["weeks_started"],
                    war=p["war"],
                ))
            for p in side["sent"]:
                record.players.append(TradeRecordPlayer(
                    **team,
                    action="sent",
                    player_id=p["player_id"],
                    player_name=p["name"],
                    position=p["position"],
                ))
        db.add(record)
    sync = db.get(TradeSync, (league_id, season))
    now = _utc_naive(dt.datetime.now(dt.timezone.utc))
    if sync is None:
        db.add(TradeSync(espn_league_id=league_id, season=season, computed_at=now, final=final))
    else:
        sync.computed_at, sync.final = now, final
    try:
        db.commit()
    except IntegrityError:
        db.rollback()


def load(db: Session, league_id: int, seasons: Iterable[int]) -> list[dict]:
    """Stored trades for the seasons, oldest first, in the API's Trade shape
    (with the season as `year`)."""
    rows = (
        db.query(TradeRecord)
        .filter(TradeRecord.espn_league_id == league_id, TradeRecord.season.in_(list(seasons)))
        .order_by(TradeRecord.occurred_at, TradeRecord.id)
        .all()
    )
    out = []
    for r in rows:
        totals = {s.team_id: s for s in r.sides}
        sides: dict[int, dict] = {}
        for p in r.players:
            side = sides.setdefault(p.team_id, {
                "team_id": p.team_id,
                "team_name": p.team_name,
                "owner_id": p.owner_id,
                "owner_name": p.owner_name,
                "received": [],
                "sent": [],
                "started_points": 0.0,
                "war": 0.0,
                "ppg": None,
                "ppg_if_kept": None,
                "games": 0,
            })
            if p.team_id in totals:
                t = totals[p.team_id]
                side.update(war=t.war or 0.0, ppg=t.ppg, ppg_if_kept=t.ppg_if_kept, games=t.games or 0)
            player = {"player_id": p.player_id, "name": p.player_name, "position": p.position}
            if p.action == "received":
                side["received"].append({
                    **player,
                    "started_points": p.started_points or 0.0,
                    "bench_points": p.bench_points or 0.0,
                    "weeks_started": p.weeks_started or 0,
                    "war": p.war or 0.0,
                })
                side["started_points"] = round(side["started_points"] + (p.started_points or 0.0), 2)
            else:
                side["sent"].append(player)
        out.append({
            "year": r.season,
            "uid": r.uid,
            "date": r.occurred_at,
            "week": r.week,
            "sides": sorted(sides.values(), key=lambda s: s["team_id"]),
            "winner_team_id": r.winner_team_id,
            "margin": r.margin,
        })
    return out
