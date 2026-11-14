import { useEffect, useMemo, useState } from 'react'
import {
  fetchOwnerHistory,
  type LeagueOwnerHistory,
  type OwnerSeason,
} from '../api'
import { COLORS, ComparisonChart } from '../components/ComparisonChart'
import { NoLeagueSelected } from '../components/NoLeagueSelected'
import { TeamLink } from '../components/TeamLink'
import { useLeague } from '../contexts/LeagueContext'
import { BlockSkeleton } from '../components/Loading'
import { ErrorMessage } from '../components/ErrorMessage'
import { useUrlState } from '../hooks/useUrlState'
import { useIsMobile } from '../hooks/useIsMobile'
import { usePowerRankings } from '../hooks/usePowerRankings'
import { ownerSeasonStats } from '../lib/powerRankings'
import { currentYear, seasonAverage } from '../lib/trends'

type StatOption = {
  key: keyof OwnerSeason
  label: string
  /** A place, 1 best: drawn on a 1…N axis, with no league average. */
  rank?: boolean
  yAutoScale?: boolean  // true = don't force zero baseline
  /** Already a per-game (or per-week) figure, so a season in progress is a
   * fair sample and counts in the averages panel. Totals and places aren't:
   * a half season's wins, or a mid-season standing, would drag the average. */
  perGame?: true
}

const STAT_OPTIONS: StatOption[] = [
  { key: 'final_standing', label: 'Final Standing', rank: true, yAutoScale: true },
  { key: 'seed', label: 'Playoff Seed', rank: true, yAutoScale: true },
  { key: 'wins', label: 'Wins' },
  { key: 'losses', label: 'Losses' },
  { key: 'points_for', label: 'Points For (total)', yAutoScale: true },
  { key: 'points_against', label: 'Points Against (total)', yAutoScale: true },
  { key: 'avg_points_for', label: 'Avg Points For', yAutoScale: true, perGame: true },
  { key: 'avg_points_against', label: 'Avg Points Against', yAutoScale: true, perGame: true },
  { key: 'avg_plus_minus', label: 'Avg +/−', yAutoScale: true, perGame: true },
  { key: 'playoff_wins', label: 'Playoff Wins' },
  { key: 'playoff_losses', label: 'Playoff Losses' },
]

/** Offered only when the league has power rankings. */
const PR_STAT_OPTIONS: StatOption[] = [
  { key: 'pr_avg', label: 'Power Rank', rank: true, yAutoScale: true, perGame: true },
  // Set before the season starts, so the current season's is already final.
  { key: 'pr_preseason', label: 'Preseason Power Rank', rank: true, yAutoScale: true, perGame: true },
  { key: 'pr_final', label: 'Final Power Rank', rank: true, yAutoScale: true },
  { key: 'pr_weeks_at_1', label: 'Weeks at #1 (Power Rank)' },
]

export function ComparePage() {
  const { selectedLeague } = useLeague()
  const isMobile = useIsMobile()
  const [rawHistory, setHistory] = useState<LeagueOwnerHistory | null>(null)
  const pr = usePowerRankings(selectedLeague?.espn_league_id ?? null)
  // Power rank stats merged into each owner-season so the chart and averages
  // treat them like every other stat. Seasons with no rankings stay null.
  const history = useMemo<LeagueOwnerHistory | null>(() => {
    if (!rawHistory || !pr.hasData || !pr.data) return rawHistory
    const bySeason = ownerSeasonStats(pr.data)
    return {
      ...rawHistory,
      owners: rawHistory.owners.map((o) => ({
        ...o,
        seasons: o.seasons.map((s) => {
          const r = bySeason.get(`${s.year}:${o.owner_id}`)
          const ranked = !!r && r.weeks > 0
          return {
            ...s,
            pr_avg: ranked ? r!.avgRank : null,
            pr_preseason: ranked ? r!.preseasonRank : null,
            pr_final: ranked ? r!.finalRank : null,
            pr_weeks_at_1: ranked ? r!.weeksAt1 : null,
          }
        }),
      })),
    }
  }, [rawHistory, pr.data, pr.hasData])
  const statOptions = pr.hasData ? [...STAT_OPTIONS, ...PR_STAT_OPTIONS] : STAT_OPTIONS
  // ?teams=<id>,<id>&stat=<key>. Memoised on the raw string so the list
  // keeps its identity between renders.
  const [params, update] = useUrlState()
  const teamsParam = params.get('teams') ?? ''
  const selected = useMemo(() => teamsParam.split(',').filter(Boolean), [teamsParam])
  const setSelected = (ids: string[]) => update({ teams: ids.length ? ids.join(',') : null })
  const statParam = params.get('stat')
  const statKey: keyof OwnerSeason =
    statOptions.find((o) => o.key === statParam)?.key ?? 'final_standing'
  // League average is on by default; ?avg=0 turns it off.
  const showAverage = params.get('avg') !== '0'
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedLeague) return
    setLoading(true)
    fetchOwnerHistory(selectedLeague.espn_league_id)
      .then((h) => {
        setHistory(h)
        if (selected.length === 0 && selectedLeague.favorite_owner_id) {
          const fav = h.owners.find((o) => o.owner_id === selectedLeague.favorite_owner_id)
          if (fav) setSelected([fav.owner_id])
        }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeague?.espn_league_id])

  if (!selectedLeague) return <NoLeagueSelected />


  const stat = statOptions.find((s) => s.key === statKey) ?? STAT_OPTIONS[0]
  const current = history ? currentYear(history.owners) : null
  const selectedOwners = history
    ? history.owners.filter((o) => selected.includes(o.owner_id))
    : []
  const available = history
    ? history.owners.filter((o) => !selected.includes(o.owner_id))
    : []

  return (
    <div className="page">
      <header className="page-header">
        <h2>Trends</h2>
        {history && (
          <span className="league">
            {history.years[0]}–{history.years[history.years.length - 1]} · {history.owners.length} owners
          </span>
        )}
      </header>

      {error && <ErrorMessage message={error} />}
      {loading && <BlockSkeleton height={isMobile ? 420 : 620} />}

      {history && (
        <>
          <div className="compare-controls">
            <div className="control">
              <label htmlFor="stat-select">Stat to plot</label>
              <select
                id="stat-select"
                value={statKey}
                onChange={(e) => update({ stat: e.target.value })}
              >
                {statOptions.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="control">
              <label htmlFor="owner-select">Add a team</label>
              <select
                id="owner-select"
                value=""
                onChange={(e) => {
                  if (e.target.value) setSelected([...selected, e.target.value])
                }}
              >
                <option value="">
                  {selected.length === 0 ? 'Add a team' : 'Add Another Team'}
                </option>
                {available.map((o) => (
                  <option key={o.owner_id} value={o.owner_id}>
                    {o.current_team_name} — {o.owner_name}
                  </option>
                ))}
              </select>
            </div>

            {!stat.rank && (
              <label className="control-check">
                <input
                  type="checkbox"
                  checked={showAverage}
                  onChange={(e) => update({ avg: e.target.checked ? null : '0' })}
                />
                League average
              </label>
            )}
          </div>

          {selected.length > 0 && (
            <div className="selected-pills">
              {selected.map((oid) => {
                const o = history.owners.find((x) => x.owner_id === oid)
                if (!o) return null
                return (
                  <span key={oid} className="pill">
                    {o.current_team_name}
                    <span className="pill-owner"> — {o.owner_name}</span>
                    <button
                      type="button"
                      onClick={() => setSelected(selected.filter((x) => x !== oid))}
                      aria-label={`Remove ${o.owner_name}`}
                    >
                      ×
                    </button>
                  </span>
                )
              })}
              <button
                type="button"
                className="clear-all"
                onClick={() => setSelected([])}
              >
                Clear all
              </button>
            </div>
          )}

          {selectedOwners.length === 0 ? (
            <p className="subtitle" style={{ marginTop: 24 }}>
              Select one or more teams to compare year-over-year.
            </p>
          ) : (
            <>
              <h3 className="chart-title">{stat.label} by Year</h3>
              <div className="chart-with-averages">
                <ComparisonChart
                  owners={selectedOwners}
                  allOwners={history.owners}
                  allYears={history.years}
                  statKey={stat.key}
                  statLabel={stat.label}
                  rank={stat.rank}
                  yAutoScale={stat.yAutoScale}
                  showAverage={showAverage}
                />
                <aside className="chart-averages">
                  <h4>Avg {stat.label}</h4>
                  {current !== null && !stat.perGame && (
                    <p className="chart-averages-note">Finished seasons only</p>
                  )}
                  {selectedOwners.map((o, i) => {
                    const avg = seasonAverage(o.seasons, stat.key, stat.perGame ? null : current)
                    return (
                      <div
                        key={o.owner_id}
                        className="avg-row"
                        style={{ borderLeftColor: COLORS[i % COLORS.length] }}
                      >
                        <div className="avg-team">
                          <TeamLink ownerId={o.owner_id}>{o.current_team_name}</TeamLink>
                        </div>
                        <div className="avg-value">{avg != null ? avg.toFixed(2) : '—'}</div>
                      </div>
                    )
                  })}
                </aside>
              </div>
              {current !== null && (
                <p className="chart-note">
                  Dashed with a hollow dot: {current}, still in progress
                  {stat.rank ? ' (current standing, not a finish)' : ''}.
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}
