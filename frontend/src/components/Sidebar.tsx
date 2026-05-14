import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useLeague } from '../contexts/LeagueContext'

export function Sidebar() {
  const { user, logout } = useAuth()
  const { leagues, selectedLeague, select } = useLeague()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <aside className="sidebar">
      <div className="brand">ESPN Fantasy Stats</div>

      <div className="sidebar-league">
        <label htmlFor="sidebar-league-select">League</label>
        {leagues.length > 0 ? (
          <select
            id="sidebar-league-select"
            value={selectedLeague?.espn_league_id ?? ''}
            onChange={(e) => select(Number(e.target.value))}
          >
            {leagues.map((l) => (
              <option key={l.id} value={l.espn_league_id}>
                {l.display_name}
              </option>
            ))}
          </select>
        ) : (
          <NavLink to="/leagues" className="add-league-link">
            + Add a league
          </NavLink>
        )}
      </div>

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

        <div className="nav-section">Account</div>
        <NavLink to="/leagues">Manage Leagues</NavLink>
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user">{user?.username}</div>
        <button className="sidebar-logout" onClick={handleLogout}>
          Sign out
        </button>
      </div>
    </aside>
  )
}
