import { useState } from 'react'
import type { OwnerAggregate } from '../api'
import type { OwnerPrStats } from '../lib/powerRankings'
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
  | 'pr_avg'
  | 'pr_at1'

const ASC_BY_DEFAULT: Set<SortKey> = new Set(['avg_finish', 'owner_name', 'team_names', 'pr_avg'])

const valueOf = (
  o: OwnerAggregate,
  key: SortKey,
  pr?: Map<string, OwnerPrStats>,
): string | number | null => {
  switch (key) {
    case 'pr_avg':
      return pr?.get(o.owner_id)?.avgRank ?? null
    case 'pr_at1':
      return pr?.get(o.owner_id)?.weeksAt1 ?? null
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

export function AggregateTable({
  owners,
  powerRankings,
}: {
  owners: OwnerAggregate[]
  /** Power rankings stats by owner; the columns show only when given. */
  powerRankings?: Map<string, OwnerPrStats>
}) {
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
    const va = valueOf(a, sortKey, powerRankings)
    const vb = valueOf(b, sortKey, powerRankings)
    if (va === null || vb === null) return va === vb ? 0 : va === null ? 1 : -1
    const cmp =
      typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb))
    return sortDir === 'asc' ? cmp : -cmp
  })

  // Every column except Owner and Teams holds a statistical figure.
  const th = (key: SortKey, label: string, title?: string) => (
    <SortableTh
      sortKey={key}
      activeKey={sortKey}
      dir={sortDir}
      onClick={handleSort}
      title={title}
      numeric={key !== 'owner_name' && key !== 'team_names'}
    >
      {label}
    </SortableTh>
  )

  return (
    <div className="teams-wrap">
      <table className="teams">
        <thead>
          <tr>
            {th('avg_finish', 'Avg Finish', 'Average final place across seasons played; lower is better. A season in progress counts its current standing.')}
            {th('owner_name', 'Owner')}
            {th('team_names', 'Teams', 'Team names this owner has used, most recent first.')}
            {th('seasons_played', 'Sns', 'Seasons played.')}
            {th('wins', 'W', 'Regular-season wins across all seasons.')}
            {th('losses', 'L', 'Regular-season losses across all seasons.')}
            {th('ties', 'T', 'Regular-season ties across all seasons.')}
            {th('playoff_wins', 'PO W', 'Championship-bracket wins across all seasons. Consolation games are not counted.')}
            {th('playoff_losses', 'PO L', 'Championship-bracket losses across all seasons: at most one per season, since a loss ends the run.')}
            {th('points_for', 'PF', 'Total regular-season points scored across all seasons.')}
            {th('points_against', 'PA', 'Total regular-season points scored against this owner across all seasons.')}
            {th('avg_points_for', 'Avg PF', 'Points scored per regular-season game across all seasons. Mixes scoring formats if the league has changed them.')}
            {th('avg_points_against', 'Avg PA', 'Points allowed per regular-season game across all seasons.')}
            {th('avg_plus_minus', 'Avg +/−', 'Avg PF minus Avg PA. Positive means the owner outscored opponents on average.')}
            {powerRankings && th('pr_avg', 'Avg PR', 'Average power rank across every posted week. Weeks with no rankings posted are not counted.')}
            {powerRankings && th('pr_at1', 'PR #1', 'Weeks ranked #1 in the power rankings.')}
          </tr>
        </thead>
        <tbody>
          {sorted.map((o) => (
            <tr key={o.owner_id}>
              <td className="num">{o.avg_finish.toFixed(2)}</td>
              <td>{o.owner_name}</td>
              <td title={o.team_names.join(' / ')}>
                {o.team_names.length === 1
                  ? o.team_names[0]
                  : `${o.team_names[0]} +${o.team_names.length - 1}`}
              </td>
              <td className="num">{o.seasons_played}</td>
              <td className="num">{o.wins}</td>
              <td className="num">{o.losses}</td>
              <td className="num">{o.ties}</td>
              <td className="num">{o.playoff_wins}</td>
              <td className="num">{o.playoff_losses}</td>
              <td className="num">{o.points_for.toFixed(1)}</td>
              <td className="num">{o.points_against.toFixed(1)}</td>
              <td className="num">{o.avg_points_for.toFixed(2)}</td>
              <td className="num">{o.avg_points_against.toFixed(2)}</td>
              <td className={`num ${o.avg_plus_minus >= 0 ? 'pos' : 'neg'}`}>
                {o.avg_plus_minus >= 0 ? '+' : ''}
                {o.avg_plus_minus.toFixed(2)}
              </td>
              {powerRankings && (
                <td className="num">{powerRankings.get(o.owner_id)?.avgRank?.toFixed(2) ?? '—'}</td>
              )}
              {powerRankings && <td className="num">{powerRankings.get(o.owner_id)?.weeksAt1 ?? '—'}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
