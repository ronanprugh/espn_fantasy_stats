/**
 * One team's season of transactions, for Team Hub's Transactions tab and the
 * Transactions page's Rosters view: the roster it started with beside the one
 * it ended with, its trades and its waiver claims, pickups and drops.
 */
import { Link } from 'react-router-dom'
import { ErrorMessage } from '../../components/ErrorMessage'
import { ListSkeleton } from '../../components/Loading'
import { useTeamSeason } from '../../hooks/useTeamSeason'
import { transactionsHref } from '../../lib/links'
import { tradedOn, tradesFor } from '../../lib/trades'
import { MovesTable } from './Moves'
import { RosterChangesView } from './RosterChanges'
import { KINDS, Stat } from './shared'
import { TeamTrades, TradeCard } from './TradeViews'

type Props = {
  leagueId: number
  year: number
  ownerId: string
  /** The owner's ESPN team id that season, when known (saves a lookup). */
  teamId?: number
}

/** Just the rosters, start and end. */
export function TeamRosters({ leagueId, year, ownerId, teamId }: Props) {
  const { data, loading, error } = useTeamSeason(leagueId, year, ownerId, teamId)
  if (error) return <ErrorMessage message={error} />
  if (loading || !data) return <ListSkeleton rows={6} />
  return data.rosters ? (
    <RosterChangesView rosters={data.rosters} ownerId={ownerId} trades={data.trades} moves={data.moves} />
  ) : (
    <p className="subtitle">This team didn't play in {year}.</p>
  )
}

/** Rosters, trades and moves for one team's season. */
export function TeamSeasonTransactions({ leagueId, year, ownerId, teamId }: Props) {
  const { data, loading, error } = useTeamSeason(leagueId, year, ownerId, teamId)
  if (error) return <ErrorMessage message={error} />
  if (loading || !data) return <ListSkeleton rows={6} />
  const trades = tradesFor(data.trades, ownerId).sort((a, b) => b.date - a.date)
  const onward = tradedOn(data.trades)
  const moves = data.moves.filter((m) => m.owner_id === ownerId)
  const count = (kind: string) => moves.filter((m) => m.kind === kind).length
  return (
    <div className="team-season">
      <section className="tx-block">
        <h3>Roster, start to end — {year}</h3>
        {data.rosters ? (
          <RosterChangesView rosters={data.rosters} ownerId={ownerId} trades={data.trades} moves={data.moves} />
        ) : (
          <p className="subtitle">No rosters for {year}.</p>
        )}
      </section>

      <section className="tx-block">
        <h3>Trades — {year}</h3>
        {trades.length === 0 ? (
          <p className="subtitle">No trades in {year}.</p>
        ) : (
          <>
            <TeamTrades trades={trades} team={ownerId} />
            <div className="trade-list">
              {trades.map((t) => (
                <TradeCard key={t.uid} trade={t} team={ownerId} yourTeam={null} onward={onward} />
              ))}
            </div>
          </>
        )}
      </section>

      <section className="tx-block">
        <h3>Waiver claims, pickups and drops — {year}</h3>
        {moves.length === 0 ? (
          <p className="subtitle">None in {year}.</p>
        ) : (
          <>
            <div className="trade-callouts tx-stats">
              {KINDS.filter((k) => k.key !== 'trades').map((k) => (
                <Stat key={k.key} label={k.label} value={count(k.key)} />
              ))}
            </div>
            <MovesTable moves={moves} showTeam={false} showKind showBids={moves.some((m) => m.bid > 0)} yourTeam={null} />
          </>
        )}
      </section>

      <p className="tx-more">
        <Link to={transactionsHref({ team: ownerId, year: 'all' })}>Every season's transactions for this team →</Link>
      </p>
    </div>
  )
}
