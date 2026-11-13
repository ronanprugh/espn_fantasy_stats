import { describe, expect, it } from 'vitest'
import { frontPageTarget } from './legacyRoutes'

describe('frontPageTarget', () => {
  it('opens Standings on a bare front page', () => {
    expect(frontPageTarget('')).toBe('/standings')
    expect(frontPageTarget('?')).toBe('/standings')
  })

  it('sends an old single-season link to that year of Standings', () => {
    expect(frontPageTarget('?view=2024')).toBe('/standings?year=2024')
  })

  it('sends an old Every Season link to that tab of All-Time', () => {
    expect(frontPageTarget('?view=seasons')).toBe('/all_time?view=seasons')
  })

  // The old page showed All Time for any view it didn't recognise.
  it('sends an empty or unknown view to All-Time', () => {
    expect(frontPageTarget('?view=')).toBe('/all_time')
    expect(frontPageTarget('?view=all')).toBe('/all_time')
    expect(frontPageTarget('?view=24')).toBe('/all_time')
  })
})
