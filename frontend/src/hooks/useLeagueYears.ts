import { useEffect, useState } from 'react'
import { fetchLeagueInfo } from '../api'
import { useLeague } from '../contexts/LeagueContext'

export function useLeagueYears() {
  const { selectedLeague } = useLeague()
  const [years, setYears] = useState<number[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedLeague) {
      setYears([])
      return
    }
    setLoading(true)
    setError(null)
    fetchLeagueInfo(selectedLeague.espn_league_id)
      .then((info) => setYears(info.years))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [selectedLeague?.espn_league_id])

  return {
    leagueId: selectedLeague?.espn_league_id ?? null,
    leagueName: selectedLeague?.display_name ?? null,
    years,
    loading,
    error,
  }
}
