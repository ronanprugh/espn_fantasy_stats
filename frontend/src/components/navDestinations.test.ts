import { describe, expect, it } from 'vitest'
import {
  NAV_DESTINATIONS,
  NAV_GROUPS,
  SETTINGS_DESTINATIONS,
  destinationFor,
  tabLayout,
  visibleDestinations,
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
 * Playoffs and has no standalone destination. So is the index route `/`: it
 * only redirects (to Standings, or an old Season Stats link's new page).
 */
const ROUTER_PATHS = [
  '/standings',
  '/all_time',
  '/playoffs',
  '/compare',
  '/h2h',
  '/team_hub',
  '/scoreboard',
  '/positional',
  '/power_rankings',
  '/leagues',
  '/account',
]

describe('navigation destinations (FR U2-3)', () => {
  it('exposes exactly nine main destinations', () => {
    expect(NAV_DESTINATIONS).toHaveLength(9)
  })

  it('never lists the same path twice', () => {
    const paths = [...NAV_DESTINATIONS, ...SETTINGS_DESTINATIONS].map((d) => d.path)
    expect(new Set(paths).size).toBe(paths.length)
  })

  it('never lists a duplicate label', () => {
    const labels = [...NAV_DESTINATIONS, ...SETTINGS_DESTINATIONS].map((d) => d.label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  // A destination whose path is not a registered route renders a blank page.
  it('points every destination at a registered route', () => {
    const orphans = [...NAV_DESTINATIONS, ...SETTINGS_DESTINATIONS].filter(
      (d) => !ROUTER_PATHS.includes(d.path),
    )
    expect(orphans).toEqual([])
  })

  // The inverse: a route with no destination is unreachable from either shell.
  // Settings are reached from the menu under your name (sidebar) and the
  // bottom of the More sheet (phones).
  it('leaves no registered route unreachable from navigation', () => {
    const paths = [...NAV_DESTINATIONS, ...SETTINGS_DESTINATIONS].map((d) => d.path)
    const unreachable = ROUTER_PATHS.filter((p) => !paths.includes(p))
    expect(unreachable).toEqual([])
  })

  it('groups destinations by task, in menu order', () => {
    expect(NAV_GROUPS).toEqual(['This Season', 'Teams', 'History'])
    const byGroup = Object.fromEntries(
      NAV_GROUPS.map((g) => [g, NAV_DESTINATIONS.filter((d) => d.group === g).map((d) => d.label)]),
    )
    expect(byGroup).toEqual({
      'This Season': ['Standings', 'Scoreboard', 'Power Rankings'],
      Teams: ['Team Hub', 'Head to Head', 'Trends'],
      History: ['All-Time', 'Playoffs', 'Positional Stats'],
    })
  })

  it('keeps Leagues and Account in the settings menu, not the main list', () => {
    expect(SETTINGS_DESTINATIONS.map((d) => d.label)).toEqual(['Leagues', 'Account'])
  })
})

describe('visibleDestinations', () => {
  const labels = (opts: { hasPowerRankings: boolean; isAdmin: boolean }) =>
    visibleDestinations(NAV_DESTINATIONS, opts).map((d) => d.label)

  it('hides Power Rankings from members of a league with no rankings', () => {
    expect(labels({ hasPowerRankings: false, isAdmin: false })).not.toContain('Power Rankings')
    expect(labels({ hasPowerRankings: false, isAdmin: false })).toHaveLength(8)
  })

  it('shows Power Rankings once the league has rankings', () => {
    expect(labels({ hasPowerRankings: true, isAdmin: false })).toContain('Power Rankings')
  })

  // Admins see it regardless, so they can reach the import.
  it('always shows Power Rankings to admins', () => {
    expect(labels({ hasPowerRankings: false, isAdmin: true })).toContain('Power Rankings')
  })
})

describe('destinationFor', () => {
  it('finds the page you are on, and its group', () => {
    expect(destinationFor('/standings')).toMatchObject({ label: 'Standings', group: 'This Season' })
    expect(destinationFor('/compare')).toMatchObject({ label: 'Trends', group: 'Teams' })
  })

  it('has no destination for click-through and settings pages', () => {
    expect(destinationFor('/box_score/2024/3/1/2')).toBeUndefined()
    expect(destinationFor('/leagues')).toBeUndefined()
  })

  it('does not match on a shared prefix alone', () => {
    expect(destinationFor('/standingsx')).toBeUndefined()
  })
})

describe('tabLayout (phone tabs)', () => {
  const layout = (hasPowerRankings: boolean, isAdmin = false) =>
    tabLayout(visibleDestinations(NAV_DESTINATIONS, { hasPowerRankings, isAdmin }), {
      hasPowerRankings,
    })
  const tabLabels = (hasPowerRankings: boolean) =>
    layout(hasPowerRankings).tabs.map((d) => d.tab?.label)

  // Four tabs plus the More trigger is five targets, which is what fits at
  // 320px while holding the 44px minimum from FR U2-4.
  it('always gives exactly four tabs', () => {
    expect(layout(true).tabs).toHaveLength(4)
    expect(layout(false).tabs).toHaveLength(4)
    expect(layout(false, true).tabs).toHaveLength(4)
  })

  it('reads Standings · Scores · Rankings · My Team', () => {
    expect(tabLabels(true)).toEqual(['Standings', 'Scores', 'Rankings', 'My Team'])
    expect(layout(true).tabs.map((d) => d.path)).toEqual([
      '/standings',
      '/scoreboard',
      '/power_rankings',
      '/team_hub',
    ])
  })

  it('gives the Rankings slot to Head to Head in a league without rankings', () => {
    expect(tabLabels(false)).toEqual(['Standings', 'Scores', 'H2H', 'My Team'])
  })

  // Every destination is on a phone somewhere: a tab or the More sheet, never
  // both and never neither.
  it('puts every other visible destination in the More sheet', () => {
    for (const [hasPowerRankings, isAdmin] of [
      [true, false],
      [false, false],
      [false, true],
    ]) {
      const visible = visibleDestinations(NAV_DESTINATIONS, { hasPowerRankings, isAdmin })
      const { tabs, overflow } = tabLayout(visible, { hasPowerRankings })
      const paths = [...tabs, ...overflow].map((d) => d.path)
      expect(new Set(paths).size).toBe(paths.length)
      expect([...paths].sort()).toEqual(visible.map((d) => d.path).sort())
    }
  })

  // An admin in a league without rankings keeps Power Rankings (to import),
  // but in More: the tab is Head to Head.
  it('keeps Power Rankings in More for an admin of a league without rankings', () => {
    const { overflow } = layout(false, true)
    expect(overflow.map((d) => d.label)).toContain('Power Rankings')
    expect(overflow.map((d) => d.label)).not.toContain('Head to Head')
  })

  it('gives every possible tab an icon and a short label', () => {
    const tabs = [...layout(true).tabs, ...layout(false).tabs]
    for (const d of tabs) {
      expect(d.tab?.icon).toBeTruthy()
      expect(d.tab?.label.length).toBeLessThanOrEqual(9)
    }
  })

  // WCAG 2.5.3: an accessible name must contain the visible label.
  it('keeps the visible label in any accessible name', () => {
    for (const d of NAV_DESTINATIONS) {
      if (d.tab?.ariaLabel) expect(d.tab.ariaLabel).toContain(d.tab.label)
    }
  })
})
