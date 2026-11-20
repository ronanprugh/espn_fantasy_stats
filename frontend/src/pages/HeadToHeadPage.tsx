/**
 * Head to Head. With one owner (`?a=`), their record against everyone
 * (Rivalries); with two (`?a=&b=`), every meeting between them across all
 * seasons, the totals side by side and the games, each a link to its box
 * score.
 */
import { useEffect, useMemo, useState } from 'react'
import {
  fetchHeadToHead,
  fetchHeadToHeadSummary,
  fetchOwnerHistory,
  type RivalrySummary,
  type HeadToHeadStats,
  type OwnerHistory,
} from '../api'
import { NoLeagueSelected } from '../components/NoLeagueSelected'
import { Rivalries } from '../components/Rivalries'
import { useFromHere } from '../hooks/useFromHere'
import { useLeague } from '../contexts/LeagueContext'
import { useIsMobile } from '../hooks/useIsMobile'
import { CardGridSkeleton, TableSkeleton } from '../components/Loading'
import { ErrorMessage } from '../components/ErrorMessage'
import { useUrlState } from '../hooks/useUrlState'
import { usePowerRankings } from '../hooks/usePowerRankings'
import { ownerStats, rankLookup } from '../lib/powerRankings'
import { H2HMatchupsMobile, H2HMatchupsList } from './headToHead/Matchups'
import { RankedRecord, H2HSummary, H2HSummaryMobile } from './headToHead/Summary'

export function HeadToHeadPage() {
  // Box Score's back link names this page.
  const fromHere = useFromHere('Head to Head')
  const isMobile = useIsMobile()
  const { selectedLeague } = useLeague()
  const [owners, setOwners] = useState<OwnerHistory[]>([])
  const [params, update] = useUrlState()
  const ownerA = params.get('a') ?? ''
  const ownerB = params.get('b') ?? ''
  const [data, setData] = useState<HeadToHeadStats | null>(null)
  // Team A alone: A's record against everyone, until an opponent is picked.
  const [summary, setSummary] = useState<RivalrySummary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pr = usePowerRankings(selectedLeague?.espn_league_id ?? null)
  const look = useMemo(() => (pr.hasData ? rankLookup(pr.data) : undefined), [pr.data, pr.hasData])
  const prStats = useMemo(
    () => (pr.hasData && pr.data ? new Map(ownerStats(pr.data).map((o) => [o.ownerId, o])) : undefined),
    [pr.data, pr.hasData],
  )

  useEffect(() => {
    if (!selectedLeague) return
    fetchOwnerHistory(selectedLeague.espn_league_id)
      .then((h) => {
        setOwners(h.owners)
        if (!ownerA && selectedLeague.favorite_owner_id) {
          const fav = h.owners.find((o) => o.owner_id === selectedLeague.favorite_owner_id)
          if (fav) update({ a: fav.owner_id })
        }
      })
      .catch((e: Error) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeague?.espn_league_id])

  const leagueId = selectedLeague?.espn_league_id
  useEffect(() => {
    if (!leagueId || !ownerA || !ownerB || ownerA === ownerB) {
      setData(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchHeadToHead(leagueId, ownerA, ownerB)
      .then((d) => !cancelled && setData(d))
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    // Switching opponents mid-load mustn't show the previous pair's record.
    return () => {
      cancelled = true
    }
  }, [leagueId, ownerA, ownerB])

  useEffect(() => {
    if (!leagueId || !ownerA || ownerB) {
      setSummary(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchHeadToHeadSummary(leagueId, ownerA)
      .then((s) => !cancelled && setSummary(s))
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [leagueId, ownerA, ownerB])

  if (!selectedLeague) return <NoLeagueSelected />



  return (
    <div className="page">
      <header className="page-header">
        <h2>Head to Head</h2>
      </header>

      {error && <ErrorMessage message={error} />}

      <div className="compare-controls">
        <div className="control">
          <label htmlFor="owner-a">Team A</label>
          <select
            id="owner-a"
            value={ownerA}
            onChange={(e) => update({ a: e.target.value || null })}
          >
            <option value="">— pick a team —</option>
            {owners
              .filter((o) => o.owner_id !== ownerB)
              .map((o) => (
                <option key={o.owner_id} value={o.owner_id}>
                  {o.current_team_name} — {o.owner_name}
                </option>
              ))}
          </select>
        </div>

        <div className="control">
          <label htmlFor="owner-b">Team B</label>
          <select
            id="owner-b"
            value={ownerB}
            onChange={(e) => update({ b: e.target.value || null })}
          >
            <option value="">— pick a team —</option>
            {owners
              .filter((o) => o.owner_id !== ownerA)
              .map((o) => (
                <option key={o.owner_id} value={o.owner_id}>
                  {o.current_team_name} — {o.owner_name}
                </option>
              ))}
          </select>
        </div>
      </div>

      {loading &&
        (ownerB ? (
          <>
            <CardGridSkeleton count={4} variant="stat" />
            <TableSkeleton rows={8} cols={7} />
          </>
        ) : (
          <TableSkeleton rows={8} cols={8} />
        ))}

      {!loading && !ownerB && summary && summary.owner_id === ownerA && <Rivalries summary={summary} />}

      {!loading && data && data.total_matchups === 0 && (
        <p className="subtitle" style={{ marginTop: 24 }}>
          These two have never played each other.
        </p>
      )}

      {!loading && data && data.total_matchups > 0 && (
        <>
          {isMobile ? <H2HSummaryMobile data={data} pr={prStats} /> : <H2HSummary data={data} pr={prStats} />}
          {look && <RankedRecord data={data} look={look} />}
          {isMobile ? (
            <H2HMatchupsMobile matchups={data.matchups} data={data} fromHere={fromHere} look={look} />
          ) : (
            <H2HMatchupsList matchups={data.matchups} data={data} fromHere={fromHere} look={look} />
          )}
        </>
      )}
    </div>
  )
}
