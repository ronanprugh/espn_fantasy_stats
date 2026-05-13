import { useEffect, useState } from 'react'
import { fetchConfig, fetchPlayoffs, type Config, type SeasonPlayoffs } from '../api'
import { PlayoffBracket } from '../components/PlayoffBracket'

export function PlayoffsPage() {
  const [config, setConfig] = useState<Config | null>(null)
  const [year, setYear] = useState<number | null>(null)
  const [data, setData] = useState<SeasonPlayoffs | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchConfig()
      .then((c) => {
        setConfig(c)
        setYear(c.years[c.years.length - 1])
      })
      .catch((e) => setError(String(e)))
  }, [])

  useEffect(() => {
    if (!config || year == null) return
    setLoading(true)
    setError(null)
    fetchPlayoffs(config.league_id, year)
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [config, year])

  const years = config ? [...config.years].reverse() : []

  return (
    <div className="page">
      <header className="page-header">
        <h2>Playoff History</h2>
        {data && <span className="league">{data.year} · {data.playoff_team_count} playoff teams</span>}
      </header>
      <nav className="years">
        {years.map((y) => (
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
      {data && !loading && <PlayoffBracket data={data} />}
    </div>
  )
}
