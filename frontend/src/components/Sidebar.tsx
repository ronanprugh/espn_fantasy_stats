import { NavLink } from 'react-router-dom'

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">ESPN Fantasy Stats</div>
      <nav className="sidebar-nav">
        <NavLink to="/" end>
          Season Stats
        </NavLink>
        <NavLink to="/playoffs">Playoff History</NavLink>
      </nav>
    </aside>
  )
}
