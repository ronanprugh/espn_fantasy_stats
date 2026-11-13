import { describe, expect, it } from 'vitest'
import type { Rivalry } from '../api'
import { rivalryCallouts, winRate } from './rivalries'

const r = (id: string, wins: number, losses: number, ties = 0): Rivalry => ({
  opponent_id: id,
  opponent_name: id,
  opponent_team_name: id,
  meetings: wins + losses + ties,
  wins,
  losses,
  ties,
  points_for: 0,
  points_against: 0,
  avg_pf: null,
  avg_pa: null,
  playoff_meetings: 0,
  playoff_wins: 0,
  playoff_losses: 0,
  last_meeting: null,
})

describe('winRate', () => {
  it('counts ties as half a win', () => {
    expect(winRate(r('a', 1, 0, 1))).toBe(0.75)
    expect(winRate(r('a', 0, 0))).toBeNull()
  })
})

describe('rivalryCallouts', () => {
  it('picks best, toughest and most played', () => {
    const c = rivalryCallouts([r('x', 8, 2), r('y', 2, 7), r('z', 7, 7)])
    expect(c.best?.opponent_id).toBe('x')
    expect(c.toughest?.opponent_id).toBe('y')
    expect(c.mostPlayed?.opponent_id).toBe('z')
  })

  it('ignores a lucky 1–0 when others have played enough', () => {
    const c = rivalryCallouts([r('lucky', 1, 0), r('x', 6, 3), r('y', 3, 6)])
    expect(c.best?.opponent_id).toBe('x')
  })

  it('breaks a win-rate tie by meetings', () => {
    const c = rivalryCallouts([r('few', 3, 1), r('many', 6, 2), r('y', 1, 5)])
    expect(c.best?.opponent_id).toBe('many')
  })

  it('says nothing without meetings, and no toughest with one opponent', () => {
    expect(rivalryCallouts([r('a', 0, 0)])).toEqual({ best: null, toughest: null, mostPlayed: null })
    const one = rivalryCallouts([r('a', 4, 2)])
    expect(one.best?.opponent_id).toBe('a')
    expect(one.toughest).toBeNull()
  })
})
