"""Power rankings: importing a league's history and laying it out week by week.

A league's commissioner (or anyone) posts rankings most weeks, but not every
week. The archive stores only what was posted; `build_season` turns that into
one row per regular-season week, filling the gaps so a team always has a rank
to chart. Filled weeks are marked, never passed off as posted:

- A week with no rankings carries the most recent earlier week's ranks forward.
- Weeks before a season's first rankings take that first week's ranks, since
  nothing earlier in the season exists to carry forward. Seasons never borrow
  from each other: a new season starts from new rankings.

Week numbers are the week a post looks ahead to. Preseason rankings are week 1;
rankings written after Week 3's games are week 4. That is how the posts read
("POWER RANKINGS WEEK 4" opens with each team's 3-game record) and it puts a
ranking next to the games it was predicting.
"""
from __future__ import annotations

import base64
import binascii
import datetime as dt
import re
from collections import Counter
from collections.abc import Iterable
from typing import Any

from sqlalchemy import delete
from sqlalchemy.orm import Session

from .models import PowerRankingEntry, PowerRankingPost

POSTED = "posted"
CARRIED_FORWARD = "carried_forward"
CARRIED_BACK = "carried_back"


class ImportError_(ValueError):
    """An import file that can't be stored as-is. The message is shown to the
    person who uploaded it, so it says what to fix."""


# --------------------------------------------------------------------------- #
# Import
# --------------------------------------------------------------------------- #


def _norm_name(name: str) -> str:
    s = name.lower().replace("’", "'").strip()
    s = re.sub(r"^the\s+", "", s)
    return re.sub(r"[^a-z0-9]", "", s)


def team_name_index(seasons_teams: dict[int, list[dict]]) -> dict[int, dict[str, int]]:
    """season -> normalised name -> team_id.

    A season's index also holds every other season's names for the same team,
    so "Fallen Angels" still resolves in a year the team was called "The
    BoLitos". The season's own names win any collision.
    """
    all_names: dict[int, set[str]] = {}
    for teams in seasons_teams.values():
        for t in teams:
            names = all_names.setdefault(t["team_id"], set())
            names.add(_norm_name(t["team_name"]))
            if t.get("abbrev"):
                names.add(_norm_name(t["abbrev"]))
    index: dict[int, dict[str, int]] = {}
    for season, teams in seasons_teams.items():
        ids = {t["team_id"] for t in teams}
        own: dict[str, int] = {}
        for tid in ids:
            for n in all_names.get(tid, ()):
                own.setdefault(n, tid)
        for t in teams:
            own[_norm_name(t["team_name"])] = t["team_id"]
        index[season] = own
    return index


def _parse_posted_at(raw: Any, i: int) -> dt.datetime:
    if not isinstance(raw, str):
        raise ImportError_(f"Post {i + 1} needs a posted_at date like 2024-09-12T17:07:18.")
    try:
        parsed = dt.datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        raise ImportError_(f"Post {i + 1} has a posted_at of {raw!r}, which isn't a date.")
    return parsed.replace(tzinfo=None)


def store_import(
    db: Session,
    espn_league_id: int,
    posts: list[dict],
    seasons_teams: dict[int, list[dict]],
) -> dict:
    """Replace the league's archive with `posts`. All or nothing: any post that
    can't be resolved rejects the whole file, so a half-imported history never
    shows up as gaps that look like weeks nobody posted.

    `seasons_teams` is each referenced season's ESPN team list, used to check
    team_ids and resolve entries that only give a team name.
    """
    index = team_name_index(seasons_teams)
    rows: list[PowerRankingPost] = []
    unmatched: list[str] = []
    for i, p in enumerate(posts):
        season = p.get("season")
        week = p.get("week")
        if not isinstance(season, int) or season not in seasons_teams:
            raise ImportError_(f"Post {i + 1} is for season {season!r}, which this league didn't play.")
        if not isinstance(week, int) or week < 1:
            raise ImportError_(f"Post {i + 1} needs a week number of 1 or more.")
        kind = p.get("kind", "rankings")
        fmt = p.get("format", "text")
        if kind not in ("rankings", "preview"):
            raise ImportError_(f"Post {i + 1} has kind {kind!r}; use 'rankings' or 'preview'.")
        if fmt not in ("text", "image"):
            raise ImportError_(f"Post {i + 1} has format {fmt!r}; use 'text' or 'image'.")
        image = None
        if p.get("image_base64"):
            try:
                image = base64.b64decode(p["image_base64"], validate=True)
            except (binascii.Error, ValueError):
                raise ImportError_(f"Post {i + 1}'s image isn't valid base64.")
        title = (p.get("title") or "").strip() or f"Week {week} Power Rankings"
        row = PowerRankingPost(
            espn_league_id=espn_league_id,
            season=season,
            week=week,
            posted_at=_parse_posted_at(p.get("posted_at"), i),
            title=title[:255],
            author=((p.get("author") or "").strip() or "Unknown")[:128],
            kind=kind,
            format=fmt,
            body=p.get("text") or "",
            note=p.get("note") or None,
            image=image,
            image_mime=(p.get("image_mime") or None) if image else None,
        )
        valid_ids = {t["team_id"] for t in seasons_teams[season]}
        seen: set[int] = set()
        for e in p.get("entries") or []:
            tid = e.get("team_id")
            if tid not in valid_ids:
                tid = index[season].get(_norm_name(e.get("team_name") or ""))
            if tid is None:
                unmatched.append(f"{season} week {week}: {e.get('team_name') or e.get('team_id')!r}")
                continue
            if tid in seen:
                raise ImportError_(f"{title} ({season}) lists the same team twice.")
            seen.add(tid)
            rank = e.get("rank")
            if not isinstance(rank, int) or rank < 1:
                raise ImportError_(f"{title} ({season}) has an entry without a rank.")
            row.entries.append(
                PowerRankingEntry(
                    rank=rank,
                    espn_team_id=tid,
                    written_name=(e.get("team_name") or "")[:255],
                    record=(e.get("record") or None),
                    change=(e.get("change") or None),
                    blurb=e.get("blurb") or "",
                )
            )
        rows.append(row)
    if unmatched:
        shown = "; ".join(unmatched[:8]) + (f"; and {len(unmatched) - 8} more" if len(unmatched) > 8 else "")
        raise ImportError_(f"These team names didn't match a team in that season: {shown}.")

    db.execute(delete(PowerRankingPost).where(PowerRankingPost.espn_league_id == espn_league_id))
    db.add_all(rows)
    db.commit()
    return {
        "posts": len(rows),
        "rankings": sum(1 for r in rows if r.kind == "rankings" and r.entries),
        "seasons": sorted({r.season for r in rows}),
    }


# --------------------------------------------------------------------------- #
# Week-by-week layout
# --------------------------------------------------------------------------- #


def primary_author(posts: Iterable[PowerRankingPost]) -> str | None:
    """Whoever wrote the most rankings: the league's regular writer. Anyone
    else's rankings are guest editions."""
    counts = Counter(p.author for p in posts if p.kind == "rankings")
    return counts.most_common(1)[0][0] if counts else None


def _official_posts(posts: list[PowerRankingPost], author: str | None) -> dict[int, PowerRankingPost]:
    """The post whose ranks count for each week. A week can have several
    posts (a tier list and a guest list, say); ranked posts beat unranked
    ones, the regular writer beats a guest, and a later post beats an earlier
    one, since that's the one people read last."""
    best: dict[int, PowerRankingPost] = {}
    for p in posts:
        if p.kind != "rankings" or not p.entries:
            continue
        cur = best.get(p.week)
        key = (p.author == author, p.posted_at)
        if cur is None or key > (cur.author == author, cur.posted_at):
            best[p.week] = p
    return best


def _records_by_week(matchups: list[dict], last_week: int) -> dict[int, dict[int, dict]]:
    """week -> team_id -> {wins, losses, ties, pf} from games before that week."""
    regular = [m for m in matchups if not m.get("is_playoff")]
    out: dict[int, dict[int, dict]] = {}
    totals: dict[int, dict] = {}
    for week in range(1, last_week + 1):
        out[week] = {tid: dict(v) for tid, v in totals.items()}
        for m in regular:
            if m["week"] != week or not _is_played(m):
                continue
            for side, opp in (("a", "b"), ("b", "a")):
                tid = m[f"team_{side}_id"]
                rec = totals.setdefault(tid, {"wins": 0, "losses": 0, "ties": 0, "pf": 0.0})
                rec["pf"] += m[f"team_{side}_score"]
                if m["winner_id"] == tid:
                    rec["wins"] += 1
                elif m["winner_id"] == m[f"team_{opp}_id"]:
                    rec["losses"] += 1
                else:
                    rec["ties"] += 1
    return out


def _is_played(m: dict) -> bool:
    return m.get("winner_id") is not None or (m.get("team_a_score") or 0) > 0 or (m.get("team_b_score") or 0) > 0


def _standings(records: dict[int, dict], team_ids: list[int]) -> dict[int, int]:
    """Rank by win percentage (ties as half), then points for."""
    def key(tid: int):
        r = records.get(tid, {"wins": 0, "losses": 0, "ties": 0, "pf": 0.0})
        return (-(r["wins"] + r["ties"] / 2), -r["pf"])
    ordered = sorted(team_ids, key=key)
    return {tid: i + 1 for i, tid in enumerate(ordered)}


def _fmt_record(r: dict | None) -> str:
    if not r:
        return "0-0"
    return f"{r['wins']}-{r['losses']}" + (f"-{r['ties']}" if r["ties"] else "")


def build_season(
    season: int,
    posts: list[PowerRankingPost],
    teams: list[dict],
    matchups: list[dict],
    author: str | None,
    live: bool,
) -> dict | None:
    """One season's rankings, every regular-season week filled. None when the
    season has no ranked posts at all; there's nothing to fill from."""
    official = _official_posts(posts, author)
    if not official:
        return None
    team_ids = [t["team_id"] for t in teams]
    reg_weeks = max((m["week"] for m in matchups if not m.get("is_playoff")), default=0)
    reg_weeks = reg_weeks or max(official)
    played = max((m["week"] for m in matchups if not m.get("is_playoff") and _is_played(m)), default=0)
    # A live season runs only to the week about to be played: rankings for
    # Week 9 make sense on Tuesday, a carried-over rank for Week 14 doesn't.
    last_week = min(reg_weeks, played + 1) if live else reg_weeks
    last_week = max(last_week, max(official))
    records = _records_by_week(matchups, last_week)
    posted_weeks = sorted(official)

    weeks: list[dict] = []
    prev_ranks: dict[int, int] = {}
    for week in range(1, last_week + 1):
        if week in official:
            source, source_week = POSTED, week
        else:
            earlier = [w for w in posted_weeks if w < week]
            source_week = earlier[-1] if earlier else next(w for w in posted_weeks if w > week)
            source = CARRIED_FORWARD if earlier else CARRIED_BACK
        src = official[source_week]
        recs = records[week]
        standing = _standings(recs, team_ids) if week > 1 else {}
        entries = []
        for e in src.entries:
            if e.espn_team_id not in team_ids:
                continue
            posted = source == POSTED
            entries.append({
                "team_id": e.espn_team_id,
                "rank": e.rank,
                "change": (prev_ranks[e.espn_team_id] - e.rank) if e.espn_team_id in prev_ranks else None,
                "posted_change": e.change if posted else None,
                "record": (e.record or _fmt_record(recs.get(e.espn_team_id))) if posted else _fmt_record(recs.get(e.espn_team_id)),
                "standing": standing.get(e.espn_team_id),
                "points_for": round(recs.get(e.espn_team_id, {}).get("pf", 0.0), 2),
                "written_name": e.written_name if posted else "",
                "blurb": e.blurb if posted else "",
            })
        prev_ranks = {x["team_id"]: x["rank"] for x in entries}
        games = [
            [m["team_a_id"], m["team_b_id"], m["winner_id"]]
            for m in matchups
            if m["week"] == week and not m.get("is_playoff") and _is_played(m)
            and m.get("team_b_id") is not None
        ]
        weeks.append({
            "week": week,
            "source": source,
            "source_week": source_week,
            "post_id": src.id if source == POSTED else None,
            "extra_post_ids": [
                p.id for p in posts
                if p.week == week and p.kind == "rankings" and p.id != (src.id if source == POSTED else None)
            ],
            "entries": entries,
            "games": games,
        })

    return {
        "season": season,
        "reg_weeks": reg_weeks,
        "last_week": last_week,
        "live": live,
        "teams": [
            {
                "team_id": t["team_id"],
                "team_name": t["team_name"],
                "owner_id": t["owners"][0]["id"] if t["owners"] else "",
                "owner_name": (
                    f"{t['owners'][0].get('first_name', '')} {t['owners'][0].get('last_name', '')}".strip()
                    if t["owners"] else ""
                ) or "—",
                # Playoff finish once the season is over, else None.
                "final_standing": t.get("final_standing") or None,
                "reg_standing": t.get("standing") or None,
            }
            for t in teams
        ],
        "weeks": weeks,
        "previews": [p.id for p in sorted(posts, key=lambda p: p.posted_at) if p.kind == "preview"],
    }


def post_summary(p: PowerRankingPost, author: str | None) -> dict:
    return {
        "id": p.id,
        "season": p.season,
        "week": p.week,
        "posted_at": p.posted_at.isoformat(),
        "title": p.title,
        "author": p.author,
        "is_guest": author is not None and p.author != author,
        "kind": p.kind,
        "format": p.format,
        "has_image": p.image is not None,
        "has_entries": bool(p.entries),
        "note": p.note,
    }
