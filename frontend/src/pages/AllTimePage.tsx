import { useEffect, useMemo, useState } from 'react'
import { fetchAggregate, fetchAllSeasons, type AllSeasons, type LeagueAggregate } from '../api'
import { AggregateTable } from '../components/AggregateTable'
import { ErrorMessage } from '../components/ErrorMessage'
import { Loading } from '../components/Loading'
import { NoLeagueSelected } from '../components/NoLeagueSelected'
import { SeasonHistoryTable } from '../components/SeasonHistoryTable'
import { useCloseGames } from '../hooks/useCloseGames'
import { useLeagueYears } from '../hooks/useLeagueYears'
import { usePowerRankings } from '../hooks/usePowerRankings'
import { useUrlState } from '../hooks/useUrlState'
import { ownerSeasonStats, ownerStats } from '../lib/powerRankings'
import { isInProgress } from '../lib/seasonStats'

type Tab = 'all' | 'seasons'

/** League history: each owner's career totals, or every team-season ranked. */
export function AllTimePage() {
  const { leagueId, leagueName } = useLeagueYears()
  // ?view=seasons for Every Season; nothing for All Time.
  const [params, update] = useUrlState()
  const tab: Tab = params.get('view') === 'seasons' ? 'seasons' : 'all'
  const setTab = (t: Tab) => update({ view: t === 'seasons' ? 'seasons' : null })

  const [aggregateData, setAggregateData] = useState<LeagueAggregate | null>(null)
  const [allSeasonsData, setAllSeasonsData] = useState<AllSeasons | null>(null)
  const [showCurrent, setShowCurrent] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const closeGames = useCloseGames(leagueId, tab === 'seasons')
  // Power rank columns, when the league has rankings. Never waited on: the
  // columns appear once it lands.
  const pr = usePowerRankings(leagueId)
  const prByOwner = useMemo(
    () => (pr.hasData && pr.data ? new Map(ownerStats(pr.data).map((o) => [o.ownerId, o])) : undefined),
    [pr.data, pr.hasData],
  )
  const prBySeason = useMemo(
    () => (pr.hasData && pr.data ? ownerSeasonStats(pr.data) : undefined),
    [pr.data, pr.hasData],
  )

  useEffect(() => {
    if (!leagueId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    const p =
      tab === 'all'
        ? fetchAggregate(leagueId).then((d) => !cancelled && setAggregateData(d))
        : fetchAllSeasons(leagueId).then((d) => !cancelled && setAllSeasonsData(d))
    p.catch((e: Error) => !cancelled && setError(e.message)).finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [leagueId, tab])

  if (!leagueId) return <NoLeagueSelected />

  const hasCurrent = allSeasonsData?.seasons.some(isInProgress) ?? false
  const shownSeasons =
    allSeasonsData?.seasons.filter((s) => showCurrent || !isInProgress(s)) ?? []

  return (
    <div className="page">
      <header className="page-header">
        <h2>All-Time</h2>
        {leagueName && <span className="league">{leagueName}</span>}
      </header>
      <nav className="years" aria-label="View">
        <button onClick={() => setTab('all')} className={tab === 'all' ? 'active' : ''}>
          All Time
        </button>
        <button onClick={() => setTab('seasons')} className={tab === 'seasons' ? 'active' : ''}>
          Every Season
        </button>
      </nav>
      {error && <ErrorMessage message={error} />}
      {loading && <Loading />}
      {!loading && tab === 'all' && aggregateData && (
        <>
          <p className="subtitle">
            {aggregateData.start_year}–{aggregateData.end_year} ·{' '}
            {aggregateData.years.length} seasons · {aggregateData.owners.length} owners
          </p>
          <AggregateTable owners={aggregateData.owners} powerRankings={prByOwner} />
        </>
      )}
      {!loading && tab === 'seasons' && allSeasonsData && (
        <>
          <div className="season-history-bar">
            <p className="subtitle">
              {shownSeasons.reduce((n, s) => n + s.teams.length, 0)} team-seasons across{' '}
              {shownSeasons.length} seasons · sorted by Avg PF — click any column to re-rank
            </p>
            {hasCurrent && (
              <label className="season-toggle">
                <input
                  type="checkbox"
                  checked={showCurrent}
                  onChange={(e) => setShowCurrent(e.target.checked)}
                />
                Show current season
              </label>
            )}
          </div>
          <SeasonHistoryTable seasons={shownSeasons} closeGames={closeGames} powerRankings={prBySeason} />
        </>
      )}
    </div>
  )
}
