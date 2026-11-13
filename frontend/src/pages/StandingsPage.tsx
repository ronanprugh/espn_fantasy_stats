import { useEffect, useMemo, useState } from 'react'
import { fetchTeams, type SeasonTeams } from '../api'
import { ErrorMessage } from '../components/ErrorMessage'
import { TableSkeleton } from '../components/Loading'
import { NoLeagueSelected } from '../components/NoLeagueSelected'
import { SeasonPicker } from '../components/SeasonPicker'
import { SCORING_LABEL, SeasonHistoryTable } from '../components/SeasonHistoryTable'
import { useCloseGames } from '../hooks/useCloseGames'
import { useLeagueYears } from '../hooks/useLeagueYears'
import { usePowerRankings } from '../hooks/usePowerRankings'
import { numberParam, useUrlState } from '../hooks/useUrlState'
import { ownerSeasonStats } from '../lib/powerRankings'
import { gamesPlayed, isInProgress } from '../lib/seasonStats'

/** One season's standings. Opens on the latest season; `?year=` picks another. */
export function StandingsPage() {
  const { leagueId, leagueName, years } = useLeagueYears()
  const [params, update] = useUrlState()
  // `years` is sorted ascending. A requested year is used straight away rather
  // than waiting for the year list, so a shared link loads as fast as before.
  const latest = years.length > 0 ? years[years.length - 1] : null
  const year = numberParam(params, 'year') ?? latest
  // The latest season stays parameter-free, so a bookmark of /standings keeps
  // meaning "this season" next year too.
  const setYear = (y: number) => update({ year: y === latest ? null : String(y) })
  // The advanced columns, kept in the URL (?more=1) so they survive a refresh.
  const showMore = params.get('more') === '1'

  const [seasonData, setSeasonData] = useState<SeasonTeams | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const closeGames = useCloseGames(leagueId)
  // Power rank columns, when the league has rankings. Never waited on: the
  // columns appear once it lands.
  const pr = usePowerRankings(leagueId)
  const prBySeason = useMemo(
    () => (pr.hasData && pr.data ? ownerSeasonStats(pr.data) : undefined),
    [pr.data, pr.hasData],
  )

  useEffect(() => {
    if (!leagueId || year === null) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchTeams(leagueId, year)
      .then((d) => !cancelled && setSeasonData(d))
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [leagueId, year])

  if (!leagueId) return <NoLeagueSelected />

  return (
    <div className="page">
      <header className="page-header">
        <h2>Standings</h2>
        {leagueName && <span className="league">{leagueName}</span>}
      </header>
      <SeasonPicker years={years} value={year} onChange={setYear} />
      {error && <ErrorMessage message={error} />}
      {(loading || year === null) && !error && <TableSkeleton rows={10} cols={9} toolbar />}
      {!loading && seasonData && seasonData.year === year && (
        <>
          <div className="season-history-bar">
            <p className="subtitle">
              {SCORING_LABEL[seasonData.scoring_type]} scoring
              {isInProgress(seasonData) && ` · in progress, ${gamesPlayed(seasonData)} games played`}
            </p>
            <label className="season-toggle">
              <input
                type="checkbox"
                checked={showMore}
                onChange={(e) => update({ more: e.target.checked ? '1' : null })}
              />
              More stats
            </label>
          </div>
          <SeasonHistoryTable
            seasons={[seasonData]}
            closeGames={closeGames}
            singleSeason
            showMore={showMore}
            powerRankings={
              prBySeason && prBySeason.has(`${seasonData.year}:${seasonData.teams[0]?.owners[0]?.id}`)
                ? prBySeason
                : undefined
            }
          />
        </>
      )}
    </div>
  )
}
