/** Transactions: a list of waiver claims, pickups and drops. */
import type { Move } from '../../api'
import { isYours } from '../../hooks/useYourTeam'
import { dateLabel, KINDS } from './shared'

/** "Waiver claim", "Free-agent pickup", "Drop": one move's kind. */
const kindName = (kind: Move['kind']) => {
  const noun = KINDS.find((k) => k.key === kind)?.noun ?? kind
  return noun.charAt(0).toUpperCase() + noun.slice(1)
}

const players = (ps: Move['added']) =>
  ps.length ? ps.map((p) => `${p.name}${p.position ? ` ${p.position}` : ''}`).join(', ') : '—'

/** Moves, newest first. `showKind` adds a column saying which kind each is,
 * for a list that mixes them. Your team's rows are marked where the team
 * column shows. */
export function MovesTable({
  moves,
  showTeam,
  showKind = false,
  showAdded = true,
  showBids,
  yourTeam,
}: {
  moves: Move[]
  showTeam: boolean
  showKind?: boolean
  showAdded?: boolean
  showBids: boolean
  yourTeam: string | null
}) {
  return (
    <div className="teams-wrap">
      <table className="teams moves-table">
        <thead>
          <tr>
            <th>Date</th>
            <th className="num">Wk</th>
            {showTeam && <th>Team</th>}
            {showKind && <th>Type</th>}
            {showAdded && <th>Added</th>}
            <th>Dropped</th>
            {showBids && <th className="num">Bid</th>}
          </tr>
        </thead>
        <tbody>
          {[...moves]
            .sort((a, b) => b.date - a.date)
            .map((m, i) => (
              <tr key={`${m.date}-${m.team_id}-${i}`} className={showTeam && isYours(yourTeam, m.owner_id) ? 'your-team' : ''}>
                <td className="nowrap">{dateLabel(m.date)}</td>
                <td className="num">{m.week}</td>
                {showTeam && <td className="nowrap">{m.team_name}</td>}
                {showKind && <td className="nowrap">{kindName(m.kind)}</td>}
                {showAdded && <td>{players(m.added)}</td>}
                <td className="muted">{players(m.dropped)}</td>
                {showBids && <td className="num">{m.bid ? `$${m.bid}` : '—'}</td>}
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}
