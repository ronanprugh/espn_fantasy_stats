import { describe, expect, it } from 'vitest'
import type { ScoreboardMatchup } from '../api'
import { isUnplayed, weekExtremes } from './scoreboard'

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
