import { describe, expect, it } from 'vitest'
import type { Trade, TradeSide } from '../api'
import { biggestWin, traderRecords } from './trades'

const side = (id: number, owner: string, pts: number): TradeSide => ({
  team_id: id, team_name: `Team ${id}`, owner_id: owner, owner_name: owner,
  received: [], sent: [], started_points: pts,
})
const trade = (a: TradeSide, b: TradeSide): Trade => {
  const margin = Math.abs(a.started_points - b.started_points)
  return {
    date: 0, week: 5, sides: [a, b], margin,
    winner_team_id: margin === 0 ? null : a.started_points > b.started_points ? a.team_id : b.team_id,
  }
}

describe('traderRecords', () => {
  it('counts trades, wins and net points per owner', () => {
    const trades = [trade(side(1, 'o1', 80, ), side(2, 'o2', 50)), trade(side(1, 'o1', 10), side(3, 'o3', 30))]
    const r = Object.fromEntries(traderRecords(trades).map((x) => [x.ownerId, x]))
    expect(r.o1).toMatchObject({ trades: 2, won: 1, lost: 1, net: 10 })
    expect(r.o2).toMatchObject({ trades: 1, won: 0, lost: 1, net: -30 })
    expect(traderRecords(trades)[0].ownerId).toBe('o1')
  })

  it('leaves a tie as neither won nor lost', () => {
    const [r] = traderRecords([trade(side(1, 'o1', 0), side(2, 'o2', 0))])
    expect(r).toMatchObject({ won: 0, lost: 0 })
  })
})

describe('biggestWin', () => {
  it('is the most lopsided decided trade', () => {
    const a = trade(side(1, 'o1', 80), side(2, 'o2', 50))
    const b = trade(side(3, 'o3', 10), side(4, 'o4', 100))
    expect(biggestWin([a, b])).toBe(b)
    expect(biggestWin([])).toBeNull()
  })
})
