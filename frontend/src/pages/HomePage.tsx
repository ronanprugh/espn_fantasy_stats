import { useEffect, useState } from 'react'
import {
  fetchAggregate,
  fetchAllSeasons,
  fetchCloseGames,
  fetchTeams,
  type AllSeasons,
  type LeagueAggregate,
  type SeasonTeams,
} from '../api'
import { AggregateTable } from '../components/AggregateTable'
import { NoLeagueSelected } from '../components/NoLeagueSelected'
import { isInProgress } from '../lib/seasonStats'
import { SeasonHistoryTable, type CloseGamesState } from '../components/SeasonHistoryTable'
import { TeamList } from '../components/TeamList'
import { useLeagueYears } from '../hooks/useLeagueYears'
import { Loading } from '../components/Loading'

type View = { mode: 'year'; year: number } | { mode: 'all' } | { mode: 'seasons' }

export function HomePage() {
  const { leagueId, leagueName, years } = useLeagueYears()
  const [view, setView] = useState<View>({ mode: 'all' })
  const [seasonData, setSeasonData] = useState<SeasonTeams | null>(null)
  const [aggregateData, setAggregateData] = useState<LeagueAggregate | null>(null)
  const [allSeasonsData, setAllSeasonsData] = useState<AllSeasons | null>(null)
  const [closeGames, setCloseGames] = useState<CloseGamesState>({ status: 'loading' })
  const [showCurrent, setShowCurrent] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!leagueId) return
    setLoading(true)
    setError(null)
    const p =
      view.mode === 'all'
        ? fetchAggregate(leagueId).then(setAggregateData)
        : view.mode === 'seasons'
          ? fetchAllSeasons(leagueId).then(setAllSeasonsData)
          : fetchTeams(leagueId, view.year).then(setSeasonData)
    p.catch((e: Error) => setError(e.message)).finally(() => setLoading(false))
  }, [leagueId, view])

  // Close games need every season's matchup list, which can mean an ESPN fetch
  // per year on a cold cache. Requested in parallel with the season table but
  // never awaited by it: the table renders first and this column fills in.
  const wantsCloseGames = view.mode === 'seasons'
  useEffect(() => {
    if (!leagueId || !wantsCloseGames) return
    if (closeGames.status === 'ready' && closeGames.data.league_id === leagueId) return
    let cancelled = false
    setCloseGames({ status: 'loading' })
    fetchCloseGames(leagueId)
      .then((data) => !cancelled && setCloseGames({ status: 'ready', data }))
      .catch(() => !cancelled && setCloseGames({ status: 'error' }))
    return () => {
      cancelled = true
    }
    // closeGames is read only to skip a refetch; depending on it would loop.
  }, [leagueId, wantsCloseGames])

  if (!leagueId) return <NoLeagueSelected />

  const yearsDesc = [...years].reverse()
  const hasCurrent = allSeasonsData?.seasons.some(isInProgress) ?? false
  const shownSeasons =
    allSeasonsData?.seasons.filter((s) => showCurrent || !isInProgress(s)) ?? []

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
        <button
          onClick={() => setView({ mode: 'seasons' })}
          className={view.mode === 'seasons' ? 'active' : ''}
        >
          Every Season
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
      {loading && <Loading />}
      {!loading && view.mode === 'all' && aggregateData && (
        <>
          <p className="subtitle">
            {aggregateData.start_year}–{aggregateData.end_year} ·{' '}
            {aggregateData.years.length} seasons · {aggregateData.owners.length} owners
          </p>
          <AggregateTable owners={aggregateData.owners} />
        </>
      )}
      {!loading && view.mode === 'seasons' && allSeasonsData && (
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
          <SeasonHistoryTable seasons={shownSeasons} closeGames={closeGames} />
        </>
      )}
      {!loading && view.mode === 'year' && seasonData && (
        <TeamList teams={seasonData.teams} />
      )}
    </div>
  )
}
