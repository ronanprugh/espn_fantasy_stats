import type { HeadToHeadStats, Rivalry } from '../api'
import type { OwnerPrStats } from './powerRankings'

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

/** One line of the Head to Head summary: each owner's figure, and whose is
 * better where that means anything. */
export type SummaryRow = {
  label: string
  a: string | number
  b: string | number
  highlight?: 'a' | 'b' | null
}

/** The Head to Head summary's lines, from owner A's side and owner B's; the
 * power rankings lines only when both owners have been ranked. */
export function summaryRows(data: HeadToHeadStats, pr?: Map<string, OwnerPrStats>): SummaryRow[] {
  const pa = pr?.get(data.owner_a_id)
  const pb = pr?.get(data.owner_b_id)
  const prRows: SummaryRow[] =
    pa?.avgRank != null && pb?.avgRank != null
      ? [
          {
            label: 'Avg Power Rank',
            a: pa.avgRank.toFixed(2),
            b: pb.avgRank.toFixed(2),
            highlight: pa.avgRank < pb.avgRank ? 'a' : pb.avgRank < pa.avgRank ? 'b' : null,
          },
          {
            label: 'Weeks at #1',
            a: pa.weeksAt1,
            b: pb.weeksAt1,
            highlight: pa.weeksAt1 > pb.weeksAt1 ? 'a' : pb.weeksAt1 > pa.weeksAt1 ? 'b' : null,
          },
        ]
      : []
  return [
    {
      label: 'All-time record',
      a: `${data.owner_a_wins}-${data.owner_b_wins}${data.ties ? `-${data.ties}` : ''}`,
      b: `${data.owner_b_wins}-${data.owner_a_wins}${data.ties ? `-${data.ties}` : ''}`,
      highlight: data.owner_a_wins > data.owner_b_wins ? 'a' : data.owner_b_wins > data.owner_a_wins ? 'b' : null,
    },
    {
      label: 'Total matchups',
      a: data.total_matchups,
      b: data.total_matchups,
    },
    {
      label: 'Avg Points For',
      a: data.owner_a_avg_pf.toFixed(2),
      b: data.owner_b_avg_pf.toFixed(2),
      highlight: data.owner_a_avg_pf > data.owner_b_avg_pf ? 'a' : data.owner_b_avg_pf > data.owner_a_avg_pf ? 'b' : null,
    },
    {
      label: 'Total Points For',
      a: data.owner_a_total_pf.toFixed(1),
      b: data.owner_b_total_pf.toFixed(1),
    },
    {
      label: 'Avg Points Against',
      a: data.owner_b_avg_pf.toFixed(2),
      b: data.owner_a_avg_pf.toFixed(2),
    },
    {
      label: 'Playoff matchups',
      a: data.playoff_matchups,
      b: data.playoff_matchups,
    },
    {
      label: 'Playoff wins',
      a: data.owner_a_playoff_wins,
      b: data.owner_b_playoff_wins,
      highlight:
        data.owner_a_playoff_wins > data.owner_b_playoff_wins
          ? 'a'
          : data.owner_b_playoff_wins > data.owner_a_playoff_wins
          ? 'b'
          : null,
    },
    {
      label: 'Playoff losses',
      a: data.owner_b_playoff_wins,
      b: data.owner_a_playoff_wins,
    },
    ...prRows,
  ]
}
