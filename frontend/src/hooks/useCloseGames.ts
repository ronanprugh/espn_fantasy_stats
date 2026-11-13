import { useEffect, useState } from 'react'
import { fetchCloseGames } from '../api'
import type { CloseGamesState } from '../components/SeasonHistoryTable'

/**
 * The close-games column for SeasonHistoryTable.
 *
 * It needs every season's matchup list, which can mean an ESPN fetch per year
 * on a cold cache. Callers request it alongside their table but never wait on
 * it: the table renders first and this column fills in. Fetched only while
 * `enabled`, and only once per league.
 */
export function useCloseGames(leagueId: number | null, enabled = true): CloseGamesState {
  const [closeGames, setCloseGames] = useState<CloseGamesState>({ status: 'loading' })

  useEffect(() => {
    if (!leagueId || !enabled) return
    if (closeGames.status === 'ready' && closeGames.data.league_id === leagueId) return
    let cancelled = false
    setCloseGames({ status: 'loading' })
    fetchCloseGames(leagueId)
      .then((data) => !cancelled && setCloseGames({ status: 'ready', data }))
      .catch(() => !cancelled && setCloseGames({ status: 'error' }))
    return () => {
      cancelled = true
    }
    // closeGames is read only to skip a refetch; depending on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, enabled])

  return closeGames
}
