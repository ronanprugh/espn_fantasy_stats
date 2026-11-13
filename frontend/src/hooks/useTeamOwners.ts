import { useCallback, useEffect, useState } from 'react'
import { fetchTeams } from '../api'

/**
 * Who owned each team, by season: ESPN team ids are per season (a slot can
 * change hands), and several responses — scoreboard, box scores, playoffs,
 * Team Hub schedules — carry only team ids. Team Hub links need the owner id.
 *
 * Built from the season's teams, which the server already caches, and cached
 * here per league and season so every page shares one request.
 */
const cache = new Map<string, Promise<Map<number, string>>>()

function ownersFor(leagueId: number, year: number): Promise<Map<number, string>> {
  const key = `${leagueId}:${year}`
  let p = cache.get(key)
  if (!p) {
    p = fetchTeams(leagueId, year).then(
      (s) => new Map(s.teams.filter((t) => t.owners[0]).map((t) => [t.team_id, t.owners[0].id])),
    )
    cache.set(key, p)
    p.catch(() => cache.delete(key))
  }
  return p
}

/** `(year, teamId) => ownerId`, filled in as each season's teams arrive.
 * Unknown until then, so links render as plain text for a moment. */
export function useTeamOwners(
  leagueId: number | null | undefined,
  years: readonly number[],
): (year: number, teamId: number | null | undefined) => string | undefined {
  const [byYear, setByYear] = useState<Map<number, Map<number, string>>>(new Map())
  // A stable key, so callers can pass a fresh array each render.
  const key = [...new Set(years)].sort().join(',')

  useEffect(() => {
    if (!leagueId || !key) return
    let cancelled = false
    for (const y of key.split(',').map(Number)) {
      ownersFor(leagueId, y)
        .then((m) => {
          if (cancelled) return
          setByYear((prev) => (prev.get(y) === m ? prev : new Map(prev).set(y, m)))
        })
        .catch(() => {})
    }
    return () => {
      cancelled = true
    }
  }, [leagueId, key])

  // Owner ids from another league must not leak into this one's links.
  useEffect(() => setByYear(new Map()), [leagueId])

  return useCallback(
    (year: number, teamId: number | null | undefined) =>
      teamId == null ? undefined : byYear.get(year)?.get(teamId),
    [byYear],
  )
}
