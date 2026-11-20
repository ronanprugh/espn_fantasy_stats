import type { SeasonTeams, TeamHubGame, TeamHubPlayer } from '../api'
import { formatDashRecord, isInProgress } from './seasonStats'

/** 1 → "1st", 2 → "2nd", 11 → "11th", 22 → "22nd". */
export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

/** The current run of the same result, from the latest played game back:
 * "W3", "L1", "T1". Byes and unplayed weeks don't count. Null before the
 * first game. */
export function currentStreak(
  schedule: readonly Pick<TeamHubGame, 'week' | 'is_bye' | 'result'>[],
): string | null {
  const played = [...schedule]
    .sort((a, b) => a.week - b.week)
    .filter((g) => !g.is_bye && (g.result === 'W' || g.result === 'L' || g.result === 'T'))
  const last = played[played.length - 1]
  if (!last) return null
  let n = 0
  for (let i = played.length - 1; i >= 0 && played[i].result === last.result; i--) n++
  return `${last.result}${n}`
}

export type HubHeadline = {
  /** Regular-season W–L(–T). */
  record: string
  /** "10th · in progress" or "Finished 2nd". A season in progress never says
   * "Finished" (or "Final"): its standing can still change. */
  standing: string
  inProgress: boolean
  /** "3rd in PF": regular-season points scored, ranked in the league. */
  pfRank: string | null
  streak: string | null
}

/**
 * Team Hub's line under the team name, for the selected season: record and
 * standing first, then PF rank and the current streak.
 */
export function hubHeadline(season: SeasonTeams, teamId: number, schedule: readonly TeamHubGame[]): HubHeadline | null {
  const team = season.teams.find((t) => t.team_id === teamId)
  if (!team) return null
  const inProgress = isInProgress(season)
  const place = inProgress ? team.standing : team.final_standing || team.standing
  const byPf = [...season.teams].sort((a, b) => b.points_for - a.points_for)
  const pfPlace = byPf.findIndex((t) => t.team_id === teamId) + 1
  const played = team.wins + team.losses + team.ties > 0
  return {
    record: formatDashRecord(team.wins, team.losses, team.ties),
    standing: inProgress ? `${ordinal(place)} · in progress` : `Finished ${ordinal(place)}`,
    inProgress,
    pfRank: played && pfPlace > 0 ? `${ordinal(pfPlace)} in PF` : null,
    streak: currentStreak(schedule),
  }
}

/** Lineup slots in the order a lineup lists them. */
export const STARTER_ORDER = ['QB', 'RB', 'WR', 'TE', 'RB/WR/TE', 'WR/TE', 'OP', 'FLEX', 'K', 'D/ST']

/** Whether a lineup slot is a starting one (not bench, IR or empty). */
export function isStarter(slot: string): boolean {
  return slot !== 'BE' && slot !== 'IR' && slot !== ''
}

/** Where a slot sits in STARTER_ORDER; unknown slots last. */
export function slotRank(slot: string): number {
  const i = STARTER_ORDER.indexOf(slot)
  return i === -1 ? STARTER_ORDER.length : i
}

/** A roster as Team Hub lists it: starters in lineup order, then the bench
 * (by points, most first), then IR. */
export function sortRoster(roster: TeamHubPlayer[]): TeamHubPlayer[] {
  return [...roster].sort((a, b) => {
    const aS = isStarter(a.lineup_slot)
    const bS = isStarter(b.lineup_slot)
    if (aS !== bS) return aS ? -1 : 1
    if (aS) return slotRank(a.lineup_slot) - slotRank(b.lineup_slot)
    if (a.lineup_slot !== b.lineup_slot) return a.lineup_slot === 'BE' ? -1 : 1
    return b.total_points - a.total_points
  })
}
