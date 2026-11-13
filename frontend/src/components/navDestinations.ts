/**
 * The navigation destinations, in menu order.
 *
 * Single source of truth for the desktop sidebar, the mobile bottom tab bar and
 * the More sheet. Before this existed the sidebar held the destinations as
 * literal JSX, which meant a new route had to be added in several places to be
 * reachable on every shell — the tab bar would silently lack it.
 *
 * This Week (the front page) comes first, on its own; the rest are grouped
 * by what people come to do, not by data type. Below 900px four
 * destinations get a tab and the rest live in the More sheet: four tabs plus
 * the More trigger is what fits at 320px with 44px targets. Which four is
 * decided by tabLayout.
 *
 * Leagues and Account are rarely opened, so they are not in the main list:
 * they live in SETTINGS_DESTINATIONS, under your name in the sidebar footer and
 * at the bottom of the More sheet.
 *
 * Enforced by navDestinations.test.ts: always four tabs, every path registered
 * as a route in main.tsx, and every route listed here.
 */
export type NavGroup = 'This Season' | 'Teams' | 'History'

export type TabIcon = 'week' | 'standings' | 'scores' | 'rankings' | 'h2h' | 'team'

export type NavDestination = {
  path: string
  label: string
  /** Null for This Week, which sits above the groups. */
  group: NavGroup | null
  /** How it looks as a phone tab, for the destinations that can be one: a
   * short label, an icon, and (when the short label is cryptic) the accessible
   * name, which keeps the short label in it. */
  tab?: { label: string; icon: TabIcon; ariaLabel?: string }
  /** Listed only when the league has power rankings, or for admins (who can
   * import them). The route itself always works. */
  needsPowerRankings?: true
}

export const NAV_DESTINATIONS: readonly NavDestination[] = [
  {
    path: '/',
    label: 'This Week',
    group: null,
    tab: { label: 'This Week', icon: 'week' },
  },
  {
    path: '/standings',
    label: 'Standings',
    group: 'This Season',
    tab: { label: 'Standings', icon: 'standings' },
  },
  {
    path: '/scoreboard',
    label: 'Scoreboard',
    group: 'This Season',
    tab: { label: 'Scores', icon: 'scores' },
  },
  {
    path: '/power_rankings',
    label: 'Power Rankings',
    group: 'This Season',
    needsPowerRankings: true,
    tab: { label: 'Rankings', icon: 'rankings' },
  },
  {
    path: '/team_hub',
    label: 'Team Hub',
    group: 'Teams',
    tab: { label: 'My Team', icon: 'team' },
  },
  {
    path: '/h2h',
    label: 'Head to Head',
    group: 'Teams',
    tab: { label: 'H2H', icon: 'h2h', ariaLabel: 'H2H, Head to Head' },
  },
  { path: '/compare', label: 'Trends', group: 'Teams' },
  { path: '/all_time', label: 'All-Time', group: 'History' },
  { path: '/playoffs', label: 'Playoffs', group: 'History' },
  { path: '/positional', label: 'Positional Stats', group: 'History' },
]

export const NAV_GROUPS: readonly NavGroup[] = ['This Season', 'Teams', 'History']

/** The settings menu under your name. */
export const SETTINGS_DESTINATIONS: readonly { path: string; label: string }[] = [
  { path: '/leagues', label: 'Leagues' },
  { path: '/account', label: 'Account' },
]

/**
 * The phone tabs and what's left for the More sheet.
 *
 * Tabs, in order: This Week · Standings · Scores · My Team. This Week carries
 * the latest power rankings, so Rankings lives in More with Head to Head.
 * Everything visible that isn't a tab goes to More, so every destination stays
 * reachable on a phone.
 */
export const TAB_PATHS = ['/', '/standings', '/scoreboard', '/team_hub'] as const

export function tabLayout(visible: readonly NavDestination[]): {
  tabs: NavDestination[]
  overflow: NavDestination[]
} {
  const tabPaths: readonly string[] = TAB_PATHS
  const tabs = tabPaths.map((p) => NAV_DESTINATIONS.find((d) => d.path === p)!)
  const overflow = visible.filter((d) => !tabPaths.includes(d.path))
  return { tabs, overflow }
}

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
