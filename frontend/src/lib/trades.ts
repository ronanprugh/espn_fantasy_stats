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
 * two teams within a week of each other can't be told apart and show as one.
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

/** Trades one owner was part of. */
export function tradesFor(trades: readonly Trade[], ownerId: string): Trade[] {
  return trades.filter((t) => t.sides.some((s) => s.owner_id === ownerId))
}

/** A trade seen from one owner's side: what they gave and got, and how it
 * went for them. `net` is their WAR less what the other sides' WAR came to. */
export type TradeFor = {
  trade: Trade
  side: Trade['sides'][number]
  others: Trade['sides'][number][]
  net: number
  result: 'won' | 'lost' | 'even'
}

export function tradeFor(trade: Trade, ownerId: string): TradeFor | null {
  const side = trade.sides.find((s) => s.owner_id === ownerId)
  if (!side) return null
  const others = trade.sides.filter((s) => s !== side)
  const net = side.war - others.reduce((n, s) => n + s.war, 0)
  const result = trade.winner_team_id === null ? 'even' : trade.winner_team_id === side.team_id ? 'won' : 'lost'
  return { trade, side, others, net, result }
}

export type TeamTradeSummary = {
  record: TraderRecord
  /** Their best and worst trade by net WAR; worst is null with one trade. */
  best: TradeFor | null
  worst: TradeFor | null
}

/** One owner's trading: their record, and their best and worst trades. */
export function teamTradeSummary(trades: readonly Trade[], ownerId: string): TeamTradeSummary | null {
  const theirs = tradesFor(trades, ownerId)
  const record = traderRecords(theirs).find((r) => r.ownerId === ownerId)
  if (!record) return null
  const seen = theirs.map((t) => tradeFor(t, ownerId)!).sort((a, b) => b.net - a.net || a.trade.date - b.trade.date)
  return { record, best: seen[0] ?? null, worst: seen.length > 1 ? seen[seen.length - 1] : null }
}

export type PartnerRecord = { ownerId: string; name: string; trades: number; won: number; lost: number; netWar: number }

/**
 * One owner's trades by partner: how often they dealt with each other owner,
 * how those trades went for them, and their WAR less the partner's across
 * them. A three-team trade counts once with each partner. Most trades first.
 */
export function partnerRecords(trades: readonly Trade[], ownerId: string): PartnerRecord[] {
  const by = new Map<string, PartnerRecord>()
  for (const t of trades) {
    const seen = tradeFor(t, ownerId)
    if (!seen) continue
    for (const o of seen.others) {
      const r = by.get(o.owner_id) ?? { ownerId: o.owner_id, name: o.team_name, trades: 0, won: 0, lost: 0, netWar: 0 }
      r.trades += 1
      if (seen.result === 'won') r.won += 1
      if (seen.result === 'lost') r.lost += 1
      r.netWar += seen.side.war - o.war
      r.name = o.team_name
      by.set(o.owner_id, r)
    }
  }
  return [...by.values()].sort((a, b) => b.trades - a.trades || b.netWar - a.netWar || a.name.localeCompare(b.name))
}

/** Items grouped by season, newest season first, each newest first. */
export function bySeason<T extends { year: number; date: number }>(items: readonly T[]): { year: number; items: T[] }[] {
  const groups = new Map<number, T[]>()
  for (const it of items) groups.set(it.year, [...(groups.get(it.year) ?? []), it])
  return [...groups.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, its]) => ({ year, items: its.sort((a, b) => b.date - a.date) }))
}
