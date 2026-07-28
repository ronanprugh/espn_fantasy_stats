import { useEffect, useState } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { BottomTabBar } from './components/BottomTabBar'
import { MoreSheet } from './components/MoreSheet'
import { Sidebar } from './components/Sidebar'
import { useAuth } from './contexts/AuthContext'

const COLLAPSE_KEY = 'sidebar_collapsed'

export default function App() {
  const { user, loading } = useAuth()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState<boolean>(
    () => window.localStorage.getItem(COLLAPSE_KEY) === 'true',
  )
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => {
    window.localStorage.setItem(COLLAPSE_KEY, String(collapsed))
  }, [collapsed])

  // Picking a destination in the sheet navigates but does not unmount the
  // sheet, so without this it stays open over the page the user just chose.
  useEffect(() => {
    setMoreOpen(false)
  }, [location.pathname])

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
      {/* Both are hidden by CSS above 900px — see the "Bottom tab bar" block in
       * styles.css. No breakpoint detection lives in JS. */}
      <BottomTabBar moreOpen={moreOpen} onMoreClick={() => setMoreOpen((o) => !o)} />
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </div>
  )
}
