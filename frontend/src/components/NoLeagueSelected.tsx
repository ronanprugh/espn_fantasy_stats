import { Link } from 'react-router-dom'

export function NoLeagueSelected() {
  return (
    <div className="no-league">
      <p className="subtitle">No league selected.</p>
      <p>
        Pick one from the sidebar, or <Link to="/leagues">add one</Link>.
      </p>
    </div>
  )
}
