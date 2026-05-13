import type { Team } from '../api'

export function TeamList({ teams }: { teams: Team[] }) {
  const sorted = [...teams].sort((a, b) => {
    const aRank = a.final_standing || a.standing
    const bRank = b.final_standing || b.standing
    return aRank - bRank
  })

  return (
    <table className="teams">
      <thead>
        <tr>
          <th>Rank</th>
          <th>Team</th>
          <th>Owner</th>
          <th>Record</th>
          <th>PF</th>
          <th>PA</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((t) => {
          const rank = t.final_standing || t.standing
          const owner = t.owners[0]
          return (
            <tr key={t.team_id}>
              <td>{rank}</td>
              <td>{t.team_name}</td>
              <td>{owner ? `${owner.first_name} ${owner.last_name}` : '—'}</td>
              <td>
                {t.wins}-{t.losses}
                {t.ties > 0 ? `-${t.ties}` : ''}
              </td>
              <td>{t.points_for.toFixed(1)}</td>
              <td>{t.points_against.toFixed(1)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
