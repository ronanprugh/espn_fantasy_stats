/**
 * The nine navigation destinations, in sidebar order.
 *
 * Single source of truth for both the desktop sidebar and the mobile bottom tab
 * bar. Before this existed the sidebar held the destinations as literal JSX,
 * which meant a new route had to be added in two places to be reachable on both
 * shells — the tab bar would silently lack it.
 *
 * `tier` decides which shell surface a destination lands on below 900px:
 * `primary` gets a tab, `overflow` lives in the More sheet. The split is fixed
 * at four primary + the More trigger, which is what fits at 320px with 44px
 * targets. `group` supplies the sidebar's section headings.
 *
 * Enforced by navDestinations.test.ts: nine entries, exactly four primary, and
 * every path registered as a route in main.tsx.
 */
export type NavGroup = 'Season Data' | 'Team Data' | 'Account'

export type NavDestination = {
  path: string
  label: string
  group: NavGroup
  tier: 'primary' | 'overflow'
}

export const NAV_DESTINATIONS: readonly NavDestination[] = [
  { path: '/', label: 'Season Stats', group: 'Season Data', tier: 'primary' },
  { path: '/playoffs', label: 'Playoff History', group: 'Season Data', tier: 'primary' },
  { path: '/scoreboard', label: 'Scoreboard', group: 'Season Data', tier: 'primary' },
  { path: '/positional', label: 'Positional Stats', group: 'Season Data', tier: 'overflow' },
  { path: '/team_hub', label: 'Team Hub', group: 'Team Data', tier: 'primary' },
  { path: '/compare', label: 'Team Comparison', group: 'Team Data', tier: 'overflow' },
  { path: '/h2h', label: 'Head to Head', group: 'Team Data', tier: 'overflow' },
  { path: '/leagues', label: 'Manage Leagues', group: 'Account', tier: 'overflow' },
  { path: '/account', label: 'Account', group: 'Account', tier: 'overflow' },
]

export const NAV_GROUPS: readonly NavGroup[] = ['Season Data', 'Team Data', 'Account']

export const PRIMARY_DESTINATIONS = NAV_DESTINATIONS.filter((d) => d.tier === 'primary')

export const OVERFLOW_DESTINATIONS = NAV_DESTINATIONS.filter((d) => d.tier === 'overflow')
