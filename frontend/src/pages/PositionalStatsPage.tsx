/**
 * Positional Stats: points each team scored from each lineup position, for a
 * season or summed across every season since 2019 (box scores start then),
 * regular season and playoffs. `?year=` (or `all`) and `?pos=`.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  fetchPositionalStatsAggregate,
  fetchPositionalStatsForYear,
  type LeaguePositionalAggregate,
  type PositionTeamStats,
  type SeasonPositionalStats,
} from '../api'
import { NoLeagueSelected } from '../components/NoLeagueSelected'
import { SortableTh, type SortDir } from '../components/SortableTh'
import { SeasonPicker } from '../components/SeasonPicker'
import { TeamLink } from '../components/TeamLink'
import { isYours, useYourTeam } from '../hooks/useYourTeam'
import { useLeagueYears } from '../hooks/useLeagueYears'
import { useUrlState } from '../hooks/useUrlState'
import { loadSeasons } from '../lib/loadSeasons'
import { TableSkeleton } from '../components/Loading'
import { ErrorMessage } from '../components/ErrorMessage'

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'D/ST']

type YearMode = number | 'all'
type Row = {
  rank: number
  ownerId: string
  label: string
  sublabel: string
  total_points: number
  games_played: number
  avg_ppg: number
  playoff_points: number
  playoff_games: number
  playoff_ppg: number
  seasons?: number
}

type SortKey =
  | 'rank'
  | 'label'
  | 'total_points'
  | 'games_played'
  | 'avg_ppg'
  | 'playoff_points'
  | 'playoff_games'
  | 'playoff_ppg'
  | 'seasons'

export function PositionalStatsPage() {
  const { leagueId, years } = useLeagueYears()
  const yourTeam = useYourTeam()
  // ?year=<year>|all&pos=<position>. With no year, the latest eligible
  // season is shown without being written to the URL.
  const [params, update] = useUrlState()
  const yearParam = params.get('year')
  const posParam = params.get('pos')
  const position = posParam && POSITIONS.includes(posParam) ? posParam : 'QB'
  const setYearMode = (m: YearMode) => update({ year: String(m) })
  const setPosition = (p: string) => update({ pos: p })
  const [seasonData, setSeasonData] = useState<SeasonPositionalStats | null>(null)
  const [aggData, setAggData] = useState<LeaguePositionalAggregate | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('total_points')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const eligibleYears = useMemo(() => years.filter((y) => y >= 2019), [years])

  const urlYear = yearParam === 'all' ? 'all' : yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : null
  const yearMode: YearMode | null =
    urlYear ?? (eligibleYears.length > 0 ? eligibleYears[eligibleYears.length - 1] : null)

  // All Time loads each season first ([done, total] while it does), so the
  // aggregate request that follows is answered from the server's cache: on a
  // cold cache, one request doing every season's box scores could outlast
  // the proxy's timeout.
  const [progress, setProgress] = useState<[number, number] | null>(null)
  const eligibleKey = eligibleYears.join(',')
  useEffect(() => {
    if (!leagueId || yearMode === null) return
    // All Time needs the season list (a direct link can arrive before it):
    // without it, the aggregate would be asked for cold, all at once.
    if (yearMode === 'all' && eligibleYears.length === 0) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setProgress(null)
    const fail = (e: Error) => !cancelled && setError(e.message)
    const done = () => !cancelled && setLoading(false)
    if (yearMode === 'all') {
      loadSeasons(
        eligibleYears,
        (y) => fetchPositionalStatsForYear(leagueId, y),
        (n, total) => !cancelled && setProgress([n, total]),
      )
        .then(() => fetchPositionalStatsAggregate(leagueId))
        .then((d) => {
          if (cancelled) return
          setAggData(d)
          setSeasonData(null)
        })
        .catch(fail)
        .finally(done)
    } else {
      fetchPositionalStatsForYear(leagueId, yearMode)
        .then((d) => {
          if (cancelled) return
          setSeasonData(d)
          setAggData(null)
        })
        .catch(fail)
        .finally(done)
    }
    // Switching season mid-load mustn't show the previous one's numbers.
    return () => {
      cancelled = true
    }
    // `eligibleKey` stands for `eligibleYears`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, yearMode, eligibleKey])

  if (!leagueId) return <NoLeagueSelected />

  if (eligibleYears.length === 0) {
    return (
      <div className="page">
        <header className="page-header">
          <h2>Positional Stats</h2>
        </header>
        <p className="subtitle" style={{ marginTop: 24 }}>
          Positional stats require box-score data (available from 2019 onward).
          This league has no eligible seasons yet.
        </p>
      </div>
    )
  }

  // Build the rows for the currently selected position.
  let rows: Row[] = []
  if (yearMode === 'all' && aggData) {
    const block = aggData.positions.find((p) => p.position === position)
    rows = (block?.owners ?? []).map((o, i) => ({
      rank: i + 1,
      ownerId: o.owner_id,
      label: o.current_team_name,
      sublabel: o.owner_name,
      total_points: o.total_points,
      games_played: o.games_played,
      avg_ppg: o.avg_ppg,
      playoff_points: o.playoff_points,
      playoff_games: o.playoff_games,
      playoff_ppg: o.playoff_ppg,
      seasons: o.seasons_with_data,
    }))
  } else if (seasonData) {
    const block = seasonData.positions.find((p) => p.position === position)
    rows = (block?.teams ?? []).map((t: PositionTeamStats, i) => ({
      rank: i + 1,
      ownerId: t.owner_id,
      label: t.team_name,
      sublabel: t.owner_name,
      total_points: t.total_points,
      games_played: t.games_played,
      avg_ppg: t.avg_ppg,
      playoff_points: t.playoff_points,
      playoff_games: t.playoff_games,
      playoff_ppg: t.playoff_ppg,
    }))
  }

  // Sort rows by selected column.
  const sorted = [...rows].sort((a, b) => {
    let va: string | number
    let vb: string | number
    switch (sortKey) {
      case 'rank':
        va = a.rank
        vb = b.rank
        break
      case 'label':
        va = a.label
        vb = b.label
        break
      case 'seasons':
        va = a.seasons ?? 0
        vb = b.seasons ?? 0
        break
      default:
        va = (a[sortKey] as number) ?? 0
        vb = (b[sortKey] as number) ?? 0
    }
    const cmp =
      typeof va === 'number' && typeof vb === 'number'
        ? va - vb
        : String(va).localeCompare(String(vb))
    return sortDir === 'asc' ? cmp : -cmp
  })

  const handleSort = (key: SortKey) => {
    const ASC_DEFAULT: SortKey[] = ['rank', 'label']
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir(ASC_DEFAULT.includes(key) ? 'asc' : 'desc')
    }
  }


  // Weeks ESPN wouldn't serve are left out of the totals until the server
  // retries them (after its next refresh point); say so rather than show
  // short totals as if they were complete.
  const missing: [number, number[]][] =
    yearMode === 'all'
      ? Object.entries(aggData?.missing_weeks ?? {}).map(([y, ws]) => [Number(y), ws])
      : seasonData?.missing_weeks?.length
        ? [[seasonData.year, seasonData.missing_weeks]]
        : []
  const missingNote = missing.length
    ? `ESPN didn't return ${missing
        .map(([y, ws]) => `week${ws.length === 1 ? '' : 's'} ${ws.join(', ')} of ${y}`)
        .join('; ')}, so ${missing.length === 1 && missing[0][1].length === 1 ? "that week's games are" : 'those games are'} left out for now. They're filled in on a later visit.`
    : null

  return (
    <div className="page">
      <header className="page-header">
        <h2>Positional Stats</h2>
      </header>

      <SeasonPicker
        years={eligibleYears}
        value={yearMode}
        onChange={setYearMode}
        leading={[{ value: 'all' as const, label: 'All Time' }]}
      />

      <nav className="hub-tabs">
        {POSITIONS.map((p) => (
          <button
            key={p}
            onClick={() => setPosition(p)}
            className={p === position ? 'active' : ''}
          >
            {p}
          </button>
        ))}
      </nav>

      {error && <ErrorMessage message={error} />}
      {loading && progress && progress[1] > 1 && (
        <p className="subtitle">
          Loading season {Math.min(progress[0] + 1, progress[1])} of {progress[1]}…
        </p>
      )}
      {loading && <TableSkeleton rows={10} cols={7} />}
      {!loading && missingNote && <p className="subtitle">{missingNote}</p>}

      {!loading && rows.length === 0 && !error && (
        <p className="subtitle" style={{ marginTop: 16 }}>
          No data for {position} in this view.
        </p>
      )}

      {!loading && rows.length > 0 && (
        <div className="teams-wrap">
          <table className="teams">
            <thead>
              <tr>
                <SortableTh sortKey="rank" activeKey={sortKey} dir={sortDir} onClick={handleSort}
                  numeric>
                  #
                </SortableTh>
                <SortableTh sortKey="label" activeKey={sortKey} dir={sortDir} onClick={handleSort}>
                  {yearMode === 'all' ? 'Owner / Team' : 'Team'}
                </SortableTh>
                {yearMode === 'all' && (
                  <SortableTh
                    sortKey="seasons"
                    activeKey={sortKey}
                    dir={sortDir}
                    onClick={handleSort}
                  numeric
                    title="Seasons with box-score data"
                  >
                    Sns
                  </SortableTh>
                )}
                <SortableTh
                  sortKey="total_points"
                  activeKey={sortKey}
                  dir={sortDir}
                  onClick={handleSort}
                  numeric
                  title="Total points scored at this position"
                >
                  Total Pts
                </SortableTh>
                <SortableTh
                  sortKey="games_played"
                  activeKey={sortKey}
                  dir={sortDir}
                  onClick={handleSort}
                  numeric
                  title="Games where a starter was rostered at this position"
                >
                  GP
                </SortableTh>
                <SortableTh
                  sortKey="avg_ppg"
                  activeKey={sortKey}
                  dir={sortDir}
                  onClick={handleSort}
                  numeric
                  title="Average points per game at this position"
                >
                  PPG
                </SortableTh>
                <SortableTh
                  sortKey="playoff_points"
                  activeKey={sortKey}
                  dir={sortDir}
                  onClick={handleSort}
                  numeric
                  title="Points scored in weeks after the regular season"
                >
                  Playoff Pts
                </SortableTh>
                <SortableTh
                  sortKey="playoff_games"
                  activeKey={sortKey}
                  dir={sortDir}
                  onClick={handleSort}
                  numeric
                  title="Number of playoff-week games played"
                >
                  Playoff GP
                </SortableTh>
                <SortableTh
                  sortKey="playoff_ppg"
                  activeKey={sortKey}
                  dir={sortDir}
                  onClick={handleSort}
                  numeric
                  title="Playoff points per game"
                >
                  Playoff PPG
                </SortableTh>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.label + r.sublabel} className={isYours(yourTeam, r.ownerId) ? 'your-team' : undefined}>
                  <td className="num">{r.rank}</td>
                  <td>
                    <div>
                      <TeamLink ownerId={r.ownerId} year={yearMode === 'all' ? null : yearMode}>
                        {r.label}
                      </TeamLink>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.sublabel}</div>
                  </td>
                  {yearMode === 'all' && <td className="num">{r.seasons}</td>}
                  <td className="num">{r.total_points.toFixed(1)}</td>
                  <td className="num">{r.games_played}</td>
                  <td className="num">{r.avg_ppg.toFixed(2)}</td>
                  <td className="num">{r.playoff_points.toFixed(1)}</td>
                  <td className="num">{r.playoff_games}</td>
                  <td className="num">{r.playoff_ppg.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
