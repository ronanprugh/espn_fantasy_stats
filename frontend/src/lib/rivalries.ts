import type { Rivalry } from '../api'

/** Win rate with ties as half a win; null with no meetings. */
export function winRate(r: Pick<Rivalry, 'wins' | 'losses' | 'ties' | 'meetings'>): number | null {
  return r.meetings ? (r.wins + r.ties / 2) / r.meetings : null
}

/** The fewest meetings for Best record and Toughest to mean anything: a 1–0
 * record isn't a rivalry. Relaxed to 1 when nobody has played that often. */
const MIN_MEETINGS = 3

/**
 * The callouts above the rivalries table: the opponent you've done best and
 * worst against, and the one you've played most. Ties on win rate go to the
 * opponent with more meetings. Null where there's nothing to say.
 */
export function rivalryCallouts(opponents: readonly Rivalry[]): {
  best: Rivalry | null
  toughest: Rivalry | null
  mostPlayed: Rivalry | null
} {
  const played = opponents.filter((o) => o.meetings > 0)
  if (played.length === 0) return { best: null, toughest: null, mostPlayed: null }
  const enough = played.filter((o) => o.meetings >= MIN_MEETINGS)
  const pool = enough.length ? enough : played
  const byRate = [...pool].sort((a, b) => winRate(b)! - winRate(a)! || b.meetings - a.meetings)
  const toughest = [...pool].sort((a, b) => winRate(a)! - winRate(b)! || b.meetings - a.meetings)[0]
  const mostPlayed = [...played].sort((a, b) => b.meetings - a.meetings)[0]
  return {
    best: byRate[0],
    // With a single opponent, "best" and "toughest" are the same person.
    toughest: toughest === byRate[0] && pool.length === 1 ? null : toughest,
    mostPlayed,
  }
}
