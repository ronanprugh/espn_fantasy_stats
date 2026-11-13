import { describe, expect, it } from 'vitest'
import { headToHeadHref, teamHubHref } from './links'

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
