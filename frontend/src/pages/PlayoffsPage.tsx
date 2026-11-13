import { useEffect, useState } from 'react'
import { fetchPlayoffs, type SeasonPlayoffs } from '../api'
import { NoLeagueSelected } from '../components/NoLeagueSelected'
import { PlayoffBracket } from '../components/PlayoffBracket'
import { SeasonPicker } from '../components/SeasonPicker'
import { useLeagueYears } from '../hooks/useLeagueYears'
import { numberParam, useUrlState } from '../hooks/useUrlState'
import { SkeletonBlock, SkeletonRegion } from '../components/Loading'
import { ErrorMessage } from '../components/ErrorMessage'

export function PlayoffsPage() {
  const { leagueId, years } = useLeagueYears()
  // A year in the URL was chosen (by hand or via a shared link) and is shown
  // as-is. Without one the page picks a default, which can fall back below.
  const [params, update] = useUrlState()
  const urlYear = numberParam(params, 'year')
  const [defaultYear, setDefaultYear] = useState<number | null>(null)
  const year = urlYear ?? defaultYear
  // Set when the latest season had no bracket yet and the default fell back
  // to the one before it.
  const [fellBackFrom, setFellBackFrom] = useState<number | null>(null)
  const [data, setData] = useState<SeasonPlayoffs | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (years.length > 0 && defaultYear === null) {
      setDefaultYear(years[years.length - 1])
    }
  }, [years, defaultYear])

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
    if (urlYear !== null || !data || data.year !== year || hasBracket(data)) return
    const earlier = years.filter((y) => y < data.year)
    const previous = earlier[earlier.length - 1]
    if (previous !== undefined) {
      setFellBackFrom(data.year)
      setDefaultYear(previous)
    }
  }, [data, year, years, urlYear])

  if (!leagueId) return <NoLeagueSelected />

  const pick = (y: number) => {
    setFellBackFrom(null)
    update({ year: String(y) })
  }

  return (
    <div className="page">
      <header className="page-header">
        <h2>Playoffs</h2>
        {data && (
          <span className="league">
            {data.year} · {data.playoff_team_count} playoff teams
          </span>
        )}
      </header>
      <SeasonPicker years={years} value={year} onChange={pick} />
      {error && <ErrorMessage message={error} />}
      {loading && <BracketSkeleton />}
      {fellBackFrom !== null && urlYear === null && data?.year === year && !loading && (
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

/** The bracket's shape while it loads: the championship and consolation
 * panels, then the final standings list. */
function BracketSkeleton() {
  return (
    <SkeletonRegion className="bracket-skeleton">
      <SkeletonBlock height={306} className="skeleton-panel" />
      <SkeletonBlock height={190} className="skeleton-panel" />
      <SkeletonBlock width="140px" height={18} className="skeleton-heading" />
      {Array.from({ length: 8 }, (_, i) => (
        <SkeletonBlock key={i} width="min(500px, 100%)" height={16} className="skeleton-line" />
      ))}
    </SkeletonRegion>
  )
}
