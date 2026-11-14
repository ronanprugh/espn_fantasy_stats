"""Whether a season, and each game in it, is finished.

ESPN lists a live season's whole schedule up front, so its matchups include
games that haven't been played (0–0, no winner) and, during a scoring week,
games still being played (points on the board, no winner yet). Neither is a
result. Stats that treat them as one count future weeks as ties, partial
scores as low scores, and a mid-season standing as a finish.
"""

from __future__ import annotations


def season_over(season: dict) -> bool:
    """A season's playoffs are done once ESPN gives every team a final
    standing; the same rule as the frontend's isInProgress."""
    return all(t["final_standing"] for t in season["teams"])


def is_unplayed(m: dict) -> bool:
    """A scheduled game that hasn't happened: no winner and no points."""
    return m.get("winner_id") is None and not m.get("team_a_score") and not m.get("team_b_score")


def is_decided(m: dict) -> bool:
    """A game with a result: a winner, or a tie (equal points, both scored).

    A game being played has points but no winner, and almost never equal
    points, so it reads as undecided until ESPN closes the week.
    """
    if is_unplayed(m):
        return False
    return m.get("winner_id") is not None or m.get("team_a_score") == m.get("team_b_score")


def result_for(m: dict, team_id: int) -> str:
    """'W', 'L' or 'T' from `team_id`'s side once decided; 'U' before."""
    if not is_decided(m):
        return "U"
    if m.get("winner_id") is None:
        return "T"
    return "W" if m["winner_id"] == team_id else "L"
