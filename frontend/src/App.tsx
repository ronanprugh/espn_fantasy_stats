import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { useAuth } from './contexts/AuthContext'

const COLLAPSE_KEY = 'sidebar_collapsed'

export default function App() {
  const { user, loading } = useAuth()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState<boolean>(
    () => window.localStorage.getItem(COLLAPSE_KEY) === 'true',
  )

  useEffect(() => {
    window.localStorage.setItem(COLLAPSE_KEY, String(collapsed))
  }, [collapsed])

  if (loading) {
    return <div className="bootstrap-loading">Loading…</div>
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return (
    <div className={`layout${collapsed ? ' sidebar-collapsed' : ''}`}>
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
