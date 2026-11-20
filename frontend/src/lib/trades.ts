import type { Move, MoveKind, Trade } from '../api'

/** The first season ESPN keeps trades for. */
export const FIRST_TRADE_YEAR = 2019

export type TraderRecord = {
  ownerId: string
  name: string
  trades: number
  won: number
  lost: number
  /** WAR gained minus given up across their trades: what their new players
   * added for them, less what the players they sent added for the other side. */
  netWar: number
  /** Points per game their trades added on average: as they played since
   * each trade, less had they kept the players they sent. Null until a trade
   * has a game since. */
  ppgGain: number | null
}

/** Each owner's trades: how many, won/lost, net WAR and points per game. */
export function traderRecords(trades: readonly Trade[]): TraderRecord[] {
  const by = new Map<string, TraderRecord>()
  const gains = new Map<string, number[]>()
  for (const t of trades) {
    for (const side of t.sides) {
      const r = by.get(side.owner_id) ?? {
        ownerId: side.owner_id,
        name: side.team_name,
        trades: 0,
        won: 0,
        lost: 0,
        netWar: 0,
        ppgGain: null,
      }
      r.trades += 1
      r.name = side.team_name
      if (t.winner_team_id !== null) {
        if (t.winner_team_id === side.team_id) r.won += 1
        else r.lost += 1
      }
      const others = t.sides.filter((s) => s !== side).reduce((n, s) => n + s.war, 0)
      r.netWar += side.war - others
      if (side.ppg !== null && side.ppg_if_kept !== null) {
        const g = gains.get(side.owner_id) ?? []
        g.push(side.ppg - side.ppg_if_kept)
        gains.set(side.owner_id, g)
      }
      by.set(side.owner_id, r)
    }
  }
  for (const [owner, g] of gains) by.get(owner)!.ppgGain = g.reduce((n, x) => n + x, 0) / g.length
  return [...by.values()].sort((a, b) => b.trades - a.trades || b.netWar - a.netWar || a.name.localeCompare(b.name))
}

/** The most one-sided trade, by WAR margin. */
export function biggestWin(trades: readonly Trade[]): Trade | null {
  return trades.reduce<Trade | null>(
    (best, t) => (t.winner_team_id !== null && (!best || t.margin > best.margin) ? t : best),
    null,
  )
}

/**
 * Where each received player went next, when his new team traded him on
 * within the season: `"${tradeUid}:${teamId}:${playerId}"` → the team he was
 * traded to. A player traded twice in a week never plays for the team in the
 * middle, so his line in the first trade says where he went instead of
 * showing a bare 0 points.
 */
export function tradedOn(trades: readonly Trade[]): Map<string, string> {
  const out = new Map<string, string>()
  const byDate = [...trades].sort((a, b) => a.date - b.date)
  byDate.forEach((t, i) => {
    for (const side of t.sides) {
      for (const p of side.received) {
        const next = byDate.slice(i + 1).find(
          (u) => u.year === t.year && u.sides.some((s) => s.team_id === side.team_id && s.sent.some((x) => x.player_id === p.player_id)),
        )
        const to = next?.sides.find((s) => s.team_id !== side.team_id && s.received.some((x) => x.player_id === p.player_id))
        if (to) out.set(`${t.uid}:${side.team_id}:${p.player_id}`, to.team_name)
      }
    }
  })
  return out
}

export type Shortfall = { year: number; espn: number; shown: number }

/**
 * Seasons where ESPN counts more trades than are shown. Past seasons'
 * trades are rebuilt from weekly rosters, where two trades between the same
 * two teams in the same week can't be told apart and show as one.
 */
export function tradeShortfall(trades: readonly Trade[], espnCounts: Record<string, number>): Shortfall[] {
  return Object.entries(espnCounts)
    .map(([year, espn]) => ({ year: Number(year), espn, shown: trades.filter((t) => t.year === Number(year)).length }))
    .filter((s) => s.espn > s.shown)
    .sort((a, b) => a.year - b.year)
}

/** A moment's calendar day in Eastern time, where the league's day turns. */
export function easternDay(ms: number): string {
  return new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
}

export type BusiestDay = { day: string; count: number }
export type OwnerDay = BusiestDay & { ownerId: string; name: string }

/** The most of something done in one day: by one owner, and league-wide.
 * `owners` gives each item's owners with the team name to show. */
function busiest<T>(
  items: readonly T[],
  date: (t: T) => number,
  owners: (t: T) => { ownerId: string; name: string }[],
): { ownerDay: OwnerDay | null; leagueDay: BusiestDay | null } {
  const perDay = new Map<string, number>()
  const perOwnerDay = new Map<string, OwnerDay>()
  for (const t of items) {
    const day = easternDay(date(t))
    perDay.set(day, (perDay.get(day) ?? 0) + 1)
    for (const o of owners(t)) {
      const key = `${o.ownerId}|${day}`
      const cur = perOwnerDay.get(key) ?? { ownerId: o.ownerId, name: o.name, day, count: 0 }
      cur.count += 1
      cur.name = o.name
      perOwnerDay.set(key, cur)
    }
  }
  // Ties go to the earliest day, so the record is the first time it was set.
  const top = <D extends BusiestDay>(ds: D[]) =>
    ds.reduce<D | null>((b, d) => (!b || d.count > b.count || (d.count === b.count && d.day < b.day) ? d : b), null)
  return {
    ownerDay: top([...perOwnerDay.values()]),
    leagueDay: top([...perDay.entries()].map(([day, count]) => ({ day, count }))),
  }
}

/** Most trades by one owner in a single day, and the league's busiest trading day. */
export function tradeDays(trades: readonly Trade[]) {
  return busiest(trades, (t) => t.date, (t) => t.sides.map((s) => ({ ownerId: s.owner_id, name: s.team_name })))
}

/** The same, for one kind of move (waiver claims, pickups, drops). */
export function moveDays(moves: readonly Move[]) {
  return busiest(moves, (m) => m.date, (m) => [{ ownerId: m.owner_id, name: m.team_name }])
}

export type MoveRecord = { ownerId: string; name: string; count: number; players: number; spent: number }

/** Each owner's moves of one kind: how many, players added or dropped, and
 * waiver budget spent. Most moves first. */
export function moveRecords(moves: readonly Move[], kind: MoveKind): MoveRecord[] {
  const by = new Map<string, MoveRecord>()
  for (const m of moves) {
    if (m.kind !== kind) continue
    const r = by.get(m.owner_id) ?? { ownerId: m.owner_id, name: m.team_name, count: 0, players: 0, spent: 0 }
    r.count += 1
    r.players += kind === 'drop' ? m.dropped.length : m.added.length
    r.spent += m.bid
    r.name = m.team_name
    by.set(m.owner_id, r)
  }
  return [...by.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}
