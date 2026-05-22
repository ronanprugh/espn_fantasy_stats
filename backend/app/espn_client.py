from datetime import datetime

from espn_api.football import League

_leagues: dict[tuple[int, int], League] = {}
_years_cache: dict[int, list[int]] = {}


def get_league(
    league_id: int,
    year: int,
    espn_s2: str | None = None,
    swid: str | None = None,
) -> League:
    key = (league_id, year)
    if key not in _leagues:
        _leagues[key] = League(
            league_id=league_id,
            year=year,
            espn_s2=espn_s2,
            swid=swid,
        )
    return _leagues[key]


def discover_years(
    league_id: int,
    espn_s2: str | None = None,
    swid: str | None = None,
    probe_window: int = 5,
) -> list[int]:
    """Return the sorted list of seasons this league has actually played.

    Probes backwards from the current calendar year to find a working
    season, reads `previousSeasons` from that fetch, and includes the
    probed year only if it has real game data (some seasons exist on
    ESPN before any games are played).
    """
    if league_id in _years_cache:
        return _years_cache[league_id]

    current = datetime.now().year
    last_err: Exception | None = None
    for candidate in range(current, current - probe_window, -1):
        try:
            lg = get_league(league_id, candidate, espn_s2=espn_s2, swid=swid)
        except Exception as e:
            last_err = e
            continue

        years = set(lg.previousSeasons)
        has_games = any((t.wins + t.losses + t.ties) > 0 for t in lg.teams)
        if has_games:
            years.add(candidate)

        if years:
            result = sorted(years)
            _years_cache[league_id] = result
            return result

    raise RuntimeError(
        f"Could not discover any seasons for league {league_id} in the last "
        f"{probe_window} years: {last_err}"
    )


def get_scoring_type(league: League) -> str:
    """Return 'ppr', 'half_ppr', or 'standard' based on reception points."""
    rec_item = next(
        (x for x in league.settings.scoring_format if x.get("id") == 53), None
    )
    if rec_item is None:
        return "standard"
    pts = rec_item.get("points", 0)
    if pts >= 1.0:
        return "ppr"
    if pts >= 0.5:
        return "half_ppr"
    return "standard"


def _playoff_record(team, reg_season_count: int, playoff_team_count: int) -> tuple[int, int]:
    """Single-elimination playoff record. Stops counting after first loss."""
    if team.standing > playoff_team_count:
        return (0, 0)
    wins = losses = 0
    for week_num, outcome in enumerate(team.outcomes):
        if week_num + 1 <= reg_season_count:
            continue
        if outcome == "W":
            wins += 1
        elif outcome == "L":
            losses += 1
            break
    return (wins, losses)


def aggregate_by_owner(seasons: list[dict]) -> list[dict]:
    """Combine per-season team payloads into per-owner totals.

    Keys on the primary owner's ID (stable across seasons), so an owner
    who renames their team still aggregates correctly.
    """
    agg: dict[str, dict] = {}
    for season in seasons:
        for team in season["teams"]:
            if not team["owners"]:
                continue
            owner = team["owners"][0]
            oid = owner["id"]
            if oid not in agg:
                agg[oid] = {
                    "owner_id": oid,
                    "owner_name": f"{owner['first_name']} {owner['last_name']}".strip(),
                    "team_names": [],
                    "_finishes": [],
                    "seasons_played": 0,
                    "wins": 0,
                    "losses": 0,
                    "ties": 0,
                    "playoff_wins": 0,
                    "playoff_losses": 0,
                    "points_for": 0.0,
                    "points_against": 0.0,
                }
            row = agg[oid]
            row["owner_name"] = f"{owner['first_name']} {owner['last_name']}".strip()
            name = team["team_name"]
            if name in row["team_names"]:
                row["team_names"].remove(name)
            row["team_names"].append(name)
            row["seasons_played"] += 1
            row["wins"] += team["wins"]
            row["losses"] += team["losses"]
            row["ties"] += team["ties"]
            row["playoff_wins"] += team["playoff_wins"]
            row["playoff_losses"] += team["playoff_losses"]
            row["points_for"] += team["points_for"]
            row["points_against"] += team["points_against"]
            finish = team["final_standing"] or team["standing"]
            if finish:
                row["_finishes"].append(finish)

    result = []
    for row in agg.values():
        games = row["wins"] + row["losses"] + row["ties"]
        avg_pf = row["points_for"] / games if games else 0.0
        avg_pa = row["points_against"] / games if games else 0.0
        finishes = row.pop("_finishes")
        row["team_names"].reverse()  # most-recent first
        result.append({
            **row,
            "points_for": round(row["points_for"], 2),
            "points_against": round(row["points_against"], 2),
            "avg_points_for": round(avg_pf, 2),
            "avg_points_against": round(avg_pa, 2),
            "avg_plus_minus": round(avg_pf - avg_pa, 2),
            "avg_finish": round(sum(finishes) / len(finishes), 2) if finishes else 0.0,
        })
    result.sort(key=lambda r: r["avg_finish"] or 999)
    return result


def build_owner_history(seasons: list[dict]) -> list[dict]:
    """Rearrange per-season team payloads into per-owner records.

    Each owner has a list of seasons in chronological order. owner_name and
    current_team_name reflect the owner's most recent season (since the
    incoming `seasons` list is ordered oldest → newest).
    """
    by_owner: dict[str, dict] = {}
    for season in seasons:
        for team in season["teams"]:
            if not team["owners"]:
                continue
            owner = team["owners"][0]
            oid = owner["id"]
            if oid not in by_owner:
                by_owner[oid] = {
                    "owner_id": oid,
                    "owner_name": "",
                    "current_team_name": "",
                    "seasons": [],
                }
            row = by_owner[oid]
            row["owner_name"] = f"{owner['first_name']} {owner['last_name']}".strip()
            row["current_team_name"] = team["team_name"]
            row["seasons"].append({
                "year": season["year"],
                "team_name": team["team_name"],
                "seed": team["standing"],
                "final_standing": team["final_standing"] or team["standing"],
                "wins": team["wins"],
                "losses": team["losses"],
                "ties": team["ties"],
                "playoff_wins": team["playoff_wins"],
                "playoff_losses": team["playoff_losses"],
                "points_for": team["points_for"],
                "points_against": team["points_against"],
                "avg_points_for": team["avg_points_for"],
                "avg_points_against": team["avg_points_against"],
                "avg_plus_minus": team["avg_plus_minus"],
            })
    for row in by_owner.values():
        row["seasons"].sort(key=lambda s: s["year"])
    return sorted(by_owner.values(), key=lambda r: r["owner_name"].lower())


def _playoff_round_label(week: int, playoff_weeks: list[int]) -> str:
    """Position in the championship bracket — assumes last week is the final."""
    idx_from_end = len(playoff_weeks) - 1 - playoff_weeks.index(week)
    if idx_from_end == 0:
        return "championship"
    if idx_from_end == 1:
        return "semifinal"
    return "playoff"


def _build_alive_status(league: League) -> tuple[dict[int, dict[int, str]], list[int]]:
    """Map team_id → week → 'alive' or 'eliminated' (status ENTERING the week)."""
    s = league.settings
    reg_season = s.reg_season_count
    playoff_team_count = s.playoff_team_count

    playoff_weeks: set[int] = set()
    status: dict[int, dict[int, str]] = {}
    for t in league.teams:
        made_playoffs = t.standing <= playoff_team_count
        alive = made_playoffs
        per_week: dict[int, str] = {}
        for week_idx in range(reg_season, len(t.outcomes)):
            week = week_idx + 1
            playoff_weeks.add(week)
            per_week[week] = "alive" if alive else "eliminated"
            outcome = t.outcomes[week_idx]
            if alive and outcome == "L":
                alive = False
        status[t.team_id] = per_week
    return status, sorted(playoff_weeks)


def _matchup_round_label(
    week: int,
    team_a_id: int,
    team_b_id: int,
    reg_season: int,
    status: dict[int, dict[int, str]],
    playoff_weeks: list[int],
) -> str:
    if week <= reg_season:
        return "regular"
    a_alive = status.get(team_a_id, {}).get(week) == "alive"
    b_alive = status.get(team_b_id, {}).get(week) == "alive"
    # For byes (team plays itself), only their own status matters
    if team_a_id == team_b_id:
        return _playoff_round_label(week, playoff_weeks) if a_alive else "consolation"
    if a_alive and b_alive:
        return _playoff_round_label(week, playoff_weeks)
    return "consolation"


def serialize_all_matchups(league: League) -> list[dict]:
    """Return every matchup played in this season, deduped by week+pair."""
    s = league.settings
    reg_season = s.reg_season_count
    teams_by_id = {t.team_id: t for t in league.teams}
    status, playoff_weeks = _build_alive_status(league)
    matchups: list[dict] = []
    seen: set = set()
    for t in league.teams:
        for week_idx, opp in enumerate(t.schedule):
            week = week_idx + 1
            opp_id = opp.team_id if hasattr(opp, "team_id") else opp
            if opp_id == t.team_id:
                continue  # bye
            key = (week, frozenset([t.team_id, opp_id]))
            if key in seen:
                continue
            seen.add(key)
            opp_team = teams_by_id.get(opp_id)
            if not opp_team:
                continue
            outcome = t.outcomes[week_idx]
            if outcome == "W":
                winner_id = t.team_id
            elif outcome == "L":
                winner_id = opp_id
            else:
                winner_id = None
            matchups.append({
                "week": week,
                "is_playoff": week > reg_season,
                "round_label": _matchup_round_label(
                    week, t.team_id, opp_id, reg_season, status, playoff_weeks
                ),
                "team_a_id": t.team_id,
                "team_b_id": opp_id,
                "team_a_score": round(t.scores[week_idx], 2),
                "team_b_score": round(opp_team.scores[week_idx], 2),
                "winner_id": winner_id,
            })
    return matchups


POSITION_BUCKETS: dict[str, str] = {
    "QB": "QB",
    "RB": "RB",
    "WR": "WR",
    "TE": "TE",
    "K": "K",
    "D/ST": "D/ST",
    "RB/WR/TE": "FLEX",
    "WR/TE": "FLEX",
    "OP": "FLEX",
}
POSITIONS_ORDER = ["QB", "RB", "WR", "TE", "FLEX", "K", "D/ST"]


def compute_positional_week_points(
    box_scores_payload: dict,
) -> dict[int, dict[str, float]]:
    """Given the payload from box_scores endpoint, return team_id -> position -> total points.

    A player started in a FLEX slot contributes to BOTH the FLEX bucket AND
    their primary position bucket (so a WR played at FLEX boosts both WR and
    FLEX totals for that team).
    """
    out: dict[int, dict[str, float]] = {}
    for m in box_scores_payload.get("matchups", []):
        for side_key in ("home", "away"):
            side = m.get(side_key)
            if not side:
                continue
            team_id = side["team_id"]
            for p in side.get("lineup", []):
                slot = p.get("slot_position", "")
                bucket = POSITION_BUCKETS.get(slot)
                if not bucket:  # BE, IR, or unknown — skip
                    continue
                pts = float(p.get("points") or 0.0)
                team_buckets = out.setdefault(team_id, {})
                team_buckets[bucket] = team_buckets.get(bucket, 0.0) + pts
                # If the player was in a FLEX-type slot, also credit their
                # primary position (e.g. a WR in the FLEX slot counts toward
                # both FLEX and WR totals).
                if bucket == "FLEX":
                    primary = POSITION_BUCKETS.get(p.get("position", ""))
                    if primary and primary != "FLEX":
                        team_buckets[primary] = team_buckets.get(primary, 0.0) + pts
    return out


def serialize_roster(team) -> list[dict]:
    """Serialize a team's current roster (season-aggregate stats)."""
    out = []
    for p in team.roster or []:
        out.append({
            "name": p.name,
            "player_id": p.playerId,
            "position": p.position or "",
            "lineup_slot": p.lineupSlot or "",
            "pro_team": p.proTeam or "",
            "total_points": round(p.total_points or 0.0, 2),
            "injury_status": (p.injuryStatus or "").upper() if p.injuryStatus else "",
        })
    return out


def serialize_scoreboard(league: League, year: int) -> dict:
    """Return every season matchup with names + scores, ready for display."""
    s = league.settings
    reg_season = s.reg_season_count
    teams_by_id = {t.team_id: t for t in league.teams}
    status, playoff_weeks = _build_alive_status(league)

    def owner_name_of(t) -> str:
        if not t.owners:
            return "—"
        o = t.owners[0]
        return f"{o.get('firstName', '')} {o.get('lastName', '')}".strip() or "—"

    matchups: list[dict] = []
    seen: set = set()
    for t in league.teams:
        for week_idx, opp in enumerate(t.schedule):
            week = week_idx + 1
            opp_id = opp.team_id if hasattr(opp, "team_id") else opp
            is_bye = opp_id == t.team_id
            key = (week, frozenset([t.team_id, opp_id]))
            if key in seen:
                continue
            seen.add(key)

            outcome = t.outcomes[week_idx]
            t_score = round(t.scores[week_idx], 2)
            round_label = _matchup_round_label(
                week, t.team_id, opp_id, reg_season, status, playoff_weeks
            )

            if is_bye:
                matchups.append({
                    "week": week,
                    "is_playoff": week > reg_season,
                    "round_label": round_label,
                    "is_bye": True,
                    "team_a_id": t.team_id,
                    "team_a_name": t.team_name,
                    "team_a_owner": owner_name_of(t),
                    "team_a_score": t_score,
                    "team_b_id": t.team_id,
                    "team_b_name": "",
                    "team_b_owner": "",
                    "team_b_score": 0.0,
                    "winner_id": None,
                })
                continue

            opp_team = teams_by_id.get(opp_id)
            if not opp_team:
                continue
            opp_score = round(opp_team.scores[week_idx], 2)

            if outcome == "W":
                winner_id = t.team_id
            elif outcome == "L":
                winner_id = opp_id
            else:
                winner_id = None

            matchups.append({
                "week": week,
                "is_playoff": week > reg_season,
                "round_label": round_label,
                "is_bye": False,
                "team_a_id": t.team_id,
                "team_a_name": t.team_name,
                "team_a_owner": owner_name_of(t),
                "team_a_score": t_score,
                "team_b_id": opp_id,
                "team_b_name": opp_team.team_name,
                "team_b_owner": owner_name_of(opp_team),
                "team_b_score": opp_score,
                "winner_id": winner_id,
            })

    matchups.sort(key=lambda m: (m["week"], m["team_a_id"]))
    weeks = sorted({m["week"] for m in matchups})
    return {"year": year, "weeks": weeks, "matchups": matchups}


def serialize_box_scores(league: League, week: int) -> list[dict]:
    """Return all box scores for a single week with per-player lineups.

    Caller should ensure year >= 2019 — espn_api raises otherwise.
    """
    box_scores = league.box_scores(week)
    s = league.settings
    reg_season = s.reg_season_count
    is_playoff = week > reg_season

    def serialize_team(team_ref, score, projected, lineup) -> dict | None:
        if team_ref == 0 or not hasattr(team_ref, "team_id"):
            return None  # bye
        owners = team_ref.owners or []
        owner_name = "—"
        if owners:
            o = owners[0]
            owner_name = f"{o.get('firstName', '')} {o.get('lastName', '')}".strip() or "—"
        return {
            "team_id": team_ref.team_id,
            "team_name": team_ref.team_name,
            "owner_name": owner_name,
            "total_points": round(score, 2),
            "projected_points": round(projected, 2),
            "lineup": [
                {
                    "name": p.name,
                    "player_id": p.playerId,
                    "position": p.position or "",
                    "slot_position": p.slot_position or "",
                    "pro_team": p.proTeam or "",
                    "points": round(p.points, 2),
                    "projected_points": round(p.projected_points, 2),
                }
                for p in lineup
            ],
        }

    # Consolation/toilet-bowl matchups (neither team is in the real playoff
    # bracket) are excluded — ESPN data for these games is unreliable and
    # they don't represent meaningful competition.
    playoff_team_ids = {
        t.team_id for t in league.teams if t.standing <= s.playoff_team_count
    } if is_playoff else set()

    result = []
    for bs in box_scores:
        if is_playoff:
            home_id = bs.home_team.team_id if hasattr(bs.home_team, "team_id") else None
            away_id = bs.away_team.team_id if hasattr(bs.away_team, "team_id") else None
            # Skip if neither team made the playoffs (consolation bracket)
            if home_id not in playoff_team_ids and away_id not in playoff_team_ids:
                continue
        result.append({
            "week": week,
            "is_playoff": is_playoff,
            "matchup_type": bs.matchup_type,
            "home": serialize_team(bs.home_team, bs.home_score, bs.home_projected, bs.home_lineup),
            "away": serialize_team(bs.away_team, bs.away_score, bs.away_projected, bs.away_lineup),
        })
    return result


def serialize_playoffs(league: League) -> dict:
    """Return playoff teams + every matchup played in playoff weeks.

    Filters out toilet-bowl games (matchups where neither team made the
    playoffs). Byes are reported as a matchup where team_a_id == team_b_id.
    The frontend builds the bracket tree from this flat list.
    """
    s = league.settings
    playoff_team_ids = {
        t.team_id for t in league.teams if t.standing <= s.playoff_team_count
    }
    teams_by_id = {t.team_id: t for t in league.teams}

    teams = []
    for t in league.teams:
        if t.team_id not in playoff_team_ids:
            continue
        owner = t.owners[0] if t.owners else {}
        owner_name = f"{owner.get('firstName', '')} {owner.get('lastName', '')}".strip()
        teams.append({
            "team_id": t.team_id,
            "team_name": t.team_name,
            "owner_name": owner_name or "—",
            "seed": t.standing,
            "final_standing": t.final_standing,
        })

    matchups: list[dict] = []
    seen: set = set()
    for t in league.teams:
        if t.team_id not in playoff_team_ids:
            continue
        for week_idx in range(s.reg_season_count, len(t.outcomes)):
            week = week_idx + 1
            opp = t.schedule[week_idx]
            opp_id = opp.team_id if hasattr(opp, "team_id") else opp
            is_bye = opp_id == t.team_id

            if not is_bye and opp_id not in playoff_team_ids:
                continue

            key = (week, frozenset([t.team_id, opp_id]))
            if key in seen:
                continue
            seen.add(key)

            if is_bye:
                matchups.append({
                    "week": week,
                    "team_a_id": t.team_id,
                    "team_b_id": t.team_id,
                    "team_a_score": round(t.scores[week_idx], 2),
                    "team_b_score": round(t.scores[week_idx], 2),
                    "is_bye": True,
                    "winner_id": None,
                })
                continue

            opp_team = teams_by_id[opp_id]
            outcome = t.outcomes[week_idx]
            if outcome == "W":
                winner_id = t.team_id
            elif outcome == "L":
                winner_id = opp_id
            else:
                winner_id = None
            matchups.append({
                "week": week,
                "team_a_id": t.team_id,
                "team_b_id": opp_id,
                "team_a_score": round(t.scores[week_idx], 2),
                "team_b_score": round(opp_team.scores[week_idx], 2),
                "is_bye": False,
                "winner_id": winner_id,
            })

    playoff_weeks = sorted({m["week"] for m in matchups})
    return {
        "playoff_team_count": s.playoff_team_count,
        "reg_season_count": s.reg_season_count,
        "playoff_weeks": playoff_weeks,
        "teams": sorted(teams, key=lambda t: t["seed"]),
        "matchups": sorted(matchups, key=lambda m: (m["week"], m["team_a_id"])),
    }


def serialize_teams(league: League) -> list[dict]:
    reg_count = league.settings.reg_season_count
    playoff_count = league.settings.playoff_team_count

    result = []
    for t in league.teams:
        playoff_w, playoff_l = _playoff_record(t, reg_count, playoff_count)
        avg_pf = t.points_for / reg_count if reg_count else 0.0
        avg_pa = t.points_against / reg_count if reg_count else 0.0
        result.append({
            "team_id": t.team_id,
            "team_name": t.team_name,
            "abbrev": t.team_abbrev,
            "owners": [
                {
                    "id": o.get("id", ""),
                    "first_name": o.get("firstName", ""),
                    "last_name": o.get("lastName", ""),
                }
                for o in t.owners
            ],
            "wins": t.wins,
            "losses": t.losses,
            "ties": t.ties,
            "playoff_wins": playoff_w,
            "playoff_losses": playoff_l,
            "points_for": t.points_for,
            "points_against": t.points_against,
            "avg_points_for": round(avg_pf, 2),
            "avg_points_against": round(avg_pa, 2),
            "avg_plus_minus": round(avg_pf - avg_pa, 2),
            "final_standing": t.final_standing,
            "standing": t.standing,
            "scores": list(t.scores),
        })
    return result
