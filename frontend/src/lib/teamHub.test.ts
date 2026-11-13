import { describe, expect, it } from 'vitest'
import type { SeasonTeams, Team, TeamHubGame } from '../api'
import { currentStreak, hubHeadline, ordinal } from './teamHub'

const team = (id: number, w: number, l: number, pf: number, standing: number, final = 0): Team => ({
  team_id: id, team_name: `T${id}`, abbrev: '', owners: [], wins: w, losses: l, ties: 0,
  playoff_wins: 0, playoff_losses: 0, points_for: pf, points_against: 0, avg_points_for: 0,
  avg_points_against: 0, avg_plus_minus: 0, final_standing: final, standing, scores: [],
})
const season = (teams: Team[]): SeasonTeams => ({ league_id: 1, year: 2026, scoring_type: 'ppr', teams })
const game = (week: number, result: string, is_bye = false): TeamHubGame => ({
  week, round_label: 'regular', is_playoff: false, is_bye, own_team_id: 1, own_team_name: '',
  own_score: 0, opp_team_id: 2, opp_team_name: '', opp_owner_name: '', opp_score: 0, result,
})

describe('ordinal', () => {
  it('handles the teens and the rest', () => {
    expect([1, 2, 3, 4, 10, 11, 12, 13, 21, 22, 23, 101].map(ordinal)).toEqual([
      '1st', '2nd', '3rd', '4th', '10th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st',
    ])
  })
})

describe('currentStreak', () => {
  it('counts the latest run, skipping byes and unplayed weeks', () => {
    expect(currentStreak([game(1, 'L'), game(2, 'W'), game(3, 'BYE', true), game(4, 'W'), game(5, 'U')])).toBe('W2')
    expect(currentStreak([game(1, 'W'), game(2, 'L')])).toBe('L1')
  })

  it('is null before the first game', () => {
    expect(currentStreak([game(1, 'U')])).toBeNull()
  })
})

describe('hubHeadline', () => {
  it('never calls a season in progress final', () => {
    const h = hubHeadline(season([team(1, 3, 7, 900, 10), team(2, 7, 3, 1000, 1)]), 1, [game(1, 'L'), game(2, 'L')])!
    expect(h.inProgress).toBe(true)
    expect(h.standing).toBe('10th · in progress')
    expect(h.standing).not.toMatch(/final/i)
    expect(h.record).toBe('3–7')
    expect(h.pfRank).toBe('2nd in PF')
    expect(h.streak).toBe('L2')
  })

  it('gives the final place for a finished season', () => {
    const h = hubHeadline(season([team(1, 9, 5, 1500, 3, 2), team(2, 10, 4, 1400, 1, 1)]), 1, [])!
    expect(h.standing).toBe('Finished 2nd')
    expect(h.pfRank).toBe('1st in PF')
  })
})
