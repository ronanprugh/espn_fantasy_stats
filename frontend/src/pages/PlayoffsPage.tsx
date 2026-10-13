import { useEffect, useState } from 'react'
import { fetchPlayoffs, type SeasonPlayoffs } from '../api'
import { NoLeagueSelected } from '../components/NoLeagueSelected'
import { PlayoffBracket } from '../components/PlayoffBracket'
import { useLeagueYears } from '../hooks/useLeagueYears'
import { Loading } from '../components/Loading'

export function PlayoffsPage() {
  const { leagueId, years } = useLeagueYears()
  const [year, setYear] = useState<number | null>(null)
  // Set when the latest season had no bracket yet and the page fell back to
  // the one before it. Cleared as soon as a year is picked by hand.
  const [fellBackFrom, setFellBackFrom] = useState<number | null>(null)
  const [pickedByHand, setPickedByHand] = useState(false)
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

  const hasBracket = (d: SeasonPlayoffs) => d.playoff_weeks.length > 0
  const latestYear = years[years.length - 1]

  // During the regular season the latest year has no bracket, so opening on it
  // showed an empty page. Fall back once to the previous season, unless the
  // year was chosen by hand.
  useEffect(() => {
    if (pickedByHand || !data || data.year !== year || hasBracket(data)) return
    const earlier = years.filter((y) => y < data.year)
    const previous = earlier[earlier.length - 1]
    if (previous !== undefined) {
      setFellBackFrom(data.year)
      setYear(previous)
    }
  }, [data, year, years, pickedByHand])

  if (!leagueId) return <NoLeagueSelected />

  const yearsDesc = [...years].reverse()
  const pick = (y: number) => {
    setPickedByHand(true)
    setFellBackFrom(null)
    setYear(y)
  }

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
          <button key={y} onClick={() => pick(y)} className={y === year ? 'active' : ''}>
            {y}
          </button>
        ))}
      </nav>
      {error && <p className="error">{error}</p>}
      {loading && <Loading />}
      {fellBackFrom !== null && data?.year === year && !loading && (
        <p className="subtitle">The {fellBackFrom} playoffs haven't started yet, so here's {year}.</p>
      )}
      {data && !loading && !hasBracket(data) && data.year === latestYear ? (
        <p className="subtitle">
          The {data.year} playoffs haven't started yet. They begin after week{' '}
          {data.reg_season_count}.
        </p>
      ) : (
        data && !loading && <PlayoffBracket data={data} />
      )}
    </div>
  )
}
