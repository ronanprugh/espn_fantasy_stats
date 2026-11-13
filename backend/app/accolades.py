"""Team Hub's trophy cabinet: an owner's podium and last-place finishes."""

from collections.abc import Iterable


def season_over(season: dict) -> bool:
    """A season's playoffs are done once ESPN gives every team a final
    standing; the same rule as the frontend's isInProgress."""
    return all(t["final_standing"] for t in season["teams"])


def accolades(seasons: Iterable[tuple[int, dict, dict]]) -> dict:
    """Finishes across an owner's seasons, from (year, owner's team, season
    teams payload).

    Only finished seasons count. While a season is in progress the team has
    no final standing, and its current standing (first place in week 10, say)
    is not a championship.
    """
    places: dict[int, list[int]] = {1: [], 2: [], 3: []}
    last: list[int] = []
    for year, team, season in sorted(seasons, key=lambda s: s[0]):
        if not season_over(season):
            continue
        finish = team["final_standing"]
        if finish in places:
            places[finish].append(year)
        # Last place in that season's league, which can change size.
        if finish == len(season["teams"]):
            last.append(year)
    return {
        "championships": len(places[1]),
        "runner_ups": len(places[2]),
        "third_places": len(places[3]),
        "last_places": len(last),
        "championship_years": places[1],
        "runner_up_years": places[2],
        "third_place_years": places[3],
        "last_place_years": last,
    }
