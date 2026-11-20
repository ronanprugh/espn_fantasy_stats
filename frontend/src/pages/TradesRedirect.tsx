import { Navigate, useLocation } from 'react-router-dom'

/** /trades became Transactions (trades are its first tab); old links keep
 * their season. */
export function TradesRedirect() {
  const { search } = useLocation()
  return <Navigate to={`/transactions${search}`} replace />
}
