import type { Trade } from '../api'

/** The first season ESPN keeps trades for. */
export const FIRST_TRADE_YEAR = 2019

export type TraderRecord = {
  ownerId: string
  name: string
  trades: number
  won: number
  lost: number
  /** Starting points gained minus given up across their trades: what their
   * new players scored for them, less what the players they sent scored for
   * the other side. */
  net: number
}

/** Each owner's trades in a season: how many, won/lost, and the net points. */
export function traderRecords(trades: readonly Trade[]): TraderRecord[] {
  const by = new Map<string, TraderRecord>()
  for (const t of trades) {
    for (const side of t.sides) {
      const r = by.get(side.owner_id) ?? {
        ownerId: side.owner_id,
        name: side.team_name,
        trades: 0,
        won: 0,
        lost: 0,
        net: 0,
      }
      r.trades += 1
      r.name = side.team_name
      if (t.winner_team_id !== null) {
        if (t.winner_team_id === side.team_id) r.won += 1
        else r.lost += 1
      }
      const others = t.sides.filter((s) => s !== side).reduce((n, s) => n + s.started_points, 0)
      r.net += side.started_points - others
      by.set(side.owner_id, r)
    }
  }
  return [...by.values()].sort((a, b) => b.trades - a.trades || b.net - a.net || a.name.localeCompare(b.name))
}

/** The season's most one-sided trade, by margin. */
export function biggestWin(trades: readonly Trade[]): Trade | null {
  return trades.reduce<Trade | null>(
    (best, t) => (t.winner_team_id !== null && (!best || t.margin > best.margin) ? t : best),
    null,
  )
}
