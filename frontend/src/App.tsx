import { useEffect, useState } from 'react'
import {
  fetchAggregate,
  fetchConfig,
  fetchTeams,
  type Config,
  type LeagueAggregate,
  type SeasonTeams,
} from './api'
import { AggregateTable } from './components/AggregateTable'
import { TeamList } from './components/TeamList'

type View = { mode: 'year'; year: number } | { mode: 'all' }

export default function App() {
  const [config, setConfig] = useState<Config | null>(null)
  const [view, setView] = useState<View>({ mode: 'all' })
  const [seasonData, setSeasonData] = useState<SeasonTeams | null>(null)
  const [aggregateData, setAggregateData] = useState<LeagueAggregate | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchConfig()
      .then(setConfig)
      .catch((e) => setError(String(e)))
  }, [])

  useEffect(() => {
    if (!config) return
    setLoading(true)
    setError(null)
    const p =
      view.mode === 'all'
        ? fetchAggregate(config.league_id).then(setAggregateData)
        : fetchTeams(config.league_id, view.year).then(setSeasonData)
    p.catch((e) => setError(String(e))).finally(() => setLoading(false))
  }, [config, view])

  const years = config ? [...config.years].reverse() : []

  return (
    <div className="app">
      <header>
        <h1>ESPN Fantasy Stats</h1>
        {config && <span className="league">League {config.league_id}</span>}
      </header>
      <nav className="years">
        <button
          onClick={() => setView({ mode: 'all' })}
          className={view.mode === 'all' ? 'active' : ''}
        >
          All Time
        </button>
        {years.map((y) => (
          <button
            key={y}
            onClick={() => setView({ mode: 'year', year: y })}
            className={view.mode === 'year' && view.year === y ? 'active' : ''}
          >
            {y}
          </button>
        ))}
      </nav>
      {error && <p className="error">{error}</p>}
      {loading && <p>Loading…</p>}
      {!loading && view.mode === 'all' && aggregateData && (
        <>
          <p className="subtitle">
            {aggregateData.start_year}–{aggregateData.end_year} ·{' '}
            {aggregateData.years.length} seasons · {aggregateData.owners.length} owners
          </p>
          <AggregateTable owners={aggregateData.owners} />
        </>
      )}
      {!loading && view.mode === 'year' && seasonData && (
        <TeamList teams={seasonData.teams} />
      )}
    </div>
  )
}
