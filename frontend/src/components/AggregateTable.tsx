import { useState } from 'react'
import type { OwnerAggregate } from '../api'
import { formatDashRecord } from '../lib/seasonStats'
import type { OwnerPrStats } from '../lib/powerRankings'
import { SortableTh, type SortDir } from './SortableTh'
import { TeamLink } from './TeamLink'
import { isYours, useYourTeam } from '../hooks/useYourTeam'

type SortKey =
  | 'owner'
  | 'avg_finish'
  | 'seasons_played'
  | 'record'
  | 'playoffs'
  | 'points_for'
  | 'points_against'
  | 'avg_points_for'
  | 'avg_points_against'
  | 'avg_plus_minus'
  | 'pr_avg'
  | 'pr_at1'

const ASC_BY_DEFAULT: Set<SortKey> = new Set(['owner', 'avg_finish', 'pr_avg'])

const valueOf = (
  o: OwnerAggregate,
  key: SortKey,
  pr?: Map<string, OwnerPrStats>,
): string | number | null => {
  switch (key) {
    case 'owner':
      return o.owner_name
    case 'avg_finish':
      return o.avg_finish
    case 'seasons_played':
      return o.seasons_played
    case 'record':
      // Net wins, ties as half: win % order for equal numbers of games.
      return o.wins - o.losses + o.ties / 2
    case 'playoffs':
      // Most playoff wins first; fewer losses breaks a tie.
      return o.playoff_wins * 1000 - o.playoff_losses
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
    case 'pr_avg':
      return pr?.get(o.owner_id)?.avgRank ?? null
    case 'pr_at1':
      return pr?.get(o.owner_id)?.weeksAt1 ?? null
  }
}

/**
 * The All Time table: one row per owner, across every season.
 *
 * The owner is the pinned first column, with their most recent team name
 * beneath on one line (hover it for every name they've used), so a row is the
 * same two short lines as Standings however many names an owner has had.
 * Record and Playoffs each fold W/L(/T) into one column.
 */
export function AggregateTable({
  owners,
  powerRankings,
}: {
  owners: OwnerAggregate[]
  /** Power rankings stats by owner; the columns show only when given. */
  powerRankings?: Map<string, OwnerPrStats>
}) {
  const yourTeam = useYourTeam()
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

  // Every column except Owner holds a statistical figure.
  const th = (key: SortKey, label: string, title?: string, className?: string) => (
    <SortableTh
      sortKey={key}
      activeKey={sortKey}
      dir={sortDir}
      onClick={handleSort}
      title={title}
      numeric={key !== 'owner'}
      className={className}
    >
      {label}
    </SortableTh>
  )

  const PINNED = 'sticky-col sticky-1 sticky-edge'

  return (
    <div className="teams-wrap sticky">
      <table className="teams all-time">
        <thead>
          <tr>
            {th('owner', 'Owner', 'The owner, with their most recent team name. Hover the team for every name they have used.', PINNED)}
            {th('avg_finish', 'Avg Finish', 'Average final place across seasons played; lower is better. A season in progress counts its current standing.')}
            {th('seasons_played', 'Sns', 'Seasons played.')}
            {th('record', 'Record', 'Regular-season wins–losses across all seasons, with ties last when there are any.')}
            {th('playoffs', 'Playoffs', 'Championship-bracket wins–losses across all seasons. Consolation games are not counted, and a season has at most one loss, since a loss ends the run.')}
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
            <tr key={o.owner_id} className={isYours(yourTeam, o.owner_id) ? 'your-team' : undefined}>
              <td className={`team-cell ${PINNED}`}>
                <TeamLink ownerId={o.owner_id} className="team-cell-name">
                  {o.owner_name}
                </TeamLink>
                <span className="team-cell-owner team-cell-sub" title={o.team_names.join(' / ')}>
                  {o.team_names[0] ?? ''}
                  {o.team_names.length > 1 && <span className="team-cell-more"> +{o.team_names.length - 1}</span>}
                </span>
              </td>
              <td className="num">{o.avg_finish.toFixed(2)}</td>
              <td className="num">{o.seasons_played}</td>
              <td className="num">{formatDashRecord(o.wins, o.losses, o.ties)}</td>
              <td className="num">{formatDashRecord(o.playoff_wins, o.playoff_losses)}</td>
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
