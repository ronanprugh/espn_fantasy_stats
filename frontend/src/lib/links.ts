/**
 * Links between pages, built in one place so every page agrees on the query
 * parameters each page reads.
 */

export type TeamHubTab = 'summary' | 'roster' | 'schedule' | 'power'

/** A team's Team Hub, on a season when the context is a single season. */
export function teamHubHref(ownerId: string, opts: { year?: number | null; tab?: TeamHubTab } = {}): string {
  const params = new URLSearchParams({ team: ownerId })
  if (opts.year != null) params.set('year', String(opts.year))
  if (opts.tab && opts.tab !== 'summary') params.set('tab', opts.tab)
  return `/team_hub?${params}`
}

/** Head to Head between two owners, `a` on the left. */
export function headToHeadHref(ownerA: string, ownerB: string): string {
  return `/h2h?${new URLSearchParams({ a: ownerA, b: ownerB })}`
}
