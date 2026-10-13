import { Link } from 'react-router-dom'
import { useLeague } from '../contexts/LeagueContext'

export function NoLeagueSelected() {
  const { leagues, loaded } = useLeague()
  // Blank until the list arrives, so a returning member never sees the
  // new-member message flash before their leagues load.
  if (!loaded) return null

  // A new member has no leagues at all, so "pick one from the sidebar" pointed
  // at nothing. Tell them what adding one takes instead.
  if (leagues.length === 0) {
    return (
      <div className="no-league">
        <p className="subtitle">Add your league to get started.</p>
        <p>
          You'll need its ESPN league ID, and for a private league two cookies from ESPN, which
          takes a computer. <Link to="/leagues">Add your league</Link>
        </p>
      </div>
    )
  }

  return (
    <div className="no-league">
      <p className="subtitle">No league selected.</p>
      <p>
        Pick one from the league menu, or <Link to="/leagues">add another</Link>.
      </p>
    </div>
  )
}
