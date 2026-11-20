import { describe, expect, it } from 'vitest'
import type { ScoreboardMatchup } from '../api'
import { isLive, isUnplayed, weekExtremes } from './scoreboard'

const game = (a: number, as: number, b: number, bs: number, extra: Partial<ScoreboardMatchup> = {}): ScoreboardMatchup => ({
  week: 1,
  is_playoff: false,
  round_label: 'regular',
  is_bye: false,
  team_a_id: a,
  team_a_name: `T${a}`,
  team_a_owner: '',
  team_a_score: as,
  team_b_id: b,
  team_b_name: `T${b}`,
  team_b_owner: '',
  team_b_score: bs,
  winner_id: as === bs ? null : as > bs ? a : b,
  ...extra,
})

describe('weekExtremes', () => {
  it("finds the week's top and low scorer across every game", () => {
    const { top, low } = weekExtremes([game(1, 120, 2, 95), game(3, 140, 4, 88)])
    expect([...top]).toEqual([3])
    expect([...low]).toEqual([4])
  })

  it('badges every team tied for the top or low score', () => {
    const { top, low } = weekExtremes([game(1, 130, 2, 90), game(3, 130, 4, 90)])
    expect([...top].sort()).toEqual([1, 3])
    expect([...low].sort()).toEqual([2, 4])
  })

  it('ignores byes and unplayed games', () => {
    const bye = game(5, 0, 0, 0, { is_bye: true, winner_id: null })
    const future = game(6, 0, 7, 0)
    expect(isUnplayed(future)).toBe(true)
    const { top, low } = weekExtremes([game(1, 120, 2, 95), bye, future])
    expect([...top]).toEqual([1])
    expect([...low]).toEqual([2])
  })

  it('has no badges for a week with nothing played', () => {
    const { top, low } = weekExtremes([game(1, 0, 2, 0), game(3, 0, 4, 0)])
    expect(top.size + low.size).toBe(0)
  })
})

describe('live games', () => {
  it('reads a game with points and no winner as live, and a tie as finished', () => {
    expect(isLive(game(1, 40.5, 2, 22.1, { winner_id: null }))).toBe(true)
    expect(isLive(game(1, 99.5, 2, 99.5))).toBe(false)
    expect(isLive(game(1, 0, 2, 0))).toBe(false)
    expect(isLive(game(1, 120, 2, 95))).toBe(false)
  })

  it("leaves games still being played out of the week's top and low score", () => {
    const live = game(5, 31.2, 6, 150.4, { winner_id: null })
    const { top, low } = weekExtremes([game(1, 120, 2, 95), game(3, 140, 4, 88), live])
    expect([...top]).toEqual([3])
    expect([...low]).toEqual([4])
  })

  it('has no badges while every game of the week is still going', () => {
    const { top, low } = weekExtremes([
      game(1, 50, 2, 40, { winner_id: null }),
      game(3, 70, 4, 20, { winner_id: null }),
    ])
    expect(top.size + low.size).toBe(0)
  })
})
