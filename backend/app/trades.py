"""A league's transactions: trades and who won them, and the waiver claims,
free-agent pickups and drops.

Where the data comes from (seasons from 2019 on):

- ESPN's activity feed ("communication"), where it's served: the season in
  progress, and some past ones. Each transaction is one "topic" of messages:
  a trade holds one message per player, from the sending team to the
  receiving one; a pickup holds an add (waiver or free agent) and usually a
  drop. activity_from_topic turns a raw topic into a plain dict (so it can be
  cached), with player names and positions from a directory fetched in one go
  (espn_api's own Activity fetches each unknown player separately).
- For past seasons the feed answers 404 ("This Communication Group does not
  exist"), the transactions view (`mTransactions2`): activity_from_transaction
  reads its waiver claims, pickups and drops into the same dicts. It lists
  the players of a trade that went through only to a member who was in it;
  to everyone it lists only that trades went through (trade_events). So
  trades_from_rosters rebuilds every past trade from the weekly rosters: a
  player who changes teams without being picked up was traded.

The other functions derive one record per trade or move. Trades are credited
with what each side's new players went on to score for it, from the week of
the trade to the end of the season, read from the cached weekly box scores.

Trades are decided by WAR (wins above replacement): for every week one of a
side's new players started for it, how much more likely his points made an
average team to win than a replacement player's would have (war_baselines).
Only starts count: points left on the bench didn't help anyone. Bench points
are reported alongside, as is each side's team points per game since the
trade, against what it would have scored had it kept the players it sent.
"""

from __future__ import annotations

import math
import statistics
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


def transaction_player_ids(transactions: Iterable[dict]) -> set[int]:
    return {
        i["playerId"] for t in transactions for i in t.get("items") or [] if isinstance(i.get("playerId"), int)
    }


# mTransactions2 transaction types that move players on or off a roster.
_PICKUP_TYPES = {"WAIVER", "FREEAGENT", "ROSTER"}


def activity_from_transaction(tx: dict, team_by_id, players: dict[int, dict]) -> dict | None:
    """An ESPN transaction (the `mTransactions2` view) as the same plain dict
    activity_from_topic makes, or None for one that didn't happen (proposed,
    vetoed, failed) or moved nobody.

    This is the fallback for seasons ESPN's activity feed no longer serves:
    the feed answers 404 for many past seasons, while the transactions view
    keeps them. Only EXECUTED transactions count. Trades are TRADE items from
    one team to another; pickups are ADD items (a WAIVER transaction's bid
    is its winning bid) and DROP items.
    """
    if tx.get("status") != "EXECUTED":
        return None
    kind = tx.get("type") or ""

    def player(pid) -> dict:
        info = players.get(pid) if isinstance(pid, int) else None
        if info:
            return {"player_id": pid, "name": info["name"], "position": info.get("position", "")}
        return {"player_id": pid if isinstance(pid, int) else -1, "name": f"Player {pid}", "position": ""}

    actions = []
    bid = tx.get("bidAmount") or 0
    for item in tx.get("items") or []:
        itype, pid = item.get("type"), item.get("playerId")
        if kind.startswith("TRADE") and itype == "TRADE":
            sender, receiver = team_by_id(item.get("fromTeamId")), team_by_id(item.get("toTeamId"))
            p = player(pid)
            if sender:
                actions.append({"team": sender, "action": "TRADE_SENT", "player": p, "bid": 0})
            if receiver:
                actions.append({"team": receiver, "action": "TRADE_RECEIVED", "player": p, "bid": 0})
        elif kind in _PICKUP_TYPES and itype == "ADD":
            if (item.get("fromTeamId") or 0) > 0:
                continue  # from another team: a trade leg, not a pickup (the rosters show it)
            action = "WAIVER ADDED" if kind == "WAIVER" else "FA ADDED"
            actions.append({
                "team": team_by_id(item.get("toTeamId")),
                "action": action,
                "player": player(pid),
                # The bid is the transaction's; credit it once.
                "bid": int(bid) if action == "WAIVER ADDED" and isinstance(bid, (int, float)) else 0,
            })
            bid = 0
        elif (kind in _PICKUP_TYPES or kind == "TRADE_ACCEPT") and itype == "DROP":
            actions.append({"team": team_by_id(item.get("fromTeamId")), "action": "DROPPED", "player": player(pid), "bid": 0})
    if not actions:
        return None
    date = tx.get("processDate") or tx.get("proposedDate") or 0
    activity = {"uid": f"tx:{tx.get('id') or date}", "date": int(date), "actions": actions}
    if isinstance(tx.get("scoringPeriodId"), int):
        # ESPN's own week for it, which places it exactly against the rosters.
        activity["period"] = tx["scoringPeriodId"]
    return activity


def trade_events(transactions: Iterable[dict]) -> list[dict]:
    """When trades went through, from the transactions view: the accepting
    (or upholding, or proposing) team, the scoring period and the time.

    For past seasons that's all ESPN reliably keeps of a trade there. The
    accepted proposal, with its players, is listed only to a member who was
    in the trade (to anyone else only cancelled proposals are), so the
    players come from the weekly rosters (trades_from_rosters)."""
    events = []
    for tx in transactions:
        kind = tx.get("type")
        if kind == "TRADE_PROPOSAL" and tx.get("status") != "EXECUTED":
            continue
        if kind not in ("TRADE_ACCEPT", "TRADE_UPHOLD", "TRADE_PROPOSAL"):
            continue
        if tx.get("status") not in (None, "EXECUTED") or tx.get("executionType", "EXECUTE") != "EXECUTE":
            continue
        events.append({
            "team_id": tx.get("teamId"),
            "week": tx.get("scoringPeriodId"),
            "date": int(tx.get("processDate") or tx.get("proposedDate") or 0),
        })
    return events


def _week_start_ms(year: int, week: int) -> int:
    """Noon Eastern on the Tuesday a fantasy week starts (see week_of)."""
    day = kickoff(year) - timedelta(days=2) + timedelta(weeks=week - 1)
    return int(datetime(day.year, day.month, day.day, 12, tzinfo=EASTERN).timestamp() * 1000)


# Legs of one trade can show up a week apart in the rosters (a player
# traded mid-week appears with his new team the next week, one dropped at
# once shows only in the drop), so legs between the same two teams this
# many weeks apart or fewer are one trade.
_TRADE_LEG_WEEKS = 1


def trades_from_rosters(
    box_by_week: dict[int, dict],
    activities: Iterable[dict],
    events: Iterable[dict],
    team_by_id,
    year: int,
    known: Iterable[dict] = (),
) -> list[dict]:
    """A past season's trades, rebuilt from its rosters and transactions, in
    the shape trades_from_activity gives.

    `known` are trades ESPN listed in full (to a member, the ones they were
    in): they're kept as they are, and the rest are rebuilt.

    Each player's owner is followed through the season, event by event: his
    pickups and drops (and the trades in `known`) at their times, and the
    weekly rosters as of the end of each week. A pickup makes the picking
    team his owner and a drop leaves him unowned. Where a roster shows him
    on a team other than his owner, or another team drops him, his owner
    traded him to that team. Following every move, not just the rosters, is
    what gets the sender right for a player picked up and traded within the
    same week, and finds one cut straight after a trade.

    Legs between the same two teams within _TRADE_LEG_WEEKS of each other
    are one trade, credited from its first week. Its time is an acceptance
    from `events` where there is one, else the start of the week. The box
    scores carry the whole roster, bench and IR included.
    """
    known = list(known)
    # (week, order, time, player id, what, team, player)
    timeline: list[tuple] = []
    for act in activities:
        week = act.get("period") or week_of(act["date"], year)
        for a in act["actions"]:
            if not a["team"]:
                continue
            what = {"WAIVER ADDED": "add", "FA ADDED": "add", "DROPPED": "drop", "TRADE_RECEIVED": "add"}.get(a["action"])
            if what:
                timeline.append((week, 0, act["date"], a["player"]["player_id"], what, a["team"]["team_id"], a["player"]))
    names: dict[int, dict] = {}
    for week in box_by_week:
        for m in box_by_week[week].get("matchups", []):
            for side in (m.get("home"), m.get("away")):
                if not side:
                    continue
                for p in side.get("lineup", []):
                    pid = p["player_id"]
                    names[pid] = {"player_id": pid, "name": p.get("name") or f"Player {pid}", "position": p.get("position", "")}
                    timeline.append((week, 1, 0, pid, "roster", side["team_id"], names[pid]))
    timeline.sort(key=lambda e: e[:3])

    # (week, player, sender, receiver)
    legs: list[tuple[int, dict, int, int]] = []
    owner: dict[int, int | None] = {}
    for week, _, _, pid, what, team, player in timeline:
        current = owner.get(pid)
        if what == "add":
            owner[pid] = team
        elif what == "drop":
            if current is not None and current != team:
                legs.append((week, names.get(pid) or player, current, team))
            owner[pid] = None
        else:  # on this team's roster at the end of the week
            if current is not None and current != team:
                legs.append((week, player, current, team))
            owner[pid] = team

    groups: list[dict] = []
    for week, player, sender, receiver in sorted(legs, key=lambda leg: leg[0]):
        pair = tuple(sorted((sender, receiver)))
        group = next(
            (g for g in groups if g["pair"] == pair and week - g["last"] <= _TRADE_LEG_WEEKS), None
        )
        if group is None:
            group = {"pair": pair, "week": week, "last": week, "legs": []}
            groups.append(group)
        group["last"] = week
        group["legs"].append((player, sender, receiver))

    # A player traded twice in one week (A to B, then B to C) shows in the
    # weekly rosters only as A to C, a trade where A got nothing. ESPN trades
    # are between two teams, so where A and C each traded with the same team
    # that week, the player went through it: credit him to both of those
    # trades instead.
    def near(g: dict, h: dict) -> bool:
        return g["week"] - _TRADE_LEG_WEEKS <= h["week"] <= g["last"] + _TRADE_LEG_WEEKS

    for g in list(groups):
        receivers = {r for _, _, r in g["legs"]}
        if len(receivers) != 1:
            continue
        (to,) = receivers
        (frm,) = set(g["pair"]) - {to}
        via = [
            b for b in {t for h in groups if h is not g and near(g, h) for t in h["pair"]} - {frm, to}
            if any(h["pair"] == tuple(sorted((frm, b))) and near(g, h) for h in groups)
            and any(h["pair"] == tuple(sorted((b, to))) and near(g, h) for h in groups)
        ]
        if len(via) != 1:
            continue
        b = via[0]
        first = next(h for h in groups if h["pair"] == tuple(sorted((frm, b))) and near(g, h))
        second = next(h for h in groups if h["pair"] == tuple(sorted((b, to))) and near(g, h))
        for player, _, _ in g["legs"]:
            first["legs"].append((player, frm, b))
            second["legs"].append((player, b, to))
        groups.remove(g)

    def overlaps_known(g: dict) -> bool:
        return any(
            {s["team_id"] for s in t["sides"]} >= set(g["pair"])
            and g["week"] - _TRADE_LEG_WEEKS <= t["week"] <= g["last"] + _TRADE_LEG_WEEKS
            for t in known
        )

    when = {}
    for e in events:
        key = (e["week"], e["team_id"])
        when[key] = max(when.get(key, 0), e["date"])

    trades = list(known)
    for g in groups:
        if overlaps_known(g):
            continue
        a, b = g["pair"]
        teams = {tid: team_by_id(tid) for tid in (a, b)}
        if not all(teams.values()):
            continue
        sides = {tid: {**teams[tid], "received": [], "sent": []} for tid in (a, b)}
        for player, sender, receiver in g["legs"]:
            if player not in sides[receiver]["received"]:
                sides[sender]["sent"].append(player)
                sides[receiver]["received"].append(player)
        weeks = range(g["week"] - _TRADE_LEG_WEEKS, g["last"] + 1)
        date = max((when.get((w, t), 0) for w in weeks for t in (a, b)), default=0) or _week_start_ms(year, g["week"])
        trades.append({
            "uid": f"roster:{year}:{g['week']}:{a}-{b}",
            "date": date,
            "week": g["week"],
            "sides": sorted(sides.values(), key=lambda s: s["team_id"]),
        })
    trades.sort(key=lambda t: t["date"])
    return trades


# The same players changing hands between the same teams within this long is
# one trade listed twice (a proposal and its acceptance, say), not two.
_DUPLICATE_TRADE_MS = 7 * 24 * 60 * 60 * 1000


def _trade_signature(sides: dict[int, dict]) -> tuple:
    return tuple(sorted(
        (tid, kind, p["player_id"]) for tid, s in sides.items() for kind in ("received", "sent") for p in s[kind]
    ))


def trades_from_activity(activities: Iterable[dict], year: int) -> list[dict]:
    """One record per trade, oldest first, from normalized activities.
    A trade that appears twice (the same players between the same teams,
    days apart at most) is kept once, at its first appearance."""
    trades = []
    seen: dict[tuple, int] = {}
    for act in sorted(activities, key=lambda a: a["date"]):
        sides: dict[int, dict] = {}
        for a in act["actions"]:
            team = a["team"]
            if team is None or a["action"] not in ("TRADE_SENT", "TRADE_RECEIVED"):
                continue
            side = sides.setdefault(team["team_id"], {**team, "received": [], "sent": []})
            side["received" if a["action"] == "TRADE_RECEIVED" else "sent"].append(a["player"])
        if len(sides) < 2:
            continue
        signature = _trade_signature(sides)
        if signature in seen and act["date"] - seen[signature] <= _DUPLICATE_TRADE_MS:
            continue
        seen[signature] = act["date"]
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


def _team_scores_by_week(box_by_week: dict[int, dict]) -> dict[int, dict[int, float]]:
    """week -> team_id -> the team's score (its starters' points)."""
    out: dict[int, dict[int, float]] = {}
    for week, payload in box_by_week.items():
        for m in payload.get("matchups", []):
            for side in (m.get("home"), m.get("away")):
                if side:
                    out.setdefault(week, {})[side["team_id"]] = float(side.get("total_points") or 0.0)
    return out


# How many players past a position's starter pool replacement level averages.
REPLACEMENT_BAND = 3
# Fewest games a player needs to be ranked for replacement level.
MIN_RANKED_GAMES = 3


def _rostered(box_by_week: dict[int, dict]) -> Iterable[tuple[int, int, dict]]:
    """(week, team_id, lineup entry) for every rostered player, bench included."""
    for week, payload in box_by_week.items():
        for m in payload.get("matchups", []):
            for side in (m.get("home"), m.get("away")):
                if side:
                    for p in side.get("lineup", []):
                        yield week, side["team_id"], p


def war_baselines(box_by_week: dict[int, dict]) -> dict:
    """What a start is measured against, from the season's completed weeks.

    - sigma: the spread (standard deviation) of teams' weekly scores.
    - average: the average starter's points at each position, every team's
      starts in every week (a flex start counts at the player's position).
    - replacement: the waiver-wire level at each position. Every rostered
      player (bench included) is ranked by points per game; the starter pool
      is how many players the league starts there in a week (league size
      times the starts per team, flex starts included as teams used them);
      replacement is the average points per game of the REPLACEMENT_BAND
      players just past the pool, e.g. QB15-QB17 in a 14-team 1-QB league.
      Weeks a player didn't play (a bye, or out: no points and no
      projection) and IR stints don't count toward his points per game.
    """
    by_week = _team_scores_by_week(box_by_week).values()
    scores = [s for week in by_week for s in week.values()]
    teams = {team for week in by_week for team in week}
    team_weeks = len(scores)

    starts: dict[str, list[float]] = {}
    games: dict[int, list[float]] = {}
    position_of: dict[int, str] = {}
    for _, _, p in _rostered(box_by_week):
        pos, pts = p.get("position", ""), float(p.get("points") or 0.0)
        if not pos:
            continue
        if p.get("slot_position") not in BENCH_SLOTS:
            starts.setdefault(pos, []).append(pts)
        if p.get("slot_position") == "IR" or (pts == 0 and not p.get("projected_points")):
            continue
        games.setdefault(p["player_id"], []).append(pts)
        position_of[p["player_id"]] = pos

    weeks = len(box_by_week)
    need = min(MIN_RANKED_GAMES, weeks)
    ranked: dict[str, list[float]] = {}
    for pid, pts in games.items():
        if len(pts) >= need:
            ranked.setdefault(position_of[pid], []).append(statistics.fmean(pts))
    replacement = {}
    for pos, pool_starts in starts.items():
        ppg = sorted(ranked.get(pos, []), reverse=True)
        if not ppg:
            continue
        pool = round(len(pool_starts) / team_weeks * len(teams)) if team_weeks else 0
        band = ppg[pool:pool + REPLACEMENT_BAND] or ppg[-REPLACEMENT_BAND:]
        replacement[pos] = statistics.fmean(band)
    return {
        "sigma": statistics.pstdev(scores) if len(scores) > 1 else 0.0,
        "average": {pos: statistics.fmean(v) for pos, v in starts.items()},
        "replacement": replacement,
    }


def _win_chance(points_over_average: float, sigma: float) -> float:
    """An average team's chance of beating an average opponent once one of its
    starters scores this far from the average starter: the normal curve of
    weekly scores, read at that many points from the middle."""
    return 0.5 * (1 + math.erf(points_over_average / (sigma * math.sqrt(2))))


def start_war(points: float, position: str, baselines: dict) -> float:
    """Wins above replacement for one start: the average team's chance of
    winning with these points in the slot, less its chance with the worst
    starter's. Zero where there's nothing to measure against."""
    sigma = baselines["sigma"]
    average = baselines["average"].get(position)
    replacement = baselines["replacement"].get(position)
    if not sigma or average is None or replacement is None:
        return 0.0
    return _win_chance(points - average, sigma) - _win_chance(replacement - average, sigma)


def _ppg(scores: list[float]) -> float | None:
    return round(statistics.fmean(scores), 2) if scores else None


FLEX_ANY = {"QB", "RB", "WR", "TE"}


def fits_slot(position: str, slot: str) -> bool:
    """Whether a player at `position` can start in lineup `slot` (RB/WR/TE
    and the like take any of their positions; OP takes any offensive one)."""
    if not position or slot in BENCH_SLOTS:
        return False
    if slot == position:
        return True
    if slot == "OP":
        return position in FLEX_ANY
    return "/" in slot and position in slot.split("/")


def _score_if_kept(lineup: dict[int, dict], received: set[int], kept: list[dict]) -> float:
    """A team's score for a week had it kept the players it traded away.

    Starts from what really happened: the slots its new players started in
    are emptied, and each is refilled, highest-scoring first, by the best
    eligible player among those it traded away (with what he scored that week
    wherever he was) and its own bench that week. A slot nobody fits scores 0.
    Everyone else's starts stand.
    """
    score = 0.0
    open_slots = []
    for p in lineup.values():
        if p["slot_position"] in BENCH_SLOTS:
            continue
        if p["player_id"] in received:
            open_slots.append(p["slot_position"])
        else:
            score += p["points"]
    if not open_slots:
        return score
    candidates = kept + [
        p for p in lineup.values() if p["slot_position"] in BENCH_SLOTS and p["player_id"] not in received
    ]
    used: set[int] = set()
    for slot in open_slots:
        fit = [c for c in candidates if c["player_id"] not in used and fits_slot(c.get("position", ""), slot)]
        if fit:
            best = max(fit, key=lambda c: c["points"])
            used.add(best["player_id"])
            score += best["points"]
    return score


def trade_outcomes(trades: list[dict], box_by_week: dict[int, dict]) -> list[dict]:
    """Each trade with what every side's new players did for it from the
    trade's week on, read from the season's completed weeks (`box_by_week`,
    every one from week 1, so the baselines and the before-trade points per
    game have the whole season to draw on).

    Per player: WAR, starting points, bench points and weeks started. Per side:
    the players' total WAR (which decides the winner) and starting points, and
    the team's points per game since the trade, as it was and as it would have
    been had it kept the players it sent (_score_if_kept). The winner is the
    side whose new players added the most WAR; none on a tie, or before
    anyone has played."""
    lineups = _lineups_by_week(box_by_week)
    team_scores = _team_scores_by_week(box_by_week)
    baselines = war_baselines(box_by_week)
    # week -> player_id -> his lineup entry, on whichever team had him.
    where = {w: {pid: e for team in teams.values() for pid, e in team.items()} for w, teams in lineups.items()}
    weeks = sorted(lineups)
    result = []
    for trade in trades:
        sides = []
        for side in trade["sides"]:
            players = []
            for p in side["received"]:
                started = bench = war = 0.0
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
                        war += start_war(entry["points"], entry.get("position") or p.get("position", ""), baselines)
                players.append({
                    **p,
                    "war": round(war, 3),
                    "started_points": round(started, 2),
                    "bench_points": round(bench, 2),
                    "weeks_started": weeks_started,
                })
            received_ids = {p["player_id"] for p in side["received"]}
            with_trade, without = [], []
            for w in weeks:
                lineup = lineups[w].get(side["team_id"])
                if w < trade["week"] or lineup is None:
                    continue
                with_trade.append(team_scores[w][side["team_id"]])
                kept = [where[w][p["player_id"]] for p in side["sent"] if p["player_id"] in where.get(w, {})]
                without.append(_score_if_kept(lineup, received_ids, kept))
            sides.append({
                **{k: v for k, v in side.items() if k != "received"},
                "received": players,
                "war": round(sum(x["war"] for x in players), 3),
                "started_points": round(sum(x["started_points"] for x in players), 2),
                "ppg": _ppg(with_trade),
                "ppg_if_kept": _ppg(without),
                "games": len(with_trade),
            })
        ranked = sorted(sides, key=lambda s: s["war"], reverse=True)
        margin = round(ranked[0]["war"] - ranked[1]["war"], 2)
        winner = ranked[0]["team_id"] if margin > 0 else None
        result.append({**trade, "sides": sides, "winner_team_id": winner, "margin": margin})
    return result
