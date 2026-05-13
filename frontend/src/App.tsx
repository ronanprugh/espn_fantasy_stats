import { useEffect, useState } from 'react'
import { fetchConfig, fetchTeams, type SeasonTeams } from './api'
import { TeamList } from './components/TeamList'

const YEARS = [2024, 2023, 2022, 2021, 2020]

export default function App() {
  const [leagueId, setLeagueId] = useState<number | null>(null)
  const [year, setYear] = useState<number>(YEARS[0])
  const [data, setData] = useState<SeasonTeams | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchConfig()
      .then((c) => setLeagueId(c.league_id))
      .catch((e) => setError(String(e)))
  }, [])

  useEffect(() => {
    if (leagueId == null) return
    setLoading(true)
    setError(null)
    fetchTeams(leagueId, year)
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [leagueId, year])

  return (
    <div className="app">
      <header>
        <h1>ESPN Fantasy Stats</h1>
        {leagueId != null && <span className="league">League {leagueId}</span>}
      </header>
      <nav className="years">
        {YEARS.map((y) => (
          <button
            key={y}
            onClick={() => setYear(y)}
            className={y === year ? 'active' : ''}
          >
            {y}
          </button>
        ))}
      </nav>
      {error && <p className="error">{error}</p>}
      {loading && <p>Loading…</p>}
      {data && !loading && <TeamList teams={data.teams} />}
    </div>
  )
}
