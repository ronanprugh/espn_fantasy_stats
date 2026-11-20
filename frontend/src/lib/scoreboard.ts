import type { ScoreboardMatchup } from '../api'

/** A future week: no points on either side and no result. */
export function isUnplayed(m: ScoreboardMatchup): boolean {
  return m.team_a_score === 0 && m.team_b_score === 0 && m.winner_id === null
}

/** A game that has started but has no result yet: points on the board and no
 * winner. ESPN sets the winner once the week closes, so until then every game
 * of the week in progress reads as live. (A tie also has no winner, but its
 * scores are equal.) */
export function isLive(m: ScoreboardMatchup): boolean {
  return !m.is_bye && !isUnplayed(m) && m.winner_id === null && m.team_a_score !== m.team_b_score
}

/**
 * The teams with the week's highest and lowest score, for the Top score and
 * Low score badges. Counts only finished games: not byes (a bye has no
 * opponent and often no score), not unplayed games, and not games still being
 * played, whose partial scores would otherwise be the week's "low score".
 * Ties badge every tied team. A week with nothing finished, or with only one
 * team, has no badges.
 */
export function weekExtremes(matchups: readonly ScoreboardMatchup[]): { top: Set<number>; low: Set<number> } {
  const scores: [number, number][] = []
  for (const m of matchups) {
    if (m.is_bye || isUnplayed(m) || isLive(m)) continue
    scores.push([m.team_a_id, m.team_a_score], [m.team_b_id, m.team_b_score])
  }
  if (scores.length < 2) return { top: new Set(), low: new Set() }
  const max = Math.max(...scores.map(([, s]) => s))
  const min = Math.min(...scores.map(([, s]) => s))
  if (max === min) return { top: new Set(), low: new Set() }
  return {
    top: new Set(scores.filter(([, s]) => s === max).map(([t]) => t)),
    low: new Set(scores.filter(([, s]) => s === min).map(([t]) => t)),
  }
}
