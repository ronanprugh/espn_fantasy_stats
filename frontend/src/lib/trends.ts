import type { OwnerHistory, OwnerSeason } from '../api'

/**
 * Chart data for Trends (ComparePage).
 *
 * Each plotted series (an owner, or the league average) is split in two keys:
 * - `<key>` holds completed seasons and is drawn solid.
 * - `<key>:cur` holds the season in progress plus the series' latest earlier
 *   point, so the dashed segment joins on where the solid line ends.
 * A league with no season in progress has no `:cur` values at all.
 */

export const AVG_KEY = 'avg'
export const curKey = (key: string) => `${key}:cur`

export type TrendDatum = { year: number } & Record<string, number | null>

/** The season still being played, or null in the offseason. Read from the
 * server's flag, so an older API without it simply marks nothing. */
export function currentYear(owners: OwnerHistory[]): number | null {
  let year: number | null = null
  for (const o of owners) {
    for (const s of o.seasons) {
      if (s.in_progress && (year === null || s.year > year)) year = s.year
    }
  }
  return year
}

function statValue(season: OwnerSeason | undefined, key: keyof OwnerSeason): number | null {
  const v = season?.[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** Mean of the stat across every owner who played that year (not just the
 * ones on the chart), so a lone team has a baseline to read against. */
export function leagueAverageByYear(
  owners: OwnerHistory[],
  years: number[],
  key: keyof OwnerSeason,
): Map<number, number | null> {
  const result = new Map<number, number | null>()
  for (const year of years) {
    let total = 0
    let count = 0
    for (const o of owners) {
      const v = statValue(o.seasons.find((s) => s.year === year), key)
      if (v !== null) {
        total += v
        count += 1
      }
    }
    result.set(year, count ? total / count : null)
  }
  return result
}

/** Rank stats run 1…N, where N is the largest league size in the history,
 * with a tick on every whole place. */
export function rankAxis(owners: OwnerHistory[], years: number[]): { domain: [number, number]; ticks: number[] } {
  let teams = 1
  for (const year of years) {
    const n = owners.filter((o) => o.seasons.some((s) => s.year === year)).length
    teams = Math.max(teams, n)
  }
  return { domain: [1, teams], ticks: Array.from({ length: teams }, (_, i) => i + 1) }
}

/** Splits one series (year → value) into its solid and dashed keys. */
function placeSeries(
  rows: TrendDatum[],
  key: string,
  valueFor: (year: number) => number | null,
  current: number | null,
) {
  let lastCompleted: TrendDatum | null = null
  for (const row of rows) {
    const v = valueFor(row.year)
    row[curKey(key)] = null
    if (row.year === current) {
      row[key] = null
      row[curKey(key)] = v
      if (v !== null && lastCompleted) lastCompleted[curKey(key)] = lastCompleted[key]
    } else {
      row[key] = v
      if (v !== null && (current === null || row.year < current)) lastCompleted = row
    }
  }
}

export function buildTrendData(
  selected: OwnerHistory[],
  allOwners: OwnerHistory[],
  years: number[],
  key: keyof OwnerSeason,
  options: { current: number | null; average: boolean },
): TrendDatum[] {
  const rows: TrendDatum[] = years.map((year) => ({ year }) as TrendDatum)
  for (const o of selected) {
    placeSeries(rows, o.owner_id, (y) => statValue(o.seasons.find((s) => s.year === y), key), options.current)
  }
  if (options.average) {
    const avg = leagueAverageByYear(allOwners, years, key)
    placeSeries(rows, AVG_KEY, (y) => avg.get(y) ?? null, options.current)
  }
  return rows
}

/** A value as the tooltip shows it: whole numbers stay whole. */
export function formatTrendValue(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(2)
}

/** The mean of a stat over an owner's seasons, for the averages beside the
 * chart, leaving out `excludeYear` (the season in progress, for totals and
 * places, which aren't settled until it ends). Null with nothing to average. */
export function seasonAverage(
  seasons: OwnerSeason[],
  key: keyof OwnerSeason,
  excludeYear: number | null,
): number | null {
  const values = seasons
    .filter((s) => s.year !== excludeYear)
    .map((s) => statValue(s, key))
    .filter((v): v is number => v !== null)
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}
