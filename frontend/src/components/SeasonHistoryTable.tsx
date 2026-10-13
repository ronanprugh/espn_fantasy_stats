import { useMemo, useState } from 'react'
import type { CloseGameRecord, CloseGames, SeasonTeams, Team } from '../api'
import {
  computeSeasonStats,
  formatRate,
  formatRecord,
  isInProgress,
  type TeamSeasonStats,
} from '../lib/seasonStats'
import { SortableTh, type SortDir } from './SortableTh'

/** Close-game records arrive on their own request, after the table renders. */
export type CloseGamesState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: CloseGames }

/** One team's season, flattened out of its year so seasons can be ranked
 * against each other. */
type SeasonRow = {
  year: number
  scoring_type: SeasonTeams['scoring_type']
  team: Team
  /** Partial-season numbers, highlighted so they aren't read as final. */
  inProgress: boolean
  /** Absent for a season with no completed games. */
  stats: TeamSeasonStats | undefined
  /** Absent until the close-games request lands. */
  close: CloseGameRecord | undefined
}

type SortKey =
  | 'year'
  | 'scoring'
  | 'finish'
  | 'team_name'
  | 'owner'
  | 'wins'
  | 'losses'
  | 'ties'
  | 'win_pct'
  | 'playoff_wins'
  | 'playoff_losses'
  | 'points_for'
  | 'points_against'
  | 'avg_points_for'
  | 'avg_points_against'
  | 'avg_plus_minus'
  | 'pts_vs_avg'
  | 'all_play'
  | 'luck'
  | 'high'
  | 'low'
  | 'top_weeks'
  | 'std_dev'
  | 'close'

const ASC_BY_DEFAULT: Set<SortKey> = new Set(['finish', 'team_name', 'owner', 'scoring', 'std_dev'])
const TEXT_COLUMNS: Set<SortKey> = new Set(['team_name', 'owner', 'scoring'])

export const SCORING_LABEL: Record<SeasonTeams['scoring_type'], string> = {
  ppr: 'PPR',
  half_ppr: 'Half PPR',
  standard: 'Standard',
}

const ownerName = (t: Team): string => {
  const o = t.owners[0]
  return o ? `${o.first_name} ${o.last_name}` : ''
}

const finishOf = (t: Team): number => t.final_standing || t.standing

const signed = (x: number, digits: number) => `${x >= 0 ? '+' : ''}${x.toFixed(digits)}`

const valueOf = (r: SeasonRow, key: SortKey): string | number | null => {
  const { team: t, stats: s } = r
  switch (key) {
    case 'year':
      return r.year
    case 'scoring':
      return SCORING_LABEL[r.scoring_type]
    case 'finish':
      return finishOf(t)
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
    case 'win_pct':
      return s?.winPct ?? null
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
    case 'pts_vs_avg':
      return s?.ptsVsAvg ?? null
    case 'all_play':
      return s?.allPlayPct ?? null
    case 'luck':
      return s?.luck ?? null
    case 'high':
      return s?.highScore ?? null
    case 'low':
      return s?.lowScore ?? null
    case 'top_weeks':
      return s?.topScorerWeeks ?? null
    case 'std_dev':
      return s?.stdDev ?? null
    case 'close':
      // Net close wins: a 5-0 record should outrank 1-0, which win % wouldn't do.
      return r.close ? r.close.wins - r.close.losses : null
  }
}

export function SeasonHistoryTable({
  seasons,
  closeGames,
  singleSeason = false,
}: {
  seasons: SeasonTeams[]
  closeGames: CloseGamesState
  /** One season's standings rather than a cross-season ranking: sorted by
   * finish, without the Year and Scoring columns (constant within a season),
   * and without the in-progress tint, which would cover every row. */
  singleSeason?: boolean
}) {
  // Across seasons, Avg PF rather than total PF: regular-season length can
  // differ between years, and totals would favour the longer seasons.
  const [sortKey, setSortKey] = useState<SortKey>(singleSeason ? 'finish' : 'avg_points_for')
  const [sortDir, setSortDir] = useState<SortDir>(singleSeason ? 'asc' : 'desc')

  const statsByYear = useMemo(
    () => new Map(seasons.map((s) => [s.year, computeSeasonStats(s)])),
    [seasons],
  )

  const closeByYear = useMemo(() => {
    if (closeGames.status !== 'ready') return null
    return new Map(
      closeGames.data.seasons.map((s) => [s.year, new Map(s.records.map((r) => [r.team_id, r]))]),
    )
  }, [closeGames])

  const rows: SeasonRow[] = seasons.flatMap((s) => {
    const inProgress = isInProgress(s)
    return s.teams.map((team) => {
      const yearClose = closeByYear?.get(s.year)
      return {
        year: s.year,
        scoring_type: s.scoring_type,
        team,
        inProgress,
        stats: statsByYear.get(s.year)?.get(team.team_id),
        // A team with no close games is missing from the response, not 0-0.
        close: yearClose
          ? (yearClose.get(team.team_id) ?? { team_id: team.team_id, wins: 0, losses: 0, ties: 0 })
          : undefined,
      }
    })
  })

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(ASC_BY_DEFAULT.has(key) ? 'asc' : 'desc')
    }
  }

  const sorted = [...rows].sort((a, b) => {
    const va = valueOf(a, sortKey)
    const vb = valueOf(b, sortKey)
    // Missing values sink regardless of direction, so a season with no games
    // played can't top an ascending sort.
    if (va === null || vb === null) return va === vb ? 0 : va === null ? 1 : -1
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
      numeric={!TEXT_COLUMNS.has(key)}
    >
      {label}
    </SortableTh>
  )

  const margin = closeGames.status === 'ready' ? closeGames.data.margin : 5
  const closeCell = (r: SeasonRow) => {
    if (closeGames.status === 'loading') return '…'
    if (closeGames.status === 'error' || !r.close) return '—'
    return formatRecord(r.close.wins, r.close.losses, r.close.ties)
  }

  return (
    <div className="teams-wrap">
      <table className="teams season-history">
        <thead>
          <tr>
            {!singleSeason && th('year', 'Year')}
            {th('owner', 'Owner')}
            {th('points_for', 'PF', 'Total points scored in the regular season.')}
            {th(
              'pts_vs_avg',
              'vs Avg',
              "Points per game compared with the league average that season. +10% means " +
                'scoring 10% more than the average team. Fair across PPR and standard years.',
            )}
            {th(
              'all_play',
              'All-Play',
              'The record this team would have had playing every other team every week. ' +
                'It removes schedule luck and shows how strong the scoring really was.',
            )}
            {th(
              'luck',
              'Luck',
              'Actual wins minus the wins the all-play record predicts. +2.0 means two more ' +
                'wins than the scoring earned (lucky); negative means unlucky.',
            )}
            {th('high', 'High', 'Highest single-week score in the regular season.')}
            {th('low', 'Low', 'Lowest single-week score in the regular season.')}
            {th('top_weeks', 'Top Wks', "Weeks this team posted the league's highest score.")}
            {th(
              'std_dev',
              'Std Dev',
              'Standard deviation of weekly scores, in points. Low means consistent; ' +
                'high means boom-or-bust.',
            )}
            {th(
              'close',
              'Close',
              `Record in regular-season games decided by fewer than ${margin} points. ` +
                'Sorts by close wins minus close losses.',
            )}
            {!singleSeason && th(
              'scoring',
              'Scoring',
              "The league's scoring format that season. PPR gives a point per reception, " +
                'Half PPR half a point, Standard none, so raw points are only comparable ' +
                'within the same format. Use vs Avg to compare across formats.',
            )}
            {th(
              'finish',
              'Finish',
              'Final place after the playoffs; 1 is the champion. For a season still in ' +
                'progress, the current regular-season standing.',
            )}
            {th('wins', 'W', 'Regular-season wins.')}
            {th('losses', 'L', 'Regular-season losses.')}
            {th('ties', 'T', 'Regular-season ties.')}
            {th('win_pct', 'Win %', 'Regular-season win percentage, with ties counted as half a win.')}
            {th('playoff_wins', 'PO W', 'Wins in the championship bracket. Zero for teams that missed the playoffs.')}
            {th(
              'playoff_losses',
              'PO L',
              'Losses in the championship bracket: at most one, since a loss ends the run. ' +
                'Consolation games are not counted.',
            )}
            {th('points_against', 'PA', 'Total points opponents scored against this team in the regular season.')}
            {th('avg_points_for', 'Avg PF', 'Points scored per regular-season game played.')}
            {th('avg_points_against', 'Avg PA', 'Points allowed per regular-season game played.')}
            {th(
              'avg_plus_minus',
              'Avg +/−',
              'Avg PF minus Avg PA. Positive means the team outscored its opponents on ' +
                'average; negative means it was outscored.',
            )}
            {th('team_name', 'Name')}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => {
            const { year, scoring_type, team: t, stats: s } = r
            return (
              <tr
                key={`${year}-${t.team_id}`}
                className={r.inProgress && !singleSeason ? 'current-season' : undefined}
              >
                {!singleSeason && <td className="num">{year}</td>}
                <td>
                  <span className="truncate" title={ownerName(t) || undefined}>
                    {ownerName(t) || '—'}
                  </span>
                </td>
                <td className="num">{t.points_for.toFixed(1)}</td>
                <td className={`num ${s ? (s.ptsVsAvg >= 0 ? 'pos' : 'neg') : ''}`}>
                  {s ? `${signed(s.ptsVsAvg * 100, 1)}%` : '—'}
                </td>
                <td className="num" title={s ? `${formatRate(s.allPlayPct)} all-play win rate` : undefined}>
                  {s ? formatRecord(s.allPlayWins, s.allPlayLosses, s.allPlayTies) : '—'}
                </td>
                <td className={`num ${s ? (s.luck >= 0 ? 'pos' : 'neg') : ''}`}>
                  {s ? signed(s.luck, 1) : '—'}
                </td>
                <td className="num" title={s ? `Week ${s.highWeek}` : undefined}>
                  {s ? s.highScore.toFixed(1) : '—'}
                </td>
                <td className="num" title={s ? `Week ${s.lowWeek}` : undefined}>
                  {s ? s.lowScore.toFixed(1) : '—'}
                </td>
                <td className="num">{s ? s.topScorerWeeks : '—'}</td>
                <td className="num">{s ? s.stdDev.toFixed(1) : '—'}</td>
                <td className="num">{closeCell(r)}</td>
                {!singleSeason && <td>{SCORING_LABEL[scoring_type]}</td>}
                <td className="num">{finishOf(t)}</td>
                <td className="num">{t.wins}</td>
                <td className="num">{t.losses}</td>
                <td className="num">{t.ties}</td>
                <td className="num">{s ? formatRate(s.winPct) : '—'}</td>
                <td className="num">{t.playoff_wins}</td>
                <td className="num">{t.playoff_losses}</td>
                <td className="num">{t.points_against.toFixed(1)}</td>
                <td className="num">{t.avg_points_for.toFixed(2)}</td>
                <td className="num">{t.avg_points_against.toFixed(2)}</td>
                <td className={`num ${t.avg_plus_minus >= 0 ? 'pos' : 'neg'}`}>
                  {signed(t.avg_plus_minus, 2)}
                </td>
                <td>
                  <span className="truncate" title={t.team_name}>
                    {t.team_name}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
