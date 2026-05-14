import { useEffect, useState } from 'react'
import {
  fetchAggregate,
  fetchTeams,
  type LeagueAggregate,
  type SeasonTeams,
} from '../api'
import { AggregateTable } from '../components/AggregateTable'
import { NoLeagueSelected } from '../components/NoLeagueSelected'
import { TeamList } from '../components/TeamList'
import { useLeagueYears } from '../hooks/useLeagueYears'

type View = { mode: 'year'; year: number } | { mode: 'all' }

export function HomePage() {
  const { leagueId, leagueName, years } = useLeagueYears()
  const [view, setView] = useState<View>({ mode: 'all' })
  const [seasonData, setSeasonData] = useState<SeasonTeams | null>(null)
  const [aggregateData, setAggregateData] = useState<LeagueAggregate | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!leagueId) return
    setLoading(true)
    setError(null)
    const p =
      view.mode === 'all'
        ? fetchAggregate(leagueId).then(setAggregateData)
        : fetchTeams(leagueId, view.year).then(setSeasonData)
    p.catch((e: Error) => setError(e.message)).finally(() => setLoading(false))
  }, [leagueId, view])

  if (!leagueId) return <NoLeagueSelected />

  const yearsDesc = [...years].reverse()

  return (
    <div className="page">
      <header className="page-header">
        <h2>Season Stats</h2>
        {leagueName && <span className="league">{leagueName}</span>}
      </header>
      <nav className="years">
        <button
          onClick={() => setView({ mode: 'all' })}
          className={view.mode === 'all' ? 'active' : ''}
        >
          All Time
        </button>
        {yearsDesc.map((y) => (
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
