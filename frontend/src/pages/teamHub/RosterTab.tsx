/** Team Hub, Roster: the season's final roster, starters first in lineup order. */
import { Fragment } from 'react'
import { type TeamHubPlayer } from '../../api'
import { isStarter, sortRoster } from '../../lib/teamHub'

export function RosterTable({ roster }: { roster: TeamHubPlayer[] }) {
  const sorted = sortRoster(roster)
  const firstBenchIdx = sorted.findIndex((p) => !isStarter(p.lineup_slot))
  return (
    <table className="lineup-table">
      <thead>
        <tr>
          <th>Slot</th>
          <th>Player</th>
          <th>Pos</th>
          <th>NFL</th>
          <th className="right num">Total Pts</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((p, i) => {
          const showDivider = i === firstBenchIdx && firstBenchIdx > 0
          return (
            <Fragment key={p.player_id || i}>
              {showDivider && (
                <tr className="bench-divider">
                  <td colSpan={5}>Bench</td>
                </tr>
              )}
              <tr className={isStarter(p.lineup_slot) ? 'starter' : 'bench'}>
                <td className="slot">{p.lineup_slot}</td>
                <td className="player-name">
                  {p.name || '—'}
                  {p.injury_status && p.injury_status !== 'ACTIVE' && (
                    <span className="injury-tag"> {p.injury_status}</span>
                  )}
                </td>
                <td>{p.position}</td>
                <td>{p.pro_team}</td>
                <td className="points right num">{p.total_points.toFixed(1)}</td>
              </tr>
            </Fragment>
          )
        })}
      </tbody>
    </table>
  )
}
