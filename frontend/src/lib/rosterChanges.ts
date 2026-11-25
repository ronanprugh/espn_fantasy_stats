import type { Move, RosterPlayer, Trade } from '../api'

/** How a player came onto the team after the season's first week. */
export type Arrival =
  | { how: 'trade'; week: number; from: string }
  | { how: 'waiver' | 'free_agent'; week: number; bid: number }
  /** On the roster by the end with no move found for him. */
  | { how: 'unknown' }

/** How a player on the first week's roster left it. */
export type Departure =
  | { how: 'trade'; week: number; to: string }
  | { how: 'dropped'; week: number }
  | { how: 'unknown' }

export type StartPlayer = RosterPlayer & { kept: boolean; departure: Departure | null }
export type EndPlayer = RosterPlayer & { kept: boolean; arrival: Arrival | null }

export type RosterChanges = {
  start: StartPlayer[]
  end: EndPlayer[]
  /** On both rosters. */
  kept: number
  /** On the end roster only. */
  added: number
  /** On the start roster only. */
  gone: number
}

/** Positions in roster order; anything else after them. */
const POSITION_ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'D/ST']
const positionRank = (p: string) => {
  const i = POSITION_ORDER.indexOf(p)
  return i === -1 ? POSITION_ORDER.length : i
}
const byPosition = (a: RosterPlayer, b: RosterPlayer) =>
  positionRank(a.position) - positionRank(b.position) || a.name.localeCompare(b.name)

type Event<T> = { date: number; what: T }

/** The latest of the events, or null. */
const latest = <T>(events: Event<T>[]): T | null =>
  events.reduce<Event<T> | null>((best, e) => (!best || e.date > best.date ? e : best), null)?.what ?? null

/**
 * A team's roster at the start of a season against its roster at the end:
 * who stayed, who left and how (traded away or dropped), and who joined and
 * how (by trade, waiver claim or free-agent pickup), from the season's
 * trades and moves. A player who left and came back counts as kept; where
 * he moved more than once, his latest move is the one given.
 */
export function rosterChanges(
  start: readonly RosterPlayer[],
  end: readonly RosterPlayer[],
  ownerId: string,
  trades: readonly Trade[],
  moves: readonly Move[],
): RosterChanges {
  const startIds = new Set(start.map((p) => p.player_id))
  const endIds = new Set(end.map((p) => p.player_id))
  const theirMoves = moves.filter((m) => m.owner_id === ownerId)
  const theirTrades = trades
    .map((t) => ({ t, side: t.sides.find((s) => s.owner_id === ownerId) }))
    .filter((x): x is { t: Trade; side: Trade['sides'][number] } => !!x.side)

  const departure = (pid: number): Departure => {
    const events: Event<Departure>[] = [
      ...theirTrades
        .filter(({ side }) => side.sent.some((p) => p.player_id === pid))
        .map(({ t, side }) => {
          const to = t.sides.find((s) => s !== side && s.received.some((p) => p.player_id === pid))
          return { date: t.date, what: { how: 'trade' as const, week: t.week, to: to?.team_name ?? 'another team' } }
        }),
      ...theirMoves
        .filter((m) => m.dropped.some((p) => p.player_id === pid))
        .map((m) => ({ date: m.date, what: { how: 'dropped' as const, week: m.week } })),
    ]
    return latest(events) ?? { how: 'unknown' }
  }

  const arrival = (pid: number): Arrival => {
    const events: Event<Arrival>[] = [
      ...theirTrades
        .filter(({ side }) => side.received.some((p) => p.player_id === pid))
        .map(({ t, side }) => {
          const from = t.sides.find((s) => s !== side && s.sent.some((p) => p.player_id === pid))
          return { date: t.date, what: { how: 'trade' as const, week: t.week, from: from?.team_name ?? 'another team' } }
        }),
      ...theirMoves
        .filter((m) => m.kind !== 'drop' && m.added.some((p) => p.player_id === pid))
        .map((m) => ({ date: m.date, what: { how: m.kind as 'waiver' | 'free_agent', week: m.week, bid: m.bid } })),
    ]
    return latest(events) ?? { how: 'unknown' }
  }

  const startOut = start
    .map((p) => {
      const kept = endIds.has(p.player_id)
      return { ...p, kept, departure: kept ? null : departure(p.player_id) }
    })
    .sort(byPosition)
  const endOut = end
    .map((p) => {
      const kept = startIds.has(p.player_id)
      return { ...p, kept, arrival: kept ? null : arrival(p.player_id) }
    })
    .sort(byPosition)
  const kept = startOut.filter((p) => p.kept).length
  return { start: startOut, end: endOut, kept, added: endOut.length - kept, gone: startOut.length - kept }
}
