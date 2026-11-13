import { useMemo } from 'react'
import { NAV_DESTINATIONS, visibleDestinations, type NavDestination } from '../components/navDestinations'
import { useAuth } from '../contexts/AuthContext'
import { useLeague } from '../contexts/LeagueContext'
import { usePowerRankings } from './usePowerRankings'

/**
 * The destinations to show in the menus for this user and league: Power
 * Rankings only when the league has rankings, or always for admins.
 */
export function useNavDestinations(): NavDestination[] {
  const { user } = useAuth()
  const { selectedLeague } = useLeague()
  const { hasData } = usePowerRankings(selectedLeague?.espn_league_id ?? null)
  const isAdmin = !!user?.is_admin
  return useMemo(
    () => visibleDestinations(NAV_DESTINATIONS, { hasPowerRankings: hasData, isAdmin }),
    [hasData, isAdmin],
  )
}
