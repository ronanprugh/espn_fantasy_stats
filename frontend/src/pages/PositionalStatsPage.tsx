import { useEffect, useMemo, useState } from 'react'
import {
  fetchPositionalStatsAggregate,
  fetchPositionalStatsForYear,
  type LeaguePositionalAggregate,
  type PositionOwnerAggregate,
  type PositionTeamStats,
  type SeasonPositionalStats,
} from '../api'
import { NoLeagueSelected } from '../components/NoLeagueSelected'
import { SortableTh, type SortDir } from '../components/SortableTh'
import { useLeagueYears } from '../hooks/useLeagueYears'

const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'K', 'D/ST']

type YearMode = number | 'all'
type Row = {
  rank: number
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
  const [yearMode, setYearMode] = useState<YearMode | null>(null)
  const [position, setPosition] = useState<string>('QB')
  const [seasonData, setSeasonData] = useState<SeasonPositionalStats | null>(null)
  const [aggData, setAggData] = useState<LeaguePositionalAggregate | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sortKey, setSortKey] = useState<SortKey>('total_points')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const eligibleYears = useMemo(() => years.filter((y) => y >= 2019), [years])

  // Default year on first load (latest eligible)
  useEffect(() => {
    if (yearMode === null && eligibleYears.length > 0) {
      setYearMode(eligibleYears[eligibleYears.length - 1])
    }
  }, [eligibleYears, yearMode])

  useEffect(() => {
    if (!leagueId || yearMode === null) return
    setLoading(true)
    setError(null)
    if (yearMode === 'all') {
      fetchPositionalStatsAggregate(leagueId)
        .then((d) => {
          setAggData(d)
          setSeasonData(null)
        })
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false))
    } else {
      fetchPositionalStatsForYear(leagueId, yearMode)
        .then((d) => {
          setSeasonData(d)
          setAggData(null)
        })
        .catch((e: Error) => setError(e.message))
        .finally(() => setLoading(false))
    }
  }, [leagueId, yearMode])

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

  const eligibleYearsDesc = [...eligibleYears].reverse()

  return (
    <div className="page">
      <header className="page-header">
        <h2>Positional Stats</h2>
      </header>

      <nav className="years">
        <button
          onClick={() => setYearMode('all')}
          className={yearMode === 'all' ? 'active' : ''}
        >
          All Time
        </button>
        {eligibleYearsDesc.map((y) => (
          <button
            key={y}
            onClick={() => setYearMode(y)}
            className={yearMode === y ? 'active' : ''}
          >
            {y}
          </button>
        ))}
      </nav>

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

      {error && <p className="error">{error}</p>}
      {loading && <p>Loading…</p>}

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
                <SortableTh sortKey="rank" activeKey={sortKey} dir={sortDir} onClick={handleSort}>
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
                  title="Total points scored at this position"
                >
                  Total Pts
                </SortableTh>
                <SortableTh
                  sortKey="games_played"
                  activeKey={sortKey}
                  dir={sortDir}
                  onClick={handleSort}
                  title="Games where a starter was rostered at this position"
                >
                  GP
                </SortableTh>
                <SortableTh
                  sortKey="avg_ppg"
                  activeKey={sortKey}
                  dir={sortDir}
                  onClick={handleSort}
                  title="Average points per game at this position"
                >
                  PPG
                </SortableTh>
                <SortableTh
                  sortKey="playoff_points"
                  activeKey={sortKey}
                  dir={sortDir}
                  onClick={handleSort}
                  title="Points scored in weeks after the regular season"
                >
                  Playoff Pts
                </SortableTh>
                <SortableTh
                  sortKey="playoff_games"
                  activeKey={sortKey}
                  dir={sortDir}
                  onClick={handleSort}
                  title="Number of playoff-week games played"
                >
                  Playoff GP
                </SortableTh>
                <SortableTh
                  sortKey="playoff_ppg"
                  activeKey={sortKey}
                  dir={sortDir}
                  onClick={handleSort}
                  title="Playoff points per game"
                >
                  Playoff PPG
                </SortableTh>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.label + r.sublabel}>
                  <td>{r.rank}</td>
                  <td>
                    <div>{r.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{r.sublabel}</div>
                  </td>
                  {yearMode === 'all' && <td>{r.seasons}</td>}
                  <td>{r.total_points.toFixed(1)}</td>
                  <td>{r.games_played}</td>
                  <td>{r.avg_ppg.toFixed(2)}</td>
                  <td>{r.playoff_points.toFixed(1)}</td>
                  <td>{r.playoff_games}</td>
                  <td>{r.playoff_ppg.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
