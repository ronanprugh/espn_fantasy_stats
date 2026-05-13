import { useState } from 'react'
import type { OwnerAggregate } from '../api'
import { SortableTh, type SortDir } from './SortableTh'

type SortKey =
  | 'avg_finish'
  | 'owner_name'
  | 'team_names'
  | 'seasons_played'
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

const ASC_BY_DEFAULT: Set<SortKey> = new Set(['avg_finish', 'owner_name', 'team_names'])

const valueOf = (o: OwnerAggregate, key: SortKey): string | number => {
  switch (key) {
    case 'avg_finish':
      return o.avg_finish
    case 'owner_name':
      return o.owner_name
    case 'team_names':
      return o.team_names[0] ?? ''
    case 'seasons_played':
      return o.seasons_played
    case 'wins':
      return o.wins
    case 'losses':
      return o.losses
    case 'ties':
      return o.ties
    case 'playoff_wins':
      return o.playoff_wins
    case 'playoff_losses':
      return o.playoff_losses
    case 'points_for':
      return o.points_for
    case 'points_against':
      return o.points_against
    case 'avg_points_for':
      return o.avg_points_for
    case 'avg_points_against':
      return o.avg_points_against
    case 'avg_plus_minus':
      return o.avg_plus_minus
  }
}

export function AggregateTable({ owners }: { owners: OwnerAggregate[] }) {
  const [sortKey, setSortKey] = useState<SortKey>('avg_finish')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(ASC_BY_DEFAULT.has(key) ? 'asc' : 'desc')
    }
  }

  const sorted = [...owners].sort((a, b) => {
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
            {th('avg_finish', 'Avg Finish', 'Average finish across all seasons')}
            {th('owner_name', 'Owner')}
            {th('team_names', 'Teams')}
            {th('seasons_played', 'Sns', 'Seasons played')}
            {th('wins', 'W', 'Wins')}
            {th('losses', 'L', 'Losses')}
            {th('ties', 'T', 'Ties')}
            {th('playoff_wins', 'PO W', 'Playoff Wins')}
            {th('playoff_losses', 'PO L', 'Playoff Losses')}
            {th('points_for', 'PF', 'Total Points For')}
            {th('points_against', 'PA', 'Total Points Against')}
            {th('avg_points_for', 'Avg PF', 'Average Points For per game (across all seasons)')}
            {th('avg_points_against', 'Avg PA', 'Average Points Against per game (across all seasons)')}
            {th('avg_plus_minus', 'Avg +/−', 'Avg PF − Avg PA (positive = scored more than allowed)')}
          </tr>
        </thead>
        <tbody>
          {sorted.map((o) => (
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
