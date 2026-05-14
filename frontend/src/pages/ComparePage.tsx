import { useEffect, useState } from 'react'
import {
  fetchOwnerHistory,
  type LeagueOwnerHistory,
  type OwnerSeason,
} from '../api'
import { COLORS, ComparisonChart } from '../components/ComparisonChart'
import { NoLeagueSelected } from '../components/NoLeagueSelected'
import { useLeague } from '../contexts/LeagueContext'

function average(seasons: OwnerSeason[], key: keyof OwnerSeason): number | null {
  const values = seasons
    .map((s) => s[key])
    .filter((v): v is number => typeof v === 'number')
  if (values.length === 0) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

type StatOption = {
  key: keyof OwnerSeason
  label: string
  yReversed?: boolean
}

const STAT_OPTIONS: StatOption[] = [
  { key: 'final_standing', label: 'Final Standing', yReversed: true },
  { key: 'seed', label: 'Playoff Seed', yReversed: true },
  { key: 'wins', label: 'Wins' },
  { key: 'losses', label: 'Losses' },
  { key: 'points_for', label: 'Points For (total)' },
  { key: 'points_against', label: 'Points Against (total)' },
  { key: 'avg_points_for', label: 'Avg Points For' },
  { key: 'avg_points_against', label: 'Avg Points Against' },
  { key: 'avg_plus_minus', label: 'Avg +/−' },
  { key: 'playoff_wins', label: 'Playoff Wins' },
  { key: 'playoff_losses', label: 'Playoff Losses' },
]

export function ComparePage() {
  const { selectedLeague } = useLeague()
  const [history, setHistory] = useState<LeagueOwnerHistory | null>(null)
  const [selected, setSelected] = useState<string[]>([])
  const [statKey, setStatKey] = useState<keyof OwnerSeason>('final_standing')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedLeague) return
    setLoading(true)
    fetchOwnerHistory(selectedLeague.espn_league_id)
      .then(setHistory)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [selectedLeague?.espn_league_id])

  if (!selectedLeague) return <NoLeagueSelected />


  const stat = STAT_OPTIONS.find((s) => s.key === statKey) ?? STAT_OPTIONS[0]
  const selectedOwners = history
    ? history.owners.filter((o) => selected.includes(o.owner_id))
    : []
  const available = history
    ? history.owners.filter((o) => !selected.includes(o.owner_id))
    : []

  return (
    <div className="page">
      <header className="page-header">
        <h2>Team Comparison</h2>
        {history && (
          <span className="league">
            {history.years[0]}–{history.years[history.years.length - 1]} · {history.owners.length} owners
          </span>
        )}
      </header>

      {error && <p className="error">{error}</p>}
      {loading && <p>Loading…</p>}

      {history && (
        <>
          <div className="compare-controls">
            <div className="control">
              <label htmlFor="stat-select">Stat to plot</label>
              <select
                id="stat-select"
                value={statKey}
                onChange={(e) => setStatKey(e.target.value as keyof OwnerSeason)}
              >
                {STAT_OPTIONS.map((o) => (
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
                  if (e.target.value) setSelected((s) => [...s, e.target.value])
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
                      onClick={() => setSelected((s) => s.filter((x) => x !== oid))}
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
                  allYears={history.years}
                  statKey={stat.key}
                  statLabel={stat.label}
                  yReversed={stat.yReversed}
                />
                <aside className="chart-averages">
                  <h4>Avg {stat.label}</h4>
                  {selectedOwners.map((o, i) => {
                    const avg = average(o.seasons, stat.key)
                    return (
                      <div
                        key={o.owner_id}
                        className="avg-row"
                        style={{ borderLeftColor: COLORS[i % COLORS.length] }}
                      >
                        <div className="avg-team">{o.current_team_name}</div>
                        <div className="avg-value">{avg != null ? avg.toFixed(2) : '—'}</div>
                      </div>
                    )
                  })}
                </aside>
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
