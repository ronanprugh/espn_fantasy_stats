import { NavLink } from 'react-router-dom'

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="brand">ESPN Fantasy Stats</div>
      <nav className="sidebar-nav">
        <div className="nav-section">Season Data</div>
        <NavLink to="/" end>
          Season Stats
        </NavLink>
        <NavLink to="/playoffs">Playoff History</NavLink>
        <NavLink to="/scoreboard">Scoreboard</NavLink>

        <div className="nav-section">Team Data</div>
        <NavLink to="/compare">Team Comparison</NavLink>
        <NavLink to="/h2h">Head to Head</NavLink>
      </nav>
    </aside>
  )
}
