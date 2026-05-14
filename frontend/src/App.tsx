import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { useAuth } from './contexts/AuthContext'

export default function App() {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <div className="bootstrap-loading">Loading…</div>
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return (
    <div className="layout">
      <Sidebar />
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
