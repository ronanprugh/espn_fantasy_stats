import { Fragment, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { TeamLink } from './TeamLink'
import { isYours, useYourTeam } from '../hooks/useYourTeam'
import type { CloseGameRecord, CloseGames, SeasonTeams, Team } from '../api'
import {
  computeSeasonStats,
  formatRate,
  formatRecord,
  isInProgress,
  type TeamSeasonStats,
} from '../lib/seasonStats'
import type { OwnerSeasonPr } from '../lib/powerRankings'
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
  /** Absent when the league has no power rankings for that season. */
  pr: OwnerSeasonPr | undefined
}

type SortKey =
  | 'year'
  | 'scoring'
  | 'finish'
  | 'team_name'
  | 'owner'
  | 'team'
  | 'record'
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
  | 'pr_avg'
  | 'pr_pre'
  | 'pr_at1'

const ASC_BY_DEFAULT: Set<SortKey> = new Set([
  'finish', 'team_name', 'owner', 'team', 'scoring', 'std_dev', 'pr_avg', 'pr_pre',
])
const TEXT_COLUMNS: Set<SortKey> = new Set(['team_name', 'owner', 'team', 'scoring'])

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
    case 'team':
      return t.team_name
    case 'record':
      // Net wins, ties as half: the same order as win % within a season.
      return t.wins - t.losses + t.ties / 2
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
    case 'pr_avg':
      return r.pr?.avgRank ?? null
    case 'pr_pre':
      return r.pr?.preseasonRank ?? null
    case 'pr_at1':
      return r.pr?.weeks ? r.pr.weeksAt1 : null
  }
}

/** A W–L(–T) record with en dashes, for the Standings Record column. */
const recordLabel = (t: Team) => `${t.wins}–${t.losses}${t.ties ? `–${t.ties}` : ''}`

/* Column orders.
 *
 * Standings (one season) leads with what people come for — place, team,
 * record — and keeps the advanced columns behind "More stats". Every Season
 * keeps its cross-season order for now (#29 reworks it). Power-rank columns
 * follow the basics in either, when the league has rankings. */
type ColumnKey = SortKey
const STANDINGS_BASIC: ColumnKey[] = [
  'finish', 'team', 'record', 'win_pct', 'points_for', 'points_against',
  'avg_points_for', 'avg_points_against', 'avg_plus_minus',
]
const STANDINGS_MORE: ColumnKey[] = [
  'pts_vs_avg', 'all_play', 'luck', 'high', 'low', 'top_weeks', 'std_dev', 'close',
  'playoff_wins', 'playoff_losses',
]
const HISTORY: ColumnKey[] = [
  'year', 'owner', 'points_for', 'pts_vs_avg', 'all_play', 'luck', 'high', 'low',
  'top_weeks', 'std_dev', 'close', 'scoring', 'finish', 'wins', 'losses', 'ties',
  'win_pct', 'playoff_wins', 'playoff_losses', 'points_against', 'avg_points_for',
  'avg_points_against', 'avg_plus_minus',
]
const PR_COLUMNS: ColumnKey[] = ['pr_avg', 'pr_pre', 'pr_at1']

/** Columns pinned to the left while the rest scroll (Standings): their cells
 * get these classes, which .teams-wrap.sticky in styles.css positions. */
const STICKY: Partial<Record<ColumnKey, string>> = {
  finish: 'sticky-col sticky-1',
  team: 'sticky-col sticky-2',
}

export function SeasonHistoryTable({
  seasons,
  closeGames,
  singleSeason = false,
  showMore = false,
  powerRankings,
}: {
  seasons: SeasonTeams[]
  closeGames: CloseGamesState
  /** Power rankings by `${year}:${owner_id}`; the columns show only when given. */
  powerRankings?: Map<string, OwnerSeasonPr>
  /** One season's standings rather than a cross-season ranking: sorted by
   * finish, led by Finish · Team · Record with the names pinned, without the
   * Year and Scoring columns (constant within a season), and without the
   * in-progress tint, which would cover every row. */
  singleSeason?: boolean
  /** Standings only: also show the advanced columns ("More stats"). */
  showMore?: boolean
}) {
  const yourTeam = useYourTeam()
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
        pr: team.owners[0] ? powerRankings?.get(`${s.year}:${team.owners[0].id}`) : undefined,
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

  const margin = closeGames.status === 'ready' ? closeGames.data.margin : 5
  const closeCell = (r: SeasonRow) => {
    if (closeGames.status === 'loading') return '…'
    if (closeGames.status === 'error' || !r.close) return '—'
    return formatRecord(r.close.wins, r.close.losses, r.close.ties)
  }

  const tone = (x: number | undefined) => (x === undefined ? '' : x >= 0 ? 'pos' : 'neg')

  /** Each column's header (label and tooltip) and cell. `cls` carries any
   * extra cell classes, such as the sticky ones. */
  const COLUMNS: Record<ColumnKey, { label: string; title?: string; cell: (r: SeasonRow, cls: string) => ReactNode }> = {
    year: { label: 'Year', cell: (r, c) => <td className={`num ${c}`}>{r.year}</td> },
    owner: {
      label: 'Owner',
      cell: (r, c) => (
        <td className={c}>
          <TeamLink ownerId={r.team.owners[0]?.id} year={r.year} className="truncate">
            <span title={ownerName(r.team) || undefined}>{ownerName(r.team) || '—'}</span>
          </TeamLink>
        </td>
      ),
    },
    team: {
      label: 'Team',
      cell: (r, c) => (
        <td className={`team-cell ${c}`}>
          <TeamLink ownerId={r.team.owners[0]?.id} year={r.year} className="team-cell-name">
            <span title={r.team.team_name}>{r.team.team_name}</span>
          </TeamLink>
          <span className="team-cell-owner">{ownerName(r.team)}</span>
        </td>
      ),
    },
    team_name: {
      label: 'Name',
      cell: (r, c) => (
        <td className={c}>
          <TeamLink ownerId={r.team.owners[0]?.id} year={r.year} className="truncate">
            <span title={r.team.team_name}>{r.team.team_name}</span>
          </TeamLink>
        </td>
      ),
    },
    points_for: {
      label: 'PF',
      title: 'Total points scored in the regular season.',
      cell: (r, c) => <td className={`num ${c}`}>{r.team.points_for.toFixed(1)}</td>,
    },
    pts_vs_avg: {
      label: 'vs Avg',
      title:
        'Points per game compared with the league average that season. +10% means ' +
        'scoring 10% more than the average team. Fair across PPR and standard years.',
      cell: (r, c) => (
        <td className={`num ${tone(r.stats?.ptsVsAvg)} ${c}`}>
          {r.stats ? `${signed(r.stats.ptsVsAvg * 100, 1)}%` : '—'}
        </td>
      ),
    },
    all_play: {
      label: 'All-Play',
      title:
        'The record this team would have had playing every other team every week. ' +
        'It removes schedule luck and shows how strong the scoring really was.',
      cell: (r, c) => {
        const s = r.stats
        return (
          <td className={`num ${c}`} title={s ? `${formatRate(s.allPlayPct)} all-play win rate` : undefined}>
            {s ? formatRecord(s.allPlayWins, s.allPlayLosses, s.allPlayTies) : '—'}
          </td>
        )
      },
    },
    luck: {
      label: 'Luck',
      title:
        'Actual wins minus the wins the all-play record predicts. +2.0 means two more ' +
        'wins than the scoring earned (lucky); negative means unlucky.',
      cell: (r, c) => <td className={`num ${tone(r.stats?.luck)} ${c}`}>{r.stats ? signed(r.stats.luck, 1) : '—'}</td>,
    },
    high: {
      label: 'High',
      title: 'Highest single-week score in the regular season.',
      cell: (r, c) => (
        <td className={`num ${c}`} title={r.stats ? `Week ${r.stats.highWeek}` : undefined}>
          {r.stats ? r.stats.highScore.toFixed(1) : '—'}
        </td>
      ),
    },
    low: {
      label: 'Low',
      title: 'Lowest single-week score in the regular season.',
      cell: (r, c) => (
        <td className={`num ${c}`} title={r.stats ? `Week ${r.stats.lowWeek}` : undefined}>
          {r.stats ? r.stats.lowScore.toFixed(1) : '—'}
        </td>
      ),
    },
    top_weeks: {
      label: 'Top Wks',
      title: "Weeks this team posted the league's highest score.",
      cell: (r, c) => <td className={`num ${c}`}>{r.stats ? r.stats.topScorerWeeks : '—'}</td>,
    },
    std_dev: {
      label: 'Std Dev',
      title:
        'Standard deviation of weekly scores, in points. Low means consistent; ' +
        'high means boom-or-bust.',
      cell: (r, c) => <td className={`num ${c}`}>{r.stats ? r.stats.stdDev.toFixed(1) : '—'}</td>,
    },
    close: {
      label: 'Close',
      title:
        `Record in regular-season games decided by fewer than ${margin} points. ` +
        'Sorts by close wins minus close losses.',
      cell: (r, c) => <td className={`num ${c}`}>{closeCell(r)}</td>,
    },
    scoring: {
      label: 'Scoring',
      title:
        "The league's scoring format that season. PPR gives a point per reception, " +
        'Half PPR half a point, Standard none, so raw points are only comparable ' +
        'within the same format. Use vs Avg to compare across formats.',
      cell: (r, c) => <td className={c}>{SCORING_LABEL[r.scoring_type]}</td>,
    },
    finish: {
      label: 'Finish',
      title:
        'Final place after the playoffs; 1 is the champion. For a season still in ' +
        'progress, the current regular-season standing.',
      cell: (r, c) => <td className={`num ${c}`}>{finishOf(r.team)}</td>,
    },
    record: {
      label: 'Record',
      title: 'Regular-season wins–losses, with ties last when there are any.',
      cell: (r, c) => <td className={`num ${c}`}>{recordLabel(r.team)}</td>,
    },
    wins: { label: 'W', title: 'Regular-season wins.', cell: (r, c) => <td className={`num ${c}`}>{r.team.wins}</td> },
    losses: { label: 'L', title: 'Regular-season losses.', cell: (r, c) => <td className={`num ${c}`}>{r.team.losses}</td> },
    ties: { label: 'T', title: 'Regular-season ties.', cell: (r, c) => <td className={`num ${c}`}>{r.team.ties}</td> },
    win_pct: {
      label: 'Win %',
      title: 'Regular-season win percentage, with ties counted as half a win.',
      cell: (r, c) => <td className={`num ${c}`}>{r.stats ? formatRate(r.stats.winPct) : '—'}</td>,
    },
    playoff_wins: {
      label: 'PO W',
      title: 'Wins in the championship bracket. Zero for teams that missed the playoffs.',
      cell: (r, c) => <td className={`num ${c}`}>{r.team.playoff_wins}</td>,
    },
    playoff_losses: {
      label: 'PO L',
      title:
        'Losses in the championship bracket: at most one, since a loss ends the run. ' +
        'Consolation games are not counted.',
      cell: (r, c) => <td className={`num ${c}`}>{r.team.playoff_losses}</td>,
    },
    points_against: {
      label: 'PA',
      title: 'Total points opponents scored against this team in the regular season.',
      cell: (r, c) => <td className={`num ${c}`}>{r.team.points_against.toFixed(1)}</td>,
    },
    avg_points_for: {
      label: 'Avg PF',
      title: 'Points scored per regular-season game played.',
      cell: (r, c) => <td className={`num ${c}`}>{r.team.avg_points_for.toFixed(2)}</td>,
    },
    avg_points_against: {
      label: 'Avg PA',
      title: 'Points allowed per regular-season game played.',
      cell: (r, c) => <td className={`num ${c}`}>{r.team.avg_points_against.toFixed(2)}</td>,
    },
    avg_plus_minus: {
      label: 'Avg +/−',
      title:
        'Avg PF minus Avg PA. Positive means the team outscored its opponents on ' +
        'average; negative means it was outscored.',
      cell: (r, c) => (
        <td className={`num ${tone(r.team.avg_plus_minus)} ${c}`}>{signed(r.team.avg_plus_minus, 2)}</td>
      ),
    },
    pr_avg: {
      label: 'Avg PR',
      title: 'Average power rank that season, over the weeks rankings were posted.',
      cell: (r, c) => <td className={`num ${c}`}>{r.pr?.avgRank?.toFixed(2) ?? '—'}</td>,
    },
    pr_pre: {
      label: 'Pre PR',
      title: 'Preseason power rank.',
      cell: (r, c) => <td className={`num ${c}`}>{r.pr?.preseasonRank ?? '—'}</td>,
    },
    pr_at1: {
      label: 'PR #1',
      title: 'Weeks ranked #1 that season.',
      cell: (r, c) => <td className={`num ${c}`}>{r.pr?.weeks ? r.pr.weeksAt1 : '—'}</td>,
    },
  }

  // The second pinned column sits exactly where the first ends. Measured rather
  // than fixed: a fixed width either wastes space or lets the header (with its
  // sort arrow) slide under the next pinned column, depending on the font.
  const wrapRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const wrap = wrapRef.current
    const first = wrap?.querySelector<HTMLElement>('th.sticky-1')
    if (!wrap || !first) return
    const set = () => wrap.style.setProperty('--sticky-1-w', `${first.offsetWidth}px`)
    set()
    const ro = new ResizeObserver(set)
    ro.observe(first)
    return () => ro.disconnect()
  }, [singleSeason])

  const pr = powerRankings ? PR_COLUMNS : []
  const columns: ColumnKey[] = singleSeason
    ? [...STANDINGS_BASIC, ...pr, ...(showMore ? STANDINGS_MORE : [])]
    : [...HISTORY, ...pr, 'team_name']
  const extra = (key: ColumnKey) => (singleSeason ? (STICKY[key] ?? '') : '')

  return (
    <div ref={wrapRef} className={`teams-wrap${singleSeason ? ' sticky' : ''}`}>
      <table className={`teams season-history${singleSeason ? ' standings' : ''}`}>
        <thead>
          <tr>
            {columns.map((key) => (
              <SortableTh
                key={key}
                sortKey={key}
                activeKey={sortKey}
                dir={sortDir}
                onClick={handleSort}
                title={COLUMNS[key].title}
                numeric={!TEXT_COLUMNS.has(key)}
                className={extra(key) || undefined}
              >
                {COLUMNS[key].label}
              </SortableTh>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr
              key={`${r.year}-${r.team.team_id}`}
              className={
                [
                  r.inProgress && !singleSeason && 'current-season',
                  r.team.owners.some((o) => isYours(yourTeam, o.id)) && 'your-team',
                ]
                  .filter(Boolean)
                  .join(' ') || undefined
              }
            >
              {columns.map((key) => (
                <Fragment key={key}>{COLUMNS[key].cell(r, extra(key))}</Fragment>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
