"""A league's transactions: trades and who won them, and the waiver claims,
free-agent pickups and drops.

ESPN keeps league activity from 2019 on. Each transaction is one "activity"
of messages: a trade holds a TRADE_SENT and a TRADE_RECEIVED row per player;
a pickup holds an add (WAIVER ADDED or FA ADDED) and usually a DROPPED. These
functions first turn espn_api's Activity objects into plain dicts (so they
can be cached), then derive one record per trade or move. Trades are credited
with what each side's new players went on to score for it, from the week of
the trade to the end of the season, read from the cached weekly box scores.

Only points scored in a starting slot count toward the winner: points left on
the bench didn't help anyone. Bench points are reported alongside.
"""

from __future__ import annotations

from collections.abc import Iterable
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

EASTERN = ZoneInfo("America/New_York")
BENCH_SLOTS = {"BE", "IR"}


def kickoff(year: int) -> date:
    """The NFL season's opening Thursday: the one after Labor Day (the first
    Monday in September)."""
    first = date(year, 9, 1)
    labor_day = first + timedelta(days=(0 - first.weekday()) % 7)
    return labor_day + timedelta(days=3)


def week_of(timestamp_ms: int, year: int) -> int:
    """The fantasy week a moment falls in. Weeks run Tuesday to Monday, week 1
    starting the Tuesday before kickoff; anything earlier (a preseason trade)
    counts from week 1."""
    when = datetime.fromtimestamp(timestamp_ms / 1000, timezone.utc).astimezone(EASTERN).date()
    week1_start = kickoff(year) - timedelta(days=2)
    return max(1, (when - week1_start).days // 7 + 1)


def _team_fields(team) -> dict | None:
    if team is None or not hasattr(team, "team_id"):
        return None
    owner = (getattr(team, "owners", None) or [{}])[0] or {}
    return {
        "team_id": team.team_id,
        "team_name": team.team_name,
        "owner_id": owner.get("id", ""),
        "owner_name": f"{owner.get('firstName', '')} {owner.get('lastName', '')}".strip() or "—",
    }


def _player_fields(player) -> dict:
    if hasattr(player, "playerId"):
        return {
            "player_id": player.playerId,
            "name": getattr(player, "name", "") or str(player.playerId),
            "position": getattr(player, "position", "") or "",
        }
    # espn_api falls back to the bare id when it can't look the player up.
    pid = player if isinstance(player, int) else -1
    return {"player_id": pid, "name": f"Player {player}", "position": ""}


def normalize_activity(act) -> dict:
    """An espn_api Activity as a plain, cacheable dict."""
    actions = []
    for team, action, player, *rest in act.actions:
        actions.append({
            "team": _team_fields(team),
            "action": action,
            "player": _player_fields(player),
            "bid": int(rest[0]) if rest and isinstance(rest[0], (int, float)) else 0,
        })
    return {"date": int(act.date), "actions": actions}


def activity_key(act: dict) -> tuple:
    """Identifies one activity, to spot ESPN repeating a page."""
    return (act["date"], tuple((a["action"], a["player"]["player_id"]) for a in act["actions"]))


def trades_from_activity(activities: Iterable[dict], year: int) -> list[dict]:
    """One record per trade, oldest first, from normalized activities."""
    trades = []
    for act in activities:
        sides: dict[int, dict] = {}
        for a in act["actions"]:
            team = a["team"]
            if team is None or a["action"] not in ("TRADE_SENT", "TRADE_RECEIVED"):
                continue
            side = sides.setdefault(team["team_id"], {**team, "received": [], "sent": []})
            side["received" if a["action"] == "TRADE_RECEIVED" else "sent"].append(a["player"])
        if len(sides) < 2:
            continue
        trades.append({
            "date": act["date"],
            "week": week_of(act["date"], year),
            "sides": sorted(sides.values(), key=lambda s: s["team_id"]),
        })
    trades.sort(key=lambda t: t["date"])
    return trades


# Kinds of non-trade move, in the order a pickup's kind is decided.
MOVE_KINDS = {"WAIVER ADDED": "waiver", "FA ADDED": "free_agent"}


def moves_from_activity(activities: Iterable[dict], year: int) -> list[dict]:
    """Waiver claims, free-agent pickups and drops, oldest first: one record
    per team per activity, with what it added and dropped. A pickup that came
    with a drop is a waiver claim or free-agent pickup carrying the drop; a
    drop on its own is a drop. Trades are left out (see trades_from_activity)."""
    moves = []
    for act in activities:
        if any(a["action"].startswith("TRADE") for a in act["actions"]):
            continue
        by_team: dict[int, dict] = {}
        for a in act["actions"]:
            team = a["team"]
            if team is None:
                continue
            move = by_team.setdefault(team["team_id"], {
                **team, "added": [], "dropped": [], "bid": 0, "kind": "drop",
            })
            if a["action"] in MOVE_KINDS:
                move["added"].append(a["player"])
                move["bid"] += a["bid"]
                if move["kind"] != "waiver":
                    move["kind"] = MOVE_KINDS[a["action"]]
            elif a["action"] == "DROPPED":
                move["dropped"].append(a["player"])
        for move in by_team.values():
            if move["added"] or move["dropped"]:
                moves.append({"date": act["date"], "week": week_of(act["date"], year), **move})
    moves.sort(key=lambda m: m["date"])
    return moves


def _lineups_by_week(box_by_week: dict[int, dict]) -> dict[int, dict[int, dict[int, dict]]]:
    """week -> team_id -> player_id -> lineup entry."""
    out: dict[int, dict[int, dict[int, dict]]] = {}
    for week, payload in box_by_week.items():
        teams: dict[int, dict[int, dict]] = {}
        for m in payload.get("matchups", []):
            for side in (m.get("home"), m.get("away")):
                if side:
                    teams[side["team_id"]] = {p["player_id"]: p for p in side["lineup"]}
        out[week] = teams
    return out


def trade_outcomes(trades: list[dict], box_by_week: dict[int, dict]) -> list[dict]:
    """Each trade with what every side's new players scored for that side from
    the trade's week on: starting points (which decide the winner), bench
    points, and weeks started. The winner is the side whose new players
    started for more points; none on a tie, or before anyone has played."""
    lineups = _lineups_by_week(box_by_week)
    weeks = sorted(lineups)
    result = []
    for trade in trades:
        sides = []
        for side in trade["sides"]:
            players = []
            for p in side["received"]:
                started = bench = 0.0
                weeks_started = 0
                for w in weeks:
                    if w < trade["week"]:
                        continue
                    entry = lineups[w].get(side["team_id"], {}).get(p["player_id"])
                    if entry is None:
                        continue
                    if entry["slot_position"] in BENCH_SLOTS:
                        bench += entry["points"]
                    else:
                        started += entry["points"]
                        weeks_started += 1
                players.append({
                    **p,
                    "started_points": round(started, 2),
                    "bench_points": round(bench, 2),
                    "weeks_started": weeks_started,
                })
            sides.append({
                **{k: v for k, v in side.items() if k != "received"},
                "received": players,
                "started_points": round(sum(x["started_points"] for x in players), 2),
            })
        ranked = sorted(sides, key=lambda s: s["started_points"], reverse=True)
        margin = round(ranked[0]["started_points"] - ranked[1]["started_points"], 2)
        winner = ranked[0]["team_id"] if margin > 0 else None
        result.append({**trade, "sides": sides, "winner_team_id": winner, "margin": margin})
    return result
