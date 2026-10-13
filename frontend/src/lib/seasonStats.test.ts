import { describe, expect, it } from 'vitest'
import type { SeasonTeams, Team } from '../api'
import { computeSeasonStats, formatRate, formatRecord, gamesPlayed } from './seasonStats'

function team(team_id: number, scores: number[], wins: number, losses: number, ties = 0): Team {
  return {
    team_id,
    team_name: `Team ${team_id}`,
    abbrev: `T${team_id}`,
    owners: [],
    wins,
    losses,
    ties,
    playoff_wins: 0,
    playoff_losses: 0,
    points_for: 0,
    points_against: 0,
    avg_points_for: 0,
    avg_points_against: 0,
    avg_plus_minus: 0,
    final_standing: 0,
    standing: 0,
    scores,
  }
}

function season(teams: Team[]): SeasonTeams {
  return { league_id: 1, year: 2024, scoring_type: 'ppr', teams }
}

/**
 * Two completed weeks. The third entry stands in for what `scores` really
 * carries past the regular season: a playoff score (999) and unplayed 0.0s.
 * Any stat that reads past week 2 will be visibly wrong.
 *
 *            wk1  wk2 | wk3
 *   team 1   100   80 | 999   record 1-1
 *   team 2    90  120 |   0   record 2-0
 *   team 3   110   80 |   0   record 0-2
 */
const FIXTURE = season([
  team(1, [100, 80, 999], 1, 1),
  team(2, [90, 120, 0], 2, 0),
  team(3, [110, 80, 0], 0, 2),
])

describe('gamesPlayed', () => {
  it('counts completed regular-season games, not the length of scores', () => {
    expect(gamesPlayed(FIXTURE)).toBe(2)
  })

  it('is zero before any game is played', () => {
    expect(gamesPlayed(season([team(1, [0, 0], 0, 0)]))).toBe(0)
  })
})

describe('computeSeasonStats', () => {
  const stats = computeSeasonStats(FIXTURE)
  const s1 = stats.get(1)!
  const s2 = stats.get(2)!
  const s3 = stats.get(3)!

  it('ignores playoff and unplayed weeks entirely', () => {
    expect(s1.highScore).toBe(100) // not the 999 playoff week
    expect(s2.lowScore).toBe(90) // not the unplayed 0.0
  })

  it('computes win percentage with ties as half', () => {
    expect(s1.winPct).toBe(0.5)
    expect(s2.winPct).toBe(1)
    expect(s3.winPct).toBe(0)
    const tied = computeSeasonStats(season([team(1, [100, 100], 1, 0, 1), team(2, [90, 90], 0, 1, 1)]))
    expect(tied.get(1)!.winPct).toBe(0.75)
  })

  it('measures points per game against the league average', () => {
    // League averages 580 / 6 = 96.67 per team-week.
    expect(s1.ptsVsAvg).toBeCloseTo(90 / (580 / 6) - 1, 10)
    expect(s2.ptsVsAvg).toBeCloseTo(105 / (580 / 6) - 1, 10)
    expect(s3.ptsVsAvg).toBeCloseTo(95 / (580 / 6) - 1, 10)
  })

  it('plays every team against every other team each week', () => {
    // wk1: 1 beats 2, loses to 3.  wk2: 1 loses to 2, ties 3.
    expect([s1.allPlayWins, s1.allPlayLosses, s1.allPlayTies]).toEqual([1, 2, 1])
    expect([s2.allPlayWins, s2.allPlayLosses, s2.allPlayTies]).toEqual([2, 2, 0])
    expect([s3.allPlayWins, s3.allPlayLosses, s3.allPlayTies]).toEqual([2, 1, 1])
    expect(s1.allPlayPct).toBe(0.375)
    expect(s3.allPlayPct).toBe(0.625)
  })

  it('scores luck as actual wins minus all-play-expected wins', () => {
    expect(s1.luck).toBeCloseTo(1 - 0.375 * 2, 10) // +0.25
    expect(s2.luck).toBeCloseTo(2 - 0.5 * 2, 10) // +1: won both despite middling scoring
    expect(s3.luck).toBeCloseTo(0 - 0.625 * 2, 10) // -1.25: outscored the field, won nothing
  })

  it('reports high and low weeks with their 1-based week number', () => {
    expect([s1.highScore, s1.highWeek, s1.lowScore, s1.lowWeek]).toEqual([100, 1, 80, 2])
    expect([s2.highScore, s2.highWeek, s2.lowScore, s2.lowWeek]).toEqual([120, 2, 90, 1])
  })

  it('counts weeks as the league top scorer', () => {
    expect([s1.topScorerWeeks, s2.topScorerWeeks, s3.topScorerWeeks]).toEqual([0, 1, 1])
  })

  it('credits every team that ties for the top score', () => {
    const tie = computeSeasonStats(season([team(1, [100], 1, 0), team(2, [100], 0, 1)]))
    expect(tie.get(1)!.topScorerWeeks).toBe(1)
    expect(tie.get(2)!.topScorerWeeks).toBe(1)
  })

  it('computes the population standard deviation of weekly scores', () => {
    expect(s1.stdDev).toBe(10)
    expect(s2.stdDev).toBe(15)
  })

  it('returns nothing for a season with no completed games', () => {
    expect(computeSeasonStats(season([team(1, [0, 0], 0, 0)])).size).toBe(0)
  })
})

describe('formatting', () => {
  it('formats rates baseball-style', () => {
    expect(formatRate(0.5)).toBe('.500')
    expect(formatRate(0.0714)).toBe('.071')
    expect(formatRate(1)).toBe('1.000')
    expect(formatRate(0)).toBe('.000')
  })

  it('omits the tie column unless there are ties', () => {
    expect(formatRecord(10, 4, 0)).toBe('10-4')
    expect(formatRecord(10, 3, 1)).toBe('10-3-1')
  })
})
