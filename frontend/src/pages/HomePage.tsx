import { useEffect, useMemo, useState } from 'react'
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
import { gamesPlayed, isInProgress } from '../lib/seasonStats'
import {
  SCORING_LABEL,
  SeasonHistoryTable,
  type CloseGamesState,
} from '../components/SeasonHistoryTable'
import { useLeagueYears } from '../hooks/useLeagueYears'
import { useUrlState } from '../hooks/useUrlState'
import { usePowerRankings } from '../hooks/usePowerRankings'
import { ownerSeasonStats, ownerStats } from '../lib/powerRankings'
import { Loading } from '../components/Loading'
import { ErrorMessage } from '../components/ErrorMessage'

type View = { mode: 'year'; year: number } | { mode: 'all' } | { mode: 'seasons' }

export function HomePage() {
  const { leagueId, leagueName, years } = useLeagueYears()
  // ?view=seasons, ?view=2024, or nothing for All Time. Memoised on the raw
  // string: the fetch effect depends on `view`, and a fresh object every
  // render would refetch forever.
  const [params, update] = useUrlState()
  const viewParam = params.get('view')
  const view = useMemo<View>(() => {
    if (viewParam === 'seasons') return { mode: 'seasons' }
    if (viewParam && /^\d{4}$/.test(viewParam)) return { mode: 'year', year: Number(viewParam) }
    return { mode: 'all' }
  }, [viewParam])
  const setView = (v: View) =>
    update({ view: v.mode === 'all' ? null : v.mode === 'seasons' ? 'seasons' : String(v.year) })
  const [seasonData, setSeasonData] = useState<SeasonTeams | null>(null)
  const [aggregateData, setAggregateData] = useState<LeagueAggregate | null>(null)
  const [allSeasonsData, setAllSeasonsData] = useState<AllSeasons | null>(null)
  const [closeGames, setCloseGames] = useState<CloseGamesState>({ status: 'loading' })
  const [showCurrent, setShowCurrent] = useState(true)
  // Power rank columns, when the league has rankings. Fetched alongside the
  // table and never waited on: the columns appear once it lands.
  const pr = usePowerRankings(leagueId)
  const prByOwner = useMemo(
    () => (pr.hasData && pr.data ? new Map(ownerStats(pr.data).map((o) => [o.ownerId, o])) : undefined),
    [pr.data, pr.hasData],
  )
  const prBySeason = useMemo(
    () => (pr.hasData && pr.data ? ownerSeasonStats(pr.data) : undefined),
    [pr.data, pr.hasData],
  )
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
  const wantsCloseGames = view.mode !== 'all'
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
      {error && <ErrorMessage message={error} />}
      {loading && <Loading />}
      {!loading && view.mode === 'all' && aggregateData && (
        <>
          <p className="subtitle">
            {aggregateData.start_year}–{aggregateData.end_year} ·{' '}
            {aggregateData.years.length} seasons · {aggregateData.owners.length} owners
          </p>
          <AggregateTable owners={aggregateData.owners} powerRankings={prByOwner} />
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
          <SeasonHistoryTable seasons={shownSeasons} closeGames={closeGames} powerRankings={prBySeason} />
        </>
      )}
      {!loading && view.mode === 'year' && seasonData && (
        <>
          <p className="subtitle">
            {SCORING_LABEL[seasonData.scoring_type]} scoring
            {isInProgress(seasonData) && ` · in progress, ${gamesPlayed(seasonData)} games played`}
          </p>
          <SeasonHistoryTable
            seasons={[seasonData]}
            closeGames={closeGames}
            singleSeason
            powerRankings={prBySeason && prBySeason.has(`${seasonData.year}:${seasonData.teams[0]?.owners[0]?.id}`) ? prBySeason : undefined}
          />
        </>
      )}
    </div>
  )
}
