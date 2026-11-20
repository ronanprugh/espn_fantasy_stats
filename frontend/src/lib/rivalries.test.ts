import { describe, expect, it } from 'vitest'
import type { HeadToHeadStats, Rivalry } from '../api'
import type { OwnerPrStats } from './powerRankings'
import { rivalryCallouts, summaryRows, winRate } from './rivalries'

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

describe('summaryRows', () => {
  const stats: HeadToHeadStats = {
    owner_a_id: 'a', owner_b_id: 'b', owner_a_name: 'A', owner_b_name: 'B',
    owner_a_team_name: 'Team A', owner_b_team_name: 'Team B',
    total_matchups: 7, owner_a_wins: 4, owner_b_wins: 2, ties: 1,
    owner_a_total_pf: 800.04, owner_b_total_pf: 760, owner_a_avg_pf: 114.29, owner_b_avg_pf: 108.571,
    playoff_matchups: 1, owner_a_playoff_wins: 0, owner_b_playoff_wins: 1, playoff_ties: 0, matchups: [],
  }
  const row = (rows: ReturnType<typeof summaryRows>, label: string) => rows.find((r) => r.label === label)

  it('shows each side of the record and marks the better one', () => {
    const rows = summaryRows(stats)
    expect(row(rows, 'All-time record')).toEqual({ label: 'All-time record', a: '4-2-1', b: '2-4-1', highlight: 'a' })
    expect(row(rows, 'Avg Points For')).toMatchObject({ a: '114.29', b: '108.57', highlight: 'a' })
    // Points against are the other side's points for.
    expect(row(rows, 'Avg Points Against')).toMatchObject({ a: '108.57', b: '114.29' })
    expect(row(rows, 'Playoff wins')).toMatchObject({ a: 0, b: 1, highlight: 'b' })
    expect(row(rows, 'Playoff losses')).toMatchObject({ a: 1, b: 0 })
  })

  it('leaves ties out of a record without any, and marks nobody on equal records', () => {
    const rows = summaryRows({ ...stats, owner_a_wins: 3, owner_b_wins: 3, ties: 0 })
    expect(row(rows, 'All-time record')).toMatchObject({ a: '3-3', b: '3-3', highlight: null })
  })

  it('adds power rankings lines only when both owners have been ranked', () => {
    const pr = (avgRank: number | null, weeksAt1: number) => ({ avgRank, weeksAt1 }) as OwnerPrStats
    expect(row(summaryRows(stats, new Map([['a', pr(2.5, 3)]])), 'Avg Power Rank')).toBeUndefined()
    const rows = summaryRows(stats, new Map([['a', pr(2.5, 3)], ['b', pr(4, 5)]]))
    expect(row(rows, 'Avg Power Rank')).toMatchObject({ a: '2.50', b: '4.00', highlight: 'a' })
    expect(row(rows, 'Weeks at #1')).toMatchObject({ a: 3, b: 5, highlight: 'b' })
  })
})
