import { useEffect, useState } from 'react'
import { fetchLeagueInfo, type LeagueInfo } from '../api'
import { useLeague } from '../contexts/LeagueContext'

/** One request per league per visit: every page that picks a season needs the
 * year list, and This Week needs it before anything else can start. */
const cache = new Map<number, Promise<LeagueInfo>>()

function leagueInfo(leagueId: number): Promise<LeagueInfo> {
  let p = cache.get(leagueId)
  if (!p) {
    p = fetchLeagueInfo(leagueId)
    cache.set(leagueId, p)
    p.catch(() => cache.delete(leagueId))
  }
  return p
}

export function useLeagueYears() {
  const { selectedLeague } = useLeague()
  const leagueId = selectedLeague?.espn_league_id ?? null
  const [years, setYears] = useState<number[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!leagueId) {
      setYears([])
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    leagueInfo(leagueId)
      .then((info) => !cancelled && setYears(info.years))
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [leagueId])

  return {
    leagueId,
    leagueName: selectedLeague?.display_name ?? null,
    years,
    loading,
    error,
  }
}
