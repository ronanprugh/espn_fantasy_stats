"""A league's transactions: trades and who won them, and the waiver claims,
free-agent pickups and drops.

ESPN keeps league activity from 2019 on. Each transaction is one "topic" of
messages: a trade holds one message per player, from the sending team to the
receiving one; a pickup holds an add (waiver or free agent) and usually a
drop. activity_from_topic turns a raw topic into a plain dict (so it can be
cached), with player names and positions from a directory fetched in one go
(espn_api's own Activity fetches each unknown player separately, two requests
apiece). The other functions derive one record per trade or move. Trades are credited
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


def team_fields(team) -> dict | None:
    """An espn_api Team as the fields a transaction keeps."""
    if team is None or not hasattr(team, "team_id"):
        return None
    owner = (getattr(team, "owners", None) or [{}])[0] or {}
    return {
        "team_id": team.team_id,
        "team_name": team.team_name,
        "owner_id": owner.get("id", ""),
        "owner_name": f"{owner.get('firstName', '')} {owner.get('lastName', '')}".strip() or "—",
    }


# ESPN message types (espn_api's ACTIVITY_MAP).
TRADE_MESSAGE = 244
MOVE_MESSAGES = {178: "FA ADDED", 180: "WAIVER ADDED", 179: "DROPPED", 181: "DROPPED", 239: "DROPPED"}
ACTIVITY_MESSAGE_TYPES = [178, 180, 179, 239, 181, 244]

# ESPN's defaultPositionId, for a player whose eligible slots aren't given.
_DEFAULT_POSITIONS = {1: "QB", 2: "RB", 3: "WR", 4: "TE", 5: "K", 16: "D/ST"}


def player_position(info: dict) -> str:
    """A player's main position from an ESPN player record, by espn_api's
    rule: the first eligible slot that isn't a combination (RB/WR) or the
    bench; else the default position."""
    from espn_api.football.constant import POSITION_MAP

    name = info.get("fullName", "")
    for slot in info.get("eligibleSlots") or []:
        pos = POSITION_MAP.get(slot, "")
        if pos and ((slot != 25 and "/" not in pos) or "/" in name):
            return pos
    return _DEFAULT_POSITIONS.get(info.get("defaultPositionId"), "")


def topic_key(topic: dict) -> str:
    """ESPN's id for an activity topic, or failing that its date and messages."""
    if topic.get("id"):
        return str(topic["id"])
    msgs = ",".join(f"{m.get('messageTypeId')}:{m.get('targetId')}" for m in topic.get("messages", []))
    return f"{topic.get('date')}|{msgs}"


def topic_player_ids(topics: Iterable[dict]) -> set[int]:
    return {m["targetId"] for t in topics for m in t.get("messages", []) if isinstance(m.get("targetId"), int)}


def activity_from_topic(topic: dict, team_by_id, players: dict[int, dict]) -> dict:
    """A raw ESPN activity topic as a plain dict of actions.

    `team_by_id(team_id)` gives a team's fields (team_fields) or None;
    `players` maps player id to {"name", "position"}.
    """
    def player(pid) -> dict:
        info = players.get(pid) if isinstance(pid, int) else None
        if info:
            return {"player_id": pid, "name": info["name"], "position": info.get("position", "")}
        return {"player_id": pid if isinstance(pid, int) else -1, "name": f"Player {pid}", "position": ""}

    actions = []
    for msg in topic.get("messages", []):
        mid = msg.get("messageTypeId")
        if mid == TRADE_MESSAGE:
            sender, receiver = team_by_id(msg.get("from")), team_by_id(msg.get("to"))
            p = player(msg.get("targetId"))
            if sender:
                actions.append({"team": sender, "action": "TRADE_SENT", "player": p, "bid": 0})
            if receiver:
                actions.append({"team": receiver, "action": "TRADE_RECEIVED", "player": p, "bid": 0})
        elif mid in MOVE_MESSAGES:
            action = MOVE_MESSAGES[mid]
            team = team_by_id(msg.get("for") if mid == 239 else msg.get("to"))
            bid = msg.get("from", 0) if action == "WAIVER ADDED" else 0
            actions.append({
                "team": team,
                "action": action,
                "player": player(msg.get("targetId")),
                "bid": int(bid) if isinstance(bid, (int, float)) else 0,
            })
    return {"uid": topic_key(topic), "date": int(topic.get("date", 0)), "actions": actions}


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
            "uid": act.get("uid") or str(act["date"]),
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
