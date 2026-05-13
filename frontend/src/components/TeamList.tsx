import type { Team } from '../api'

export function TeamList({ teams }: { teams: Team[] }) {
  const sorted = [...teams].sort((a, b) => {
    const aRank = a.final_standing || a.standing
    const bRank = b.final_standing || b.standing
    return aRank - bRank
  })

  return (
    <div className="teams-wrap">
      <table className="teams">
        <thead>
          <tr>
            <th>Finish</th>
            <th>Team ID</th>
            <th>Name</th>
            <th>Owner</th>
            <th title="Wins">W</th>
            <th title="Losses">L</th>
            <th title="Ties">T</th>
            <th title="Playoff Wins">PO W</th>
            <th title="Playoff Losses">PO L</th>
            <th title="Points For">PF</th>
            <th title="Points Against">PA</th>
            <th title="Average Points For per regular season game">Avg PF</th>
            <th title="Average Points Against per regular season game">Avg PA</th>
            <th title="Avg PF − Avg PA (positive = scored more than allowed)">Avg +/−</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => {
            const finish = t.final_standing || t.standing
            const owner = t.owners[0]
            return (
              <tr key={t.team_id}>
                <td>{finish}</td>
                <td>{t.team_id}</td>
                <td>{t.team_name}</td>
                <td>{owner ? `${owner.first_name} ${owner.last_name}` : '—'}</td>
                <td>{t.wins}</td>
                <td>{t.losses}</td>
                <td>{t.ties}</td>
                <td>{t.playoff_wins}</td>
                <td>{t.playoff_losses}</td>
                <td>{t.points_for.toFixed(1)}</td>
                <td>{t.points_against.toFixed(1)}</td>
                <td>{t.avg_points_for.toFixed(2)}</td>
                <td>{t.avg_points_against.toFixed(2)}</td>
                <td className={t.avg_plus_minus >= 0 ? 'pos' : 'neg'}>
                  {t.avg_plus_minus > 0 ? '+' : ''}
                  {t.avg_plus_minus.toFixed(2)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
