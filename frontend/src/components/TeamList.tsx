import { useState } from 'react'
import type { Team } from '../api'
import { SortableTh, type SortDir } from './SortableTh'

type SortKey =
  | 'finish'
  | 'team_id'
  | 'team_name'
  | 'owner'
  | 'wins'
  | 'losses'
  | 'ties'
  | 'playoff_wins'
  | 'playoff_losses'
  | 'points_for'
  | 'points_against'
  | 'avg_points_for'
  | 'avg_points_against'
  | 'avg_plus_minus'

const ASC_BY_DEFAULT: Set<SortKey> = new Set(['finish', 'team_id', 'team_name', 'owner'])

const ownerName = (t: Team): string => {
  const o = t.owners[0]
  return o ? `${o.first_name} ${o.last_name}` : ''
}

const finishOf = (t: Team): number => t.final_standing || t.standing

const valueOf = (t: Team, key: SortKey): string | number => {
  switch (key) {
    case 'finish':
      return finishOf(t)
    case 'team_id':
      return t.team_id
    case 'team_name':
      return t.team_name
    case 'owner':
      return ownerName(t)
    case 'wins':
      return t.wins
    case 'losses':
      return t.losses
    case 'ties':
      return t.ties
    case 'playoff_wins':
      return t.playoff_wins
    case 'playoff_losses':
      return t.playoff_losses
    case 'points_for':
      return t.points_for
    case 'points_against':
      return t.points_against
    case 'avg_points_for':
      return t.avg_points_for
    case 'avg_points_against':
      return t.avg_points_against
    case 'avg_plus_minus':
      return t.avg_plus_minus
  }
}

export function TeamList({ teams }: { teams: Team[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('finish')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(ASC_BY_DEFAULT.has(key) ? 'asc' : 'desc')
    }
  }

  const sorted = [...teams].sort((a, b) => {
    const va = valueOf(a, sortKey)
    const vb = valueOf(b, sortKey)
    const cmp =
      typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb))
    return sortDir === 'asc' ? cmp : -cmp
  })

  const th = (key: SortKey, label: string, title?: string) => (
    <SortableTh
      sortKey={key}
      activeKey={sortKey}
      dir={sortDir}
      onClick={handleSort}
      title={title}
    >
      {label}
    </SortableTh>
  )

  return (
    <div className="teams-wrap">
      <table className="teams">
        <thead>
          <tr>
            {th('finish', 'Finish')}
            {th('team_id', 'Team ID')}
            {th('team_name', 'Name')}
            {th('owner', 'Owner')}
            {th('wins', 'W', 'Wins')}
            {th('losses', 'L', 'Losses')}
            {th('ties', 'T', 'Ties')}
            {th('playoff_wins', 'PO W', 'Playoff Wins')}
            {th('playoff_losses', 'PO L', 'Playoff Losses')}
            {th('points_for', 'PF', 'Points For')}
            {th('points_against', 'PA', 'Points Against')}
            {th('avg_points_for', 'Avg PF', 'Average Points For per regular season game')}
            {th('avg_points_against', 'Avg PA', 'Average Points Against per regular season game')}
            {th('avg_plus_minus', 'Avg +/−', 'Avg PF − Avg PA (positive = scored more than allowed)')}
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => {
            const owner = t.owners[0]
            return (
              <tr key={t.team_id}>
                <td>{finishOf(t)}</td>
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
                  {t.avg_plus_minus >= 0 ? '+' : ''}
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
