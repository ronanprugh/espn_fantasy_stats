/**
 * The navigation destinations, in menu order.
 *
 * Single source of truth for the desktop sidebar, the mobile bottom tab bar and
 * the More sheet. Before this existed the sidebar held the destinations as
 * literal JSX, which meant a new route had to be added in several places to be
 * reachable on every shell — the tab bar would silently lack it.
 *
 * Grouped by what people come to do, not by data type. `tier` decides which
 * shell surface a destination lands on below 900px: `primary` gets a tab,
 * `overflow` lives in the More sheet. The split is fixed at four primary + the
 * More trigger, which is what fits at 320px with 44px targets.
 *
 * Leagues and Account are rarely opened, so they are not in the main list:
 * they live in SETTINGS_DESTINATIONS, under your name in the sidebar footer and
 * at the bottom of the More sheet.
 *
 * Enforced by navDestinations.test.ts: exactly four primary, every path
 * registered as a route in main.tsx, and every route but the redirecting front
 * page listed here.
 */
export type NavGroup = 'This Season' | 'Teams' | 'History'

export type NavDestination = {
  path: string
  label: string
  group: NavGroup
  tier: 'primary' | 'overflow'
  /** Listed only when the league has power rankings, or for admins (who can
   * import them). The route itself always works. */
  needsPowerRankings?: true
}

export const NAV_DESTINATIONS: readonly NavDestination[] = [
  { path: '/standings', label: 'Standings', group: 'This Season', tier: 'primary' },
  { path: '/scoreboard', label: 'Scoreboard', group: 'This Season', tier: 'primary' },
  {
    path: '/power_rankings',
    label: 'Power Rankings',
    group: 'This Season',
    tier: 'overflow',
    needsPowerRankings: true,
  },
  { path: '/team_hub', label: 'Team Hub', group: 'Teams', tier: 'primary' },
  { path: '/h2h', label: 'Head to Head', group: 'Teams', tier: 'overflow' },
  { path: '/compare', label: 'Trends', group: 'Teams', tier: 'overflow' },
  { path: '/all_time', label: 'All-Time', group: 'History', tier: 'overflow' },
  { path: '/playoffs', label: 'Playoffs', group: 'History', tier: 'primary' },
  { path: '/positional', label: 'Positional Stats', group: 'History', tier: 'overflow' },
]

export const NAV_GROUPS: readonly NavGroup[] = ['This Season', 'Teams', 'History']

/** The settings menu under your name. */
export const SETTINGS_DESTINATIONS: readonly { path: string; label: string }[] = [
  { path: '/leagues', label: 'Leagues' },
  { path: '/account', label: 'Account' },
]

export const PRIMARY_DESTINATIONS = NAV_DESTINATIONS.filter((d) => d.tier === 'primary')

export const OVERFLOW_DESTINATIONS = NAV_DESTINATIONS.filter((d) => d.tier === 'overflow')

/** The destinations to list, given whether the selected league has power
 * rankings and whether the user is an admin. */
export function visibleDestinations(
  destinations: readonly NavDestination[],
  { hasPowerRankings, isAdmin }: { hasPowerRankings: boolean; isAdmin: boolean },
): NavDestination[] {
  return destinations.filter((d) => !d.needsPowerRankings || hasPowerRankings || isAdmin)
}

/** The destination a path belongs to, for showing where you are. Settings
 * pages and click-through pages (Box Score) have none. */
export function destinationFor(pathname: string): NavDestination | undefined {
  return NAV_DESTINATIONS.find((d) => pathname === d.path || pathname.startsWith(`${d.path}/`))
}
