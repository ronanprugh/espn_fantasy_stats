import { useEffect, useState } from 'react'
import { fetchTrades, type SeasonTrades, type Trade, type TradeSide } from '../api'
import { ErrorMessage } from '../components/ErrorMessage'
import { ListSkeleton } from '../components/Loading'
import { NoLeagueSelected } from '../components/NoLeagueSelected'
import { SeasonPicker } from '../components/SeasonPicker'
import { TeamLink } from '../components/TeamLink'
import { useLeagueYears } from '../hooks/useLeagueYears'
import { numberParam, useUrlState } from '../hooks/useUrlState'
import { isYours, useYourTeam } from '../hooks/useYourTeam'
import { biggestWin, FIRST_TRADE_YEAR, traderRecords } from '../lib/trades'

const fmt = (n: number) => n.toFixed(1)
const dateLabel = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })

/**
 * A season's trades and who won them: each side is credited with what its new
 * players scored for it in a starting slot, from the trade's week to the end
 * of the season (bench points don't count). ESPN keeps trades from 2019 on.
 */
export function TradesPage() {
  const { leagueId, years } = useLeagueYears()
  const tradeYears = years.filter((y) => y >= FIRST_TRADE_YEAR)
  const [params, update] = useUrlState()
  const year = numberParam(params, 'year') ?? (tradeYears.length ? tradeYears[tradeYears.length - 1] : null)
  const yourTeam = useYourTeam()
  const [data, setData] = useState<SeasonTrades | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!leagueId || year === null) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchTrades(leagueId, year)
      .then((d) => !cancelled && setData(d))
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [leagueId, year])

  if (!leagueId) return <NoLeagueSelected />

  const shown = data && data.year === year && !loading ? data : null
  const trades = shown ? [...shown.trades].reverse() : []
  const records = shown ? traderRecords(shown.trades) : []
  const biggest = shown ? biggestWin(shown.trades) : null

  return (
    <div className="page trades-page">
      <header className="page-header">
        <h2>Trades</h2>
        {shown && (
          <span className="league">
            {year} · {shown.trades.length} trade{shown.trades.length === 1 ? '' : 's'}
          </span>
        )}
      </header>

      {tradeYears.length > 0 && (
        <SeasonPicker years={tradeYears} value={year} onChange={(y) => update({ year: String(y) })} />
      )}
      <p className="subtitle">
        Each side gets credit for what its new players scored for it as starters, from the week of the
        trade on. Bench points don't count. ESPN keeps trades from {FIRST_TRADE_YEAR} on.
      </p>

      {error && <ErrorMessage message={error} />}
      {loading && <ListSkeleton rows={4} />}

      {shown && shown.trades.length === 0 && <p className="subtitle">No trades in {year}.</p>}

      {shown && shown.trades.length > 0 && (
        <>
          <section className="trade-summary">
            <table className="tw-standings trade-records">
              <thead>
                <tr>
                  <th>Team</th>
                  <th className="num">Trades</th>
                  <th className="num">Won–Lost</th>
                  <th className="num" title="Starting points gained minus given up across their trades">
                    Net pts
                  </th>
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.ownerId} className={isYours(yourTeam, r.ownerId) ? 'your-team' : ''}>
                    <td>
                      <TeamLink ownerId={r.ownerId} year={year ?? undefined}>
                        {r.name}
                      </TeamLink>
                    </td>
                    <td className="num">{r.trades}</td>
                    <td className="num">
                      {r.won}–{r.lost}
                    </td>
                    <td className={`num ${r.net > 0 ? 'pos' : r.net < 0 ? 'neg' : ''}`}>
                      {r.net > 0 ? '+' : ''}
                      {fmt(r.net)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {biggest && (
              <p className="tw-note">
                Most one-sided:{' '}
                {biggest.sides.find((s) => s.team_id === biggest.winner_team_id)?.team_name} won by{' '}
                {fmt(biggest.margin)} (week {biggest.week}).
              </p>
            )}
          </section>

          <section className="trade-list">
            {trades.map((t) => (
              <TradeCard key={`${t.date}-${t.sides.map((s) => s.team_id).join('-')}`} trade={t} year={year!} yourTeam={yourTeam} />
            ))}
          </section>
        </>
      )}
    </div>
  )
}

function TradeCard({ trade, year, yourTeam }: { trade: Trade; year: number; yourTeam: string | null }) {
  const winner = trade.sides.find((s) => s.team_id === trade.winner_team_id)
  const mine = trade.sides.some((s) => isYours(yourTeam, s.owner_id))
  return (
    <article className={`trade-card${mine ? ' your-matchup' : ''}`}>
      <header className="trade-head">
        <span>
          Week {trade.week} · {dateLabel(trade.date)}
        </span>
        <span className={`trade-verdict${winner ? '' : ' even'}`}>
          {winner ? `${winner.team_name} won by ${fmt(trade.margin)}` : 'Even so far'}
        </span>
      </header>
      <div className="trade-sides">
        {trade.sides.map((s) => (
          <TradeSideView key={s.team_id} side={s} year={year} won={s.team_id === trade.winner_team_id} />
        ))}
      </div>
    </article>
  )
}

function TradeSideView({ side, year, won }: { side: TradeSide; year: number; won: boolean }) {
  return (
    <div className={`trade-side${won ? ' won' : ''}`}>
      <div className="trade-side-head">
        <TeamLink ownerId={side.owner_id} year={year}>
          {side.team_name}
        </TeamLink>
        <span className="trade-side-total">{fmt(side.started_points)}</span>
      </div>
      <div className="trade-got">got</div>
      <ul>
        {side.received.map((p) => (
          <li key={p.player_id}>
            <span className="trade-player">
              {p.name}
              {p.position && <span className="trade-pos"> {p.position}</span>}
            </span>
            <span className="trade-pts" title={`${fmt(p.bench_points)} more on the bench`}>
              {fmt(p.started_points)}
              <span className="trade-weeks"> · {p.weeks_started} wk</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
