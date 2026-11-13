/**
 * Where the front page sends you, from its query string.
 *
 * `/` used to be Season Stats, with the view in `?view=`: nothing for All
 * Time, `seasons` for Every Season, a year for one season's standings. That
 * page is now Standings and All-Time, so old bookmarks and shared links land
 * on the equivalent new page:
 *
 *   /?view=2024     → /standings?year=2024
 *   /?view=seasons  → /all_time?view=seasons
 *   /?view=         → /all_time   (any other value meant All Time too)
 *   /               → /standings  (the front page until This Week exists)
 */
export function frontPageTarget(search: string): string {
  const view = new URLSearchParams(search).get('view')
  if (view === null) return '/standings'
  if (/^\d{4}$/.test(view)) return `/standings?year=${view}`
  if (view === 'seasons') return '/all_time?view=seasons'
  return '/all_time'
}
