import { Navigate, useLocation } from 'react-router-dom'
import { frontPageTarget } from '../lib/legacyRoutes'
import { ThisWeekPage } from './ThisWeekPage'

/**
 * The index route: This Week. Old Season Stats links (`/?view=…`) still go to
 * their new page; see frontPageTarget for the mapping.
 */
export function FrontPage() {
  const { search } = useLocation()
  const target = frontPageTarget(search)
  return target ? <Navigate to={target} replace /> : <ThisWeekPage />
}
