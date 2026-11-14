"""One owner's record against every other owner, across every season.

Pure functions over the cached season payloads (teams and matchups), so the
endpoint is a thin loader and this is testable without ESPN.

ESPN team ids are per season, so every meeting is matched by owner: a season's
teams map team id → owner, then each game between the owner's team and
another team counts against that team's owner that season.
"""

from __future__ import annotations

from typing import Iterable

from .season_state import is_unplayed


def _owner_name(owner: dict) -> str:
    return f"{owner.get('first_name', '')} {owner.get('last_name', '')}".strip()


def rivalry_summary(owner_id: str, seasons: Iterable[tuple[int, dict, list[dict]]]) -> dict:
    """`owner_id`'s record against each other owner.

    `seasons` holds (year, teams payload, matchups) per season, in any order.
    Every other owner seen in any season gets a row, even with no meetings, so
    the list is "everyone", sorted by meetings (most first) then name.
    """
    seasons = sorted(seasons, key=lambda s: s[0])
    owner_name = ""
    owner_team_name = ""
    rows: dict[str, dict] = {}

    for year, teams_payload, matchups in seasons:
        owner_by_team: dict[int, dict] = {}
        for t in teams_payload.get("teams", []):
            if t.get("owners"):
                owner_by_team[t["team_id"]] = {"team": t, "owner": t["owners"][0]}

        mine = next((tid for tid, v in owner_by_team.items() if v["owner"]["id"] == owner_id), None)

        # Everyone in the league that season gets a row; names track the
        # latest season they played.
        for tid, v in owner_by_team.items():
            oid = v["owner"]["id"]
            if oid == owner_id:
                owner_name = _owner_name(v["owner"])
                owner_team_name = v["team"]["team_name"]
                continue
            row = rows.setdefault(oid, {
                "opponent_id": oid,
                "opponent_name": "",
                "opponent_team_name": "",
                "meetings": 0,
                "wins": 0,
                "losses": 0,
                "ties": 0,
                "points_for": 0.0,
                "points_against": 0.0,
                "playoff_meetings": 0,
                "playoff_wins": 0,
                "playoff_losses": 0,
                "last_meeting": None,
            })
            row["opponent_name"] = _owner_name(v["owner"])
            row["opponent_team_name"] = v["team"]["team_name"]

        if mine is None:
            continue

        for m in matchups:
            a, b = m.get("team_a_id"), m.get("team_b_id")
            if mine not in (a, b) or is_unplayed(m):
                continue
            opp_tid = b if a == mine else a
            opp = owner_by_team.get(opp_tid)
            if not opp or opp["owner"]["id"] == owner_id:
                continue
            row = rows[opp["owner"]["id"]]
            own, theirs = (
                (m["team_a_score"], m["team_b_score"]) if a == mine else (m["team_b_score"], m["team_a_score"])
            )
            result = "W" if m.get("winner_id") == mine else "L" if m.get("winner_id") == opp_tid else "T"

            row["meetings"] += 1
            row["points_for"] += own
            row["points_against"] += theirs
            row[{"W": "wins", "L": "losses", "T": "ties"}[result]] += 1
            if m.get("is_playoff"):
                row["playoff_meetings"] += 1
                if result == "W":
                    row["playoff_wins"] += 1
                elif result == "L":
                    row["playoff_losses"] += 1

            last = row["last_meeting"]
            if last is None or (year, m["week"]) >= (last["year"], last["week"]):
                row["last_meeting"] = {
                    "year": year,
                    "week": m["week"],
                    "result": result,
                    "score": round(own, 2),
                    "opponent_score": round(theirs, 2),
                    "is_playoff": bool(m.get("is_playoff")),
                    "own_team_id": mine,
                    "opponent_team_id": opp_tid,
                }

    opponents = []
    for row in rows.values():
        n = row["meetings"]
        row["points_for"] = round(row["points_for"], 2)
        row["points_against"] = round(row["points_against"], 2)
        row["avg_pf"] = round(row["points_for"] / n, 2) if n else None
        row["avg_pa"] = round(row["points_against"] / n, 2) if n else None
        opponents.append(row)
    opponents.sort(key=lambda r: (-r["meetings"], r["opponent_name"]))

    return {
        "owner_id": owner_id,
        "owner_name": owner_name,
        "owner_team_name": owner_team_name,
        "opponents": opponents,
    }
