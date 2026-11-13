import { useMemo } from 'react'
import {
  NAV_DESTINATIONS,
  tabLayout,
  visibleDestinations,
  type NavDestination,
} from '../components/navDestinations'
import { useAuth } from '../contexts/AuthContext'
import { useLeague } from '../contexts/LeagueContext'
import { usePowerRankings } from './usePowerRankings'

type Nav = {
  /** Everything to list in the sidebar: Power Rankings only when the league
   * has rankings, or always for admins. */
  destinations: NavDestination[]
  /** The four phone tabs, and the rest for the More sheet. */
  tabs: NavDestination[]
  overflow: NavDestination[]
}

export function useNavDestinations(): Nav {
  const { user } = useAuth()
  const { selectedLeague } = useLeague()
  const { hasData } = usePowerRankings(selectedLeague?.espn_league_id ?? null)
  const isAdmin = !!user?.is_admin
  return useMemo(() => {
    const destinations = visibleDestinations(NAV_DESTINATIONS, { hasPowerRankings: hasData, isAdmin })
    return { destinations, ...tabLayout(destinations) }
  }, [hasData, isAdmin])
}
