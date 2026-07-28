import { describe, expect, it } from 'vitest'
import {
  NAV_DESTINATIONS,
  OVERFLOW_DESTINATIONS,
  PRIMARY_DESTINATIONS,
} from './navDestinations'

/**
 * The routes registered under `<Route path="/" element={<App />}>` in main.tsx,
 * transcribed by hand.
 *
 * Hardcoding rather than importing is the point: importing main.tsx would drag
 * in React, the router, and every page component (and require jsdom, which this
 * spec deliberately does not add), and a rename would move both sides together
 * and assert nothing. A transcribed list fails loudly when a route is renamed
 * without updating navigation, which is precisely the silent tab-orphaning bug
 * FR U2-3 guards against.
 *
 * `box_score/:year/:week/:teamA/:teamB` is intentionally absent from the
 * navigation list: it is reached by clicking through from Scoreboard or
 * Playoffs and has no standalone destination.
 */
const ROUTER_PATHS = [
  '/',
  '/playoffs',
  '/compare',
  '/h2h',
  '/team_hub',
  '/scoreboard',
  '/positional',
  '/leagues',
  '/account',
]

describe('navigation destinations (FR U2-3)', () => {
  it('exposes exactly nine destinations', () => {
    expect(NAV_DESTINATIONS).toHaveLength(9)
  })

  // Four tabs plus the More trigger is five targets, which is what fits at
  // 320px while holding the 44px minimum from FR U2-4.
  it('marks exactly four destinations primary', () => {
    expect(PRIMARY_DESTINATIONS.map((d) => d.path)).toEqual([
      '/',
      '/playoffs',
      '/scoreboard',
      '/team_hub',
    ])
  })

  it('routes the remaining five through the More sheet', () => {
    expect(OVERFLOW_DESTINATIONS).toHaveLength(5)
  })

  it('never lists the same path twice', () => {
    const paths = NAV_DESTINATIONS.map((d) => d.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('never lists a duplicate label', () => {
    const labels = NAV_DESTINATIONS.map((d) => d.label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  // A destination whose path is not a registered route renders a blank page.
  it('points every destination at a registered route', () => {
    const orphans = NAV_DESTINATIONS.filter((d) => !ROUTER_PATHS.includes(d.path))
    expect(orphans).toEqual([])
  })

  // The inverse: a route with no destination is unreachable from either shell.
  it('leaves no registered route unreachable from navigation', () => {
    const paths = NAV_DESTINATIONS.map((d) => d.path)
    const unreachable = ROUTER_PATHS.filter((p) => !paths.includes(p))
    expect(unreachable).toEqual([])
  })

  it('groups destinations under the sidebar section headings', () => {
    const groups = [...new Set(NAV_DESTINATIONS.map((d) => d.group))]
    expect(groups).toEqual(['Season Data', 'Team Data', 'Account'])
  })
})
