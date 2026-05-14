import { useEffect, useState } from 'react'
import { fetchPlayoffs, type SeasonPlayoffs } from '../api'
import { NoLeagueSelected } from '../components/NoLeagueSelected'
import { PlayoffBracket } from '../components/PlayoffBracket'
import { useLeagueYears } from '../hooks/useLeagueYears'

export function PlayoffsPage() {
  const { leagueId, years } = useLeagueYears()
  const [year, setYear] = useState<number | null>(null)
  const [data, setData] = useState<SeasonPlayoffs | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (years.length > 0 && year === null) {
      setYear(years[years.length - 1])
    }
  }, [years, year])

  useEffect(() => {
    if (!leagueId || year == null) return
    setLoading(true)
    setError(null)
    fetchPlayoffs(leagueId, year)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [leagueId, year])

  if (!leagueId) return <NoLeagueSelected />

  const yearsDesc = [...years].reverse()

  return (
    <div className="page">
      <header className="page-header">
        <h2>Playoff History</h2>
        {data && (
          <span className="league">
            {data.year} · {data.playoff_team_count} playoff teams
          </span>
        )}
      </header>
      <nav className="years">
        {yearsDesc.map((y) => (
          <button key={y} onClick={() => setYear(y)} className={y === year ? 'active' : ''}>
            {y}
          </button>
        ))}
      </nav>
      {error && <p className="error">{error}</p>}
      {loading && <p>Loading…</p>}
      {data && !loading && <PlayoffBracket data={data} />}
    </div>
  )
}
