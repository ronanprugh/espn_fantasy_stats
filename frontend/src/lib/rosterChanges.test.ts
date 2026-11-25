import { describe, expect, it } from 'vitest'
import type { Move, RosterPlayer, Trade, TradeSide } from '../api'
import { rosterChanges } from './rosterChanges'

const p = (id: number, position = 'RB'): RosterPlayer => ({
  player_id: id, name: `P${id}`, position, slot_position: 'BE', pro_team: 'KC',
})
const ref = (id: number) => ({ player_id: id, name: `P${id}`, position: 'RB' })
const side = (owner: string, received: number[], sent: number[]): TradeSide => ({
  team_id: Number(owner.slice(1)), team_name: `Team ${owner}`, owner_id: owner, owner_name: owner,
  received: received.map((id) => ({ ...ref(id), started_points: 0, bench_points: 0, weeks_started: 0, war: 0 })),
  sent: sent.map(ref), started_points: 0, war: 0, ppg: null, ppg_if_kept: null, games: 0,
})
const trade = (date: number, week: number, sides: TradeSide[]): Trade => ({
  year: 2025, uid: `t${date}`, date, week, sides, winner_team_id: null, margin: 0,
})
const move = (owner: string, kind: Move['kind'], date: number, added: number[], dropped: number[], bid = 0): Move => ({
  year: 2025, date, week: date, kind, team_id: 1, team_name: 'T', owner_id: owner, owner_name: '',
  added: added.map(ref), dropped: dropped.map(ref), bid,
})

describe('rosterChanges', () => {
  it('splits the rosters into kept, gone and added, and says how each moved', () => {
    const start = [p(1, 'QB'), p(2), p(3), p(4)]
    const end = [p(1, 'QB'), p(5), p(6), p(7)]
    const trades = [trade(3, 3, [side('o1', [5], [2]), side('o2', [2], [5])])]
    const moves = [
      move('o1', 'waiver', 4, [6], [3], 12),
      move('o1', 'free_agent', 6, [7], []),
      move('o1', 'drop', 5, [], [4]),
      move('o2', 'waiver', 7, [4], []), // another team picking him up isn't how he left
    ]
    const r = rosterChanges(start, end, 'o1', trades, moves)
    expect(r).toMatchObject({ kept: 1, added: 3, gone: 3 })
    const out = Object.fromEntries(r.start.map((x) => [x.player_id, x.departure]))
    expect(out[1]).toBeNull()
    expect(out[2]).toEqual({ how: 'trade', week: 3, to: 'Team o2' })
    expect(out[3]).toEqual({ how: 'dropped', week: 4 })
    expect(out[4]).toEqual({ how: 'dropped', week: 5 })
    const inn = Object.fromEntries(r.end.map((x) => [x.player_id, x.arrival]))
    expect(inn[5]).toEqual({ how: 'trade', week: 3, from: 'Team o2' })
    expect(inn[6]).toEqual({ how: 'waiver', week: 4, bid: 12 })
    expect(inn[7]).toEqual({ how: 'free_agent', week: 6, bid: 0 })
  })

  it('gives the latest move for a player who moved more than once', () => {
    const moves = [move('o1', 'waiver', 2, [9], []), move('o1', 'drop', 4, [], [9]), move('o1', 'free_agent', 8, [9], [])]
    const r = rosterChanges([], [p(9)], 'o1', [], moves)
    expect(r.end[0].arrival).toEqual({ how: 'free_agent', week: 8, bid: 0 })
  })

  it('counts a player who left and came back as kept, and marks an untraced change unknown', () => {
    const r = rosterChanges([p(1), p(2)], [p(1), p(3)], 'o1', [], [])
    expect(r.start.find((x) => x.player_id === 1)!.kept).toBe(true)
    expect(r.start.find((x) => x.player_id === 2)!.departure).toEqual({ how: 'unknown' })
    expect(r.end.find((x) => x.player_id === 3)!.arrival).toEqual({ how: 'unknown' })
  })

  it('lists each roster by position', () => {
    const r = rosterChanges([p(1, 'K'), p(2, 'QB'), p(3, 'WR'), p(4, 'D/ST'), p(5, 'RB')], [], 'o1', [], [])
    expect(r.start.map((x) => x.position)).toEqual(['QB', 'RB', 'WR', 'K', 'D/ST'])
  })
})
