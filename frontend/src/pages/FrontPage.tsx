import { Navigate, useLocation } from 'react-router-dom'
import { frontPageTarget } from '../lib/legacyRoutes'

/**
 * The index route. It has no page of its own yet: it opens Standings, and
 * sends old Season Stats links (`/?view=…`) to their new page. See
 * frontPageTarget for the mapping.
 */
export function FrontPage() {
  const { search } = useLocation()
  return <Navigate to={frontPageTarget(search)} replace />
}
