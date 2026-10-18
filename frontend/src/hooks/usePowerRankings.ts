import { useCallback, useEffect, useState } from 'react'
import { fetchPowerRankings, type PowerRankings } from '../api'

/**
 * The league's power rankings, fetched once and shared: Season Stats, Team
 * Hub, Compare, Head to Head and Scoreboard all add a column or badge from the
 * same payload, and each would otherwise refetch it on every visit.
 */
const cache = new Map<number, Promise<PowerRankings>>()

export function invalidatePowerRankings(leagueId: number) {
  cache.delete(leagueId)
}

export function usePowerRankings(leagueId: number | null) {
  const [data, setData] = useState<PowerRankings | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (!leagueId) {
      setData(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    let p = cache.get(leagueId)
    if (!p) {
      p = fetchPowerRankings(leagueId)
      cache.set(leagueId, p)
      p.catch(() => cache.delete(leagueId))
    }
    p.then((d) => !cancelled && setData(d))
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [leagueId, version])

  const reload = useCallback(() => {
    if (leagueId) invalidatePowerRankings(leagueId)
    setVersion((v) => v + 1)
  }, [leagueId])

  /** True once loaded and the league has at least one ranked season. */
  const hasData = !!data && data.seasons.length > 0
  return { data, loading, error, reload, hasData }
}
