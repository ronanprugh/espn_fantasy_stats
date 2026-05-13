import type { OwnerAggregate } from '../api'

export function AggregateTable({ owners }: { owners: OwnerAggregate[] }) {
  return (
    <div className="teams-wrap">
      <table className="teams">
        <thead>
          <tr>
            <th title="Average finish across all seasons">Avg Finish</th>
            <th>Owner</th>
            <th>Teams</th>
            <th title="Seasons played">Sns</th>
            <th title="Wins">W</th>
            <th title="Losses">L</th>
            <th title="Ties">T</th>
            <th title="Playoff Wins">PO W</th>
            <th title="Playoff Losses">PO L</th>
            <th title="Total Points For">PF</th>
            <th title="Total Points Against">PA</th>
            <th title="Average Points For per game (across all seasons)">Avg PF</th>
            <th title="Average Points Against per game (across all seasons)">Avg PA</th>
            <th title="Avg PF − Avg PA (positive = scored more than allowed)">Avg +/−</th>
          </tr>
        </thead>
        <tbody>
          {owners.map((o) => (
            <tr key={o.owner_id}>
              <td>{o.avg_finish.toFixed(2)}</td>
              <td>{o.owner_name}</td>
              <td title={o.team_names.join(' / ')}>
                {o.team_names.length === 1
                  ? o.team_names[0]
                  : `${o.team_names[0]} +${o.team_names.length - 1}`}
              </td>
              <td>{o.seasons_played}</td>
              <td>{o.wins}</td>
              <td>{o.losses}</td>
              <td>{o.ties}</td>
              <td>{o.playoff_wins}</td>
              <td>{o.playoff_losses}</td>
              <td>{o.points_for.toFixed(1)}</td>
              <td>{o.points_against.toFixed(1)}</td>
              <td>{o.avg_points_for.toFixed(2)}</td>
              <td>{o.avg_points_against.toFixed(2)}</td>
              <td className={o.avg_plus_minus >= 0 ? 'pos' : 'neg'}>
                {o.avg_plus_minus >= 0 ? '+' : ''}
                {o.avg_plus_minus.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
