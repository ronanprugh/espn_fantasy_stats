import { describe, expect, it } from 'vitest'
import type { Move, Trade, TradeSide } from '../api'
import { biggestWin, easternDay, moveDays, moveRecords, tradeDays, traderRecords } from './trades'

const side = (id: number, owner: string, war: number, ppg: [number, number] | null = null): TradeSide => ({
  team_id: id, team_name: `Team ${id}`, owner_id: owner, owner_name: owner,
  received: [], sent: [], started_points: war * 100, war,
  ppg: ppg?.[0] ?? null, ppg_if_kept: ppg?.[1] ?? null, games: ppg ? 3 : 0,
})
const trade = (a: TradeSide, b: TradeSide): Trade => {
  const margin = Math.abs(a.war - b.war)
  return {
    year: 2026, uid: `${a.team_id}-${b.team_id}`, date: 0, week: 5, sides: [a, b], margin,
    winner_team_id: margin === 0 ? null : a.war > b.war ? a.team_id : b.team_id,
  }
}

describe('traderRecords', () => {
  it('counts trades, wins and net WAR per owner', () => {
    const trades = [trade(side(1, 'o1', 0.8), side(2, 'o2', 0.5)), trade(side(1, 'o1', 0.1), side(3, 'o3', 0.3))]
    const r = Object.fromEntries(traderRecords(trades).map((x) => [x.ownerId, x]))
    expect(r.o1).toMatchObject({ trades: 2, won: 1, lost: 1 })
    expect(r.o1.netWar).toBeCloseTo(0.1)
    expect(r.o2.netWar).toBeCloseTo(-0.3)
    expect(traderRecords(trades)[0].ownerId).toBe('o1')
  })

  it('averages the points per game each trade added, over trades with games since', () => {
    const trades = [
      trade(side(1, 'o1', 0.2, [110, 104]), side(2, 'o2', 0.1, [100, 101])),
      trade(side(1, 'o1', 0.2, [108, 106]), side(3, 'o3', 0.1)),
    ]
    const r = Object.fromEntries(traderRecords(trades).map((x) => [x.ownerId, x]))
    expect(r.o1.ppgGain).toBeCloseTo(4)
    expect(r.o2.ppgGain).toBeCloseTo(-1)
    expect(r.o3.ppgGain).toBeNull()
  })

  it('leaves a tie as neither won nor lost', () => {
    const [r] = traderRecords([trade(side(1, 'o1', 0), side(2, 'o2', 0))])
    expect(r).toMatchObject({ won: 0, lost: 0 })
  })
})

describe('biggestWin', () => {
  it('is the most lopsided decided trade', () => {
    const a = trade(side(1, 'o1', 0.8), side(2, 'o2', 0.5))
    const b = trade(side(3, 'o3', 0.1), side(4, 'o4', 1.0))
    expect(biggestWin([a, b])).toBe(b)
    expect(biggestWin([])).toBeNull()
  })
})

const at = (iso: string) => new Date(iso).getTime()
const dated = (t: Trade, iso: string): Trade => ({ ...t, date: at(iso) })

describe('easternDay', () => {
  it('uses the Eastern calendar day', () => {
    // 02:00 UTC on 4 Oct is still 3 Oct in New York.
    expect(easternDay(at('2026-10-04T02:00:00Z'))).toBe('2026-10-03')
  })
})

describe('tradeDays', () => {
  it('finds the most trades by one owner in a day, and the busiest day', () => {
    const trades = [
      dated(trade(side(1, 'o1', 10), side(2, 'o2', 5)), '2026-10-03T15:00:00Z'),
      dated(trade(side(1, 'o1', 10), side(3, 'o3', 5)), '2026-10-03T20:00:00Z'),
      dated(trade(side(4, 'o4', 10), side(5, 'o5', 5)), '2026-10-03T21:00:00Z'),
      dated(trade(side(2, 'o2', 10), side(3, 'o3', 5)), '2026-11-01T15:00:00Z'),
    ]
    const { ownerDay, leagueDay } = tradeDays(trades)
    expect(ownerDay).toMatchObject({ ownerId: 'o1', count: 2, day: '2026-10-03', name: 'Team 1' })
    expect(leagueDay).toEqual({ day: '2026-10-03', count: 3 })
  })

  it('is empty with no trades', () => {
    expect(tradeDays([])).toEqual({ ownerDay: null, leagueDay: null })
  })
})

const move = (owner: string, kind: Move['kind'], iso: string, bid = 0): Move => ({
  year: 2026, date: at(iso), week: 6, kind, team_id: 1, team_name: `Team ${owner}`, owner_id: owner, owner_name: owner,
  added: kind === 'drop' ? [] : [{ player_id: 1, name: 'A', position: 'RB' }],
  dropped: [{ player_id: 2, name: 'B', position: 'WR' }], bid,
})

describe('moveRecords and moveDays', () => {
  const moves = [
    move('o1', 'waiver', '2026-10-14T08:00:00Z', 17),
    move('o1', 'waiver', '2026-10-21T08:00:00Z', 4),
    move('o2', 'waiver', '2026-10-14T08:00:00Z', 30),
    move('o2', 'free_agent', '2026-10-15T20:00:00Z'),
    move('o2', 'drop', '2026-10-16T20:00:00Z'),
  ]

  it('counts one kind of move per owner, with budget spent', () => {
    expect(moveRecords(moves, 'waiver')).toEqual([
      { ownerId: 'o1', name: 'Team o1', count: 2, players: 2, spent: 21 },
      { ownerId: 'o2', name: 'Team o2', count: 1, players: 1, spent: 30 },
    ])
    expect(moveRecords(moves, 'drop')).toEqual([{ ownerId: 'o2', name: 'Team o2', count: 1, players: 1, spent: 0 }])
  })

  it('finds the busiest day for a kind of move', () => {
    const { leagueDay } = moveDays(moves.filter((m) => m.kind === 'waiver'))
    expect(leagueDay).toEqual({ day: '2026-10-14', count: 2 })
  })
})
