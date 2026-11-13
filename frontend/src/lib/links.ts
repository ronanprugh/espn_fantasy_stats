/**
 * Links between pages, built in one place so every page agrees on the query
 * parameters each page reads.
 */

export type TeamHubTab = 'summary' | 'roster' | 'schedule' | 'power'

/** A team's Team Hub, on a season when the context is a single season. */
export function teamHubHref(ownerId: string, opts: { year?: number | null; tab?: TeamHubTab } = {}): string {
  const params = new URLSearchParams({ team: ownerId })
  if (opts.year != null) params.set('year', String(opts.year))
  if (opts.tab && opts.tab !== 'summary') params.set('tab', opts.tab)
  return `/team_hub?${params}`
}

/** Head to Head between two owners, `a` on the left. */
export function headToHeadHref(ownerA: string, ownerB: string): string {
  return `/h2h?${new URLSearchParams({ a: ownerA, b: ownerB })}`
}

/** The first season ESPN serves box scores for. */
export const FIRST_BOX_SCORE_YEAR = 2019

/** A game's Box Score, `teamA` on the left. */
export function boxScoreHref(year: number, week: number, teamA: number, teamB: number): string {
  return `/box_score/${year}/${week}/${teamA}/${teamB}`
}

/** Why a game has no box score, for a hover title, or null when it has one. */
export function noBoxScoreReason(
  year: number,
  game: { isBye?: boolean; unplayed?: boolean; opponent?: number | null } = {},
): string | null {
  if (game.isBye) return 'Bye week: no game to show'
  if (year < FIRST_BOX_SCORE_YEAR) return `Box scores start in ${FIRST_BOX_SCORE_YEAR}`
  if (game.opponent === null) return 'No opponent this week'
  if (game.unplayed) return 'Not played yet'
  return null
}
