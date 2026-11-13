import { describe, expect, it } from 'vitest'
import { boxScoreHref, headToHeadHref, noBoxScoreReason, teamHubHref } from './links'

describe('teamHubHref', () => {
  it('opens a team', () => {
    expect(teamHubHref('o1')).toBe('/team_hub?team=o1')
  })

  it('opens the season when the context has one', () => {
    expect(teamHubHref('o1', { year: 2024 })).toBe('/team_hub?team=o1&year=2024')
    expect(teamHubHref('o1', { year: null })).toBe('/team_hub?team=o1')
  })

  it('opens a tab, leaving the default one implicit', () => {
    expect(teamHubHref('o1', { year: 2024, tab: 'power' })).toBe('/team_hub?team=o1&year=2024&tab=power')
    expect(teamHubHref('o1', { tab: 'summary' })).toBe('/team_hub?team=o1')
  })

  // ESPN owner ids are GUIDs in braces.
  it('encodes owner ids', () => {
    expect(teamHubHref('{AB-12}')).toBe('/team_hub?team=%7BAB-12%7D')
  })
})

describe('headToHeadHref', () => {
  it('puts the first owner on the left', () => {
    expect(headToHeadHref('o1', 'o2')).toBe('/h2h?a=o1&b=o2')
  })

  it('encodes owner ids', () => {
    expect(headToHeadHref('{A}', '{B}')).toBe('/h2h?a=%7BA%7D&b=%7BB%7D')
  })
})

describe('boxScoreHref and noBoxScoreReason', () => {
  it('builds the Box Score path', () => {
    expect(boxScoreHref(2024, 6, 1, 2)).toBe('/box_score/2024/6/1/2')
  })

  it('explains a missing box score', () => {
    expect(noBoxScoreReason(2018)).toBe('Box scores start in 2019')
    expect(noBoxScoreReason(2024, { isBye: true })).toBe('Bye week: no game to show')
    expect(noBoxScoreReason(2024, { unplayed: true })).toBe('Not played yet')
    expect(noBoxScoreReason(2024, { opponent: null })).toBe('No opponent this week')
    expect(noBoxScoreReason(2019, { opponent: 3 })).toBeNull()
  })
})
