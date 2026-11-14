import { describe, expect, it } from 'vitest'
import type { OwnerHistory, OwnerSeason } from '../api'
import {
  AVG_KEY,
  buildTrendData,
  curKey,
  currentYear,
  formatTrendValue,
  leagueAverageByYear,
  rankAxis,
  seasonAverage,
} from './trends'

function season(year: number, wins: number, extra: Partial<OwnerSeason> = {}): OwnerSeason {
  return {
    year, team_name: `t${year}`, seed: 1, final_standing: 1, wins, losses: 0, ties: 0,
    playoff_wins: 0, playoff_losses: 0, points_for: 0, points_against: 0,
    avg_points_for: 0, avg_points_against: 0, avg_plus_minus: 0, ...extra,
  }
}

function owner(id: string, seasons: OwnerSeason[]): OwnerHistory {
  return { owner_id: id, owner_name: id, current_team_name: id, seasons }
}

const YEARS = [2022, 2023, 2024]
const A = owner('a', [season(2022, 8), season(2023, 10), season(2024, 3, { in_progress: true })])
const B = owner('b', [season(2022, 4), season(2024, 5, { in_progress: true })])
const C = owner('c', [season(2023, 6)])

describe('currentYear', () => {
  it('is the in-progress season, or null without the flag', () => {
    expect(currentYear([A, B])).toBe(2024)
    expect(currentYear([owner('x', [season(2022, 1)])])).toBeNull()
  })
})

describe('leagueAverageByYear', () => {
  it('averages every owner who played that year', () => {
    const avg = leagueAverageByYear([A, B, C], YEARS, 'wins')
    expect(avg.get(2022)).toBe(6)
    expect(avg.get(2023)).toBe(8)
    expect(avg.get(2024)).toBe(4)
  })

  it('skips missing values', () => {
    const avg = leagueAverageByYear([A], [2021], 'wins')
    expect(avg.get(2021)).toBeNull()
  })
})

describe('rankAxis', () => {
  it('runs from 1 to the largest league size', () => {
    expect(rankAxis([A, B, C], YEARS)).toEqual({ domain: [1, 2], ticks: [1, 2] })
  })
})

describe('buildTrendData', () => {
  it('moves the current season onto a dashed key joined to the last completed point', () => {
    const rows = buildTrendData([A], [A, B, C], YEARS, 'wins', { current: 2024, average: false })
    expect(rows.map((r) => r.a)).toEqual([8, 10, null])
    expect(rows.map((r) => r[curKey('a')])).toEqual([null, 10, 3])
  })

  it('joins across a missed season', () => {
    const rows = buildTrendData([B], [A, B, C], YEARS, 'wins', { current: 2024, average: false })
    expect(rows.map((r) => r.b)).toEqual([4, null, null])
    expect(rows.map((r) => r[curKey('b')])).toEqual([4, null, 5])
  })

  it('has no dashed values in the offseason', () => {
    const rows = buildTrendData([A], [A], YEARS, 'wins', { current: null, average: false })
    expect(rows.map((r) => r.a)).toEqual([8, 10, 3])
    expect(rows.every((r) => r[curKey('a')] === null)).toBe(true)
  })

  it('adds the league average, split the same way', () => {
    const rows = buildTrendData([A], [A, B, C], YEARS, 'wins', { current: 2024, average: true })
    expect(rows.map((r) => r[AVG_KEY])).toEqual([6, 8, null])
    expect(rows.map((r) => r[curKey(AVG_KEY)])).toEqual([null, 8, 4])
  })

  it('leaves the average out when switched off', () => {
    const rows = buildTrendData([A], [A, B], YEARS, 'wins', { current: 2024, average: false })
    expect(rows.every((r) => !(AVG_KEY in r))).toBe(true)
  })
})

describe('formatTrendValue', () => {
  it('keeps whole numbers whole', () => {
    expect(formatTrendValue(3)).toBe('3')
    expect(formatTrendValue(3.456)).toBe('3.46')
  })
})

describe('seasonAverage', () => {
  it('leaves out the excluded season', () => {
    expect(seasonAverage(A.seasons, 'wins', 2024)).toBe(9)
    expect(seasonAverage(A.seasons, 'wins', null)).toBe(7)
  })

  it('is null with nothing left to average', () => {
    expect(seasonAverage(C.seasons, 'wins', 2023)).toBeNull()
  })
})
