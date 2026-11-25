import { useEffect, useState } from 'react'
import { fetchMoves, fetchSeasonRosters, fetchTeams, fetchTrades, type Move, type SeasonRosters, type Trade } from '../api'

export type TeamSeason = {
  rosters: SeasonRosters | null
  /** Every trade of the season (a team's side is found by owner id). */
  trades: Trade[]
  moves: Move[]
}

/**
 * One owner's season of transactions: their roster at the start and the end
 * of it, and the season's trades and moves. `teamId` is the owner's ESPN team
 * id that season when the caller knows it; otherwise it's looked up from the
 * season's teams. The trades and moves are the whole league's, so a trade
 * can name the other side.
 */
export function useTeamSeason(
  leagueId: number | null | undefined,
  year: number | null,
  ownerId: string | null,
  teamId?: number,
): { data: TeamSeason | null; loading: boolean; error: string | null } {
  const key = leagueId && year && ownerId ? `${leagueId}:${year}:${ownerId}:${teamId ?? ''}` : null
  const [state, setState] = useState<{ key: string; data: TeamSeason | null; error: string | null } | null>(null)

  useEffect(() => {
    if (!key || !leagueId || !year || !ownerId) return
    let cancelled = false
    const team =
      teamId !== undefined
        ? Promise.resolve(teamId)
        : fetchTeams(leagueId, year).then((s) => s.teams.find((t) => t.owners[0]?.id === ownerId)?.team_id ?? null)
    Promise.all([
      team.then((id) => (id === null ? null : fetchSeasonRosters(leagueId, year, id))),
      fetchTrades(leagueId, year),
      fetchMoves(leagueId, year),
    ])
      .then(([rosters, trades, moves]) => {
        if (!cancelled) setState({ key, data: { rosters, trades: trades.trades, moves: moves.moves }, error: null })
      })
      .catch((e: Error) => !cancelled && setState({ key, data: null, error: e.message }))
    return () => {
      cancelled = true
    }
  }, [key, leagueId, year, ownerId, teamId])

  // Only the answer for what's asked now: a switch of season or team shows
  // loading, never the last one's data.
  const current = state && state.key === key ? state : null
  return { data: current?.data ?? null, loading: !!key && !current, error: current?.error ?? null }
}
