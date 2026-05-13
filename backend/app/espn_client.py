from espn_api.football import League

from .config import ESPN_S2, SWID

_leagues: dict[tuple[int, int], League] = {}


def get_league(league_id: int, year: int) -> League:
    key = (league_id, year)
    if key not in _leagues:
        _leagues[key] = League(
            league_id=league_id,
            year=year,
            espn_s2=ESPN_S2,
            swid=SWID,
        )
    return _leagues[key]


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
            if team["team_name"] not in row["team_names"]:
                row["team_names"].append(team["team_name"])
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
