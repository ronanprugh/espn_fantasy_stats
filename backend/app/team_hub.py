"""Team Hub's career records and schedule, as pure functions over the cached
season payloads, so they can be tested without ESPN.

Only decided games count toward records and streaks: a live season's future
weeks (0–0, no winner) and a game still being played are not results. See
season_state.
"""

from __future__ import annotations

from collections.abc import Iterable

from .season_state import is_decided, is_unplayed, result_for

# (value, year, week, opponent name, own team id, opponent team id)
Record = tuple[float, int, int, str, int, int]


def _sides(m: dict, team_id: int) -> tuple[float, float, str, int]:
    """(own score, opponent score, opponent name, opponent id)."""
    if m["team_a_id"] == team_id:
        return m["team_a_score"], m["team_b_score"], m["team_b_name"], m["team_b_id"]
    return m["team_b_score"], m["team_a_score"], m["team_a_name"], m["team_a_id"]


def _fmt(t: Record | None) -> dict | None:
    if t is None:
        return None
    return {
        "value": round(t[0], 2),
        "year": t[1],
        "week": t[2],
        "opponent": t[3],
        "own_team_id": t[4],
        "opp_team_id": t[5],
    }


def career_records(seasons: Iterable[tuple[int, int, list[dict]]]) -> dict:
    """Best and worst games and longest streaks, from (year, the owner's team
    id that year, the season's matchups). Byes and consolation games don't
    count, and neither does anything not yet decided."""
    best = worst = biggest_win = biggest_loss = None
    results: list[tuple[int, int, str]] = []

    for year, team_id, matchups in sorted(seasons, key=lambda s: s[0]):
        for m in matchups:
            if m["is_bye"] or m.get("round_label") == "consolation":
                continue
            if team_id not in (m["team_a_id"], m["team_b_id"]):
                continue
            if not is_decided(m):
                continue
            own, opp, opp_name, opp_id = _sides(m, team_id)
            rec = lambda v: (v, year, m["week"], opp_name, team_id, opp_id)  # noqa: E731
            if best is None or own > best[0]:
                best = rec(own)
            if worst is None or own < worst[0]:
                worst = rec(own)
            margin = own - opp
            if margin > 0 and (biggest_win is None or margin > biggest_win[0]):
                biggest_win = rec(margin)
            elif margin < 0 and (biggest_loss is None or -margin > biggest_loss[0]):
                biggest_loss = rec(-margin)
            results.append((year, m["week"], result_for(m, team_id)))

    results.sort(key=lambda r: (r[0], r[1]))
    longest_w = longest_l = cur_w = cur_l = 0
    for _, _, r in results:
        if r == "W":
            cur_w, cur_l = cur_w + 1, 0
            longest_w = max(longest_w, cur_w)
        elif r == "L":
            cur_l, cur_w = cur_l + 1, 0
            longest_l = max(longest_l, cur_l)
        else:
            cur_w = cur_l = 0

    return {
        "highest_score": _fmt(best),
        "lowest_score": _fmt(worst),
        "biggest_win_margin": _fmt(biggest_win),
        "biggest_loss_margin": _fmt(biggest_loss),
        "longest_win_streak": longest_w,
        "longest_loss_streak": longest_l,
    }


def team_schedule(matchups: list[dict], team_id: int) -> tuple[list[dict], dict | None]:
    """Every game (and bye) for the team, in week order, and its latest game
    with points on the board: the one being played, or else the last result.
    Future games are listed with result 'U' and are never the latest game."""
    schedule: list[dict] = []
    latest: dict | None = None
    mine = sorted(
        (m for m in matchups if team_id in (m["team_a_id"], m["team_b_id"])),
        key=lambda m: m["week"],
    )
    for m in mine:
        base = {
            "week": m["week"],
            "round_label": m.get("round_label", "regular"),
            "is_playoff": m["is_playoff"],
        }
        if m["is_bye"]:
            schedule.append({
                **base,
                "is_bye": True,
                "own_team_id": team_id,
                "own_team_name": m["team_a_name"],
                "own_score": m["team_a_score"],
                "opp_team_id": None,
                "opp_team_name": "",
                "opp_owner_name": "",
                "opp_score": 0.0,
                "result": "BYE",
            })
            continue
        own_is_a = m["team_a_id"] == team_id
        game = {
            **base,
            "is_bye": False,
            "own_team_id": team_id,
            "own_team_name": m["team_a_name"] if own_is_a else m["team_b_name"],
            "own_score": m["team_a_score"] if own_is_a else m["team_b_score"],
            "opp_team_id": m["team_b_id"] if own_is_a else m["team_a_id"],
            "opp_team_name": m["team_b_name"] if own_is_a else m["team_a_name"],
            "opp_owner_name": m["team_b_owner"] if own_is_a else m["team_a_owner"],
            "opp_score": m["team_b_score"] if own_is_a else m["team_a_score"],
            "result": result_for(m, team_id),
        }
        schedule.append(game)
        if not is_unplayed(m):
            latest = game
    return schedule, latest
