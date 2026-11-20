/** Team Hub, Schedule: every game of the season, with links to each box score. */
import { Link } from 'react-router-dom'
import { type TeamHubGame } from '../../api'
import { RoundBadge } from '../../components/RoundBadge'
import { boxScoreHref, noBoxScoreReason } from '../../lib/links'
import { type Opponent, type FromHere } from './shared'

export function ScheduleTable({
  schedule,
  year,
  opponent,
  fromHere,
}: {
  schedule: TeamHubGame[]
  year: number
  opponent: Opponent
  fromHere: FromHere
}) {
  return (
    <table className="schedule-table">
      <thead>
        <tr>
          <th className="num">Wk</th>
          <th>Round</th>
          <th>Opponent</th>
          <th className="right num">Score</th>
          <th className="right num">Opp Score</th>
          <th>Result</th>
        </tr>
      </thead>
      <tbody>
        {schedule.map((g) => {
          const won = g.result === 'W'
          const lost = g.result === 'L'
          const unavailable = noBoxScoreReason(year, {
            isBye: g.is_bye,
            unplayed: g.result === 'U',
            opponent: g.opp_team_id,
          })
          // The row's box score link is a cover over the whole row; the
          // opponent's Head to Head link sits above it (see .row-cover).
          return (
            <tr
              key={g.week}
              className={unavailable ? '' : 'clickable-row link-row'}
              title={unavailable ?? undefined}
            >
              <td className="num">
                {!unavailable && (
                  <Link
                    to={boxScoreHref(year, g.week, g.own_team_id, g.opp_team_id!)}
                    state={fromHere}
                    className="row-cover"
                    title="View box score"
                    aria-label={`Box score: week ${g.week} vs ${g.opp_team_name}`}
                  />
                )}
                {g.week}
              </td>
              <td>
                <RoundBadge round={g.round_label} />
              </td>
              <td>
                {g.is_bye ? (
                  <span className="bye-cell">BYE</span>
                ) : (
                  <>
                    <div>{opponent(year, g.opp_team_id, g.opp_team_name)}</div>
                    <div className="opp-owner">{g.opp_owner_name}</div>
                  </>
                )}
              </td>
              <td className="right num">{g.is_bye ? '—' : g.own_score.toFixed(1)}</td>
              <td className="right num">{g.is_bye ? '—' : g.opp_score.toFixed(1)}</td>
              <td>
                {g.is_bye ? (
                  <span className="result-tag bye">BYE</span>
                ) : (
                  <span className={`result-tag ${won ? 'won' : lost ? 'lost' : ''}`}>
                    {g.result}
                  </span>
                )}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
