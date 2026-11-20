import { useEffect, useState } from 'react'
import { fetchMoves, fetchTrades, type Move, type MoveKind, type Trade, type TradeSide } from '../api'
import { ErrorMessage } from '../components/ErrorMessage'
import { ListSkeleton } from '../components/Loading'
import { NoLeagueSelected } from '../components/NoLeagueSelected'
import { SeasonPicker } from '../components/SeasonPicker'
import { TeamLink } from '../components/TeamLink'
import { useLeagueYears } from '../hooks/useLeagueYears'
import { useUrlState } from '../hooks/useUrlState'
import { isYours, useYourTeam } from '../hooks/useYourTeam'
import {
  biggestWin,
  FIRST_TRADE_YEAR,
  moveDays,
  moveRecords,
  tradeDays,
  traderRecords,
  type BusiestDay,
  type OwnerDay,
} from '../lib/trades'

type Kind = 'trades' | MoveKind
const KINDS: { key: Kind; label: string; noun: string }[] = [
  { key: 'trades', label: 'Trades', noun: 'trade' },
  { key: 'waiver', label: 'Waiver claims', noun: 'waiver claim' },
  { key: 'free_agent', label: 'Free agents', noun: 'free-agent pickup' },
  { key: 'drop', label: 'Drops', noun: 'drop' },
]

const fmt = (n: number) => n.toFixed(1)
const dateLabel = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`

type Loaded = { key: string; trades: Trade[]; moves: Move[] }

/**
 * The league's transactions, one kind at a time: trades (and who won them),
 * waiver claims, free-agent pickups and drops. A season, or every season
 * since 2019 (all ESPN keeps) for all-time records.
 *
 * Trades credit each side with what its new players scored for it as
 * starters from the week of the trade on; bench points don't count.
 */
export function TransactionsPage() {
  const { leagueId, years } = useLeagueYears()
  const seasons = years.filter((y) => y >= FIRST_TRADE_YEAR)
  const [params, update] = useUrlState()
  const kind: Kind = KINDS.find((k) => k.key === params.get('type'))?.key ?? 'trades'
  const yearParam = params.get('year')
  const year: number | 'all' | null =
    yearParam === 'all' ? 'all' : yearParam && /^\d{4}$/.test(yearParam) ? Number(yearParam) : seasons.length ? seasons[seasons.length - 1] : null
  const yourTeam = useYourTeam()
  const [data, setData] = useState<Loaded | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const wanted = year === 'all' ? seasons : year === null ? [] : [year]
  // Trades and moves come from different endpoints; fetch only what's shown.
  const source = kind === 'trades' ? 'trades' : 'moves'
  const key = `${source}:${wanted.join(',')}`

  useEffect(() => {
    if (!leagueId || wanted.length === 0) return
    let cancelled = false
    setLoading(true)
    setError(null)
    const load =
      source === 'trades'
        ? Promise.all(wanted.map((y) => fetchTrades(leagueId, y))).then((rs) => ({
            key,
            trades: rs.flatMap((r) => r.trades),
            moves: [],
          }))
        : Promise.all(wanted.map((y) => fetchMoves(leagueId, y))).then((rs) => ({
            key,
            trades: [],
            moves: rs.flatMap((r) => r.moves),
          }))
    load
      .then((d) => !cancelled && setData(d))
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // `key` stands for source and the seasons wanted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, key])

  if (!leagueId) return <NoLeagueSelected />

  const shown = data && data.key === key && !loading ? data : null
  const scope = year === 'all' ? `${FIRST_TRADE_YEAR}–${seasons[seasons.length - 1] ?? ''}` : String(year ?? '')
  const kindInfo = KINDS.find((k) => k.key === kind)!
  const count = shown ? (kind === 'trades' ? shown.trades.length : shown.moves.filter((m) => m.kind === kind).length) : 0

  return (
    <div className="page trades-page">
      <header className="page-header">
        <h2>Transactions</h2>
        {shown && (
          <span className="league">
            {scope} · {plural(count, kindInfo.noun)}
          </span>
        )}
      </header>

      {seasons.length > 0 && (
        <SeasonPicker
          years={seasons}
          value={year}
          onChange={(y) => update({ year: String(y) })}
          leading={[{ value: 'all' as const, label: 'All seasons' }]}
        />
      )}

      <nav className="hub-tabs" aria-label="Kind of transaction">
        {KINDS.map((k) => (
          <button
            key={k.key}
            type="button"
            className={k.key === kind ? 'active' : ''}
            aria-pressed={k.key === kind}
            onClick={() => update({ type: k.key === 'trades' ? null : k.key })}
          >
            {k.label}
          </button>
        ))}
      </nav>

      {error && <ErrorMessage message={error} />}
      {loading && <ListSkeleton rows={4} />}

      {shown && count === 0 && (
        <p className="subtitle">
          No {kindInfo.noun}s in {scope}. ESPN keeps transactions from {FIRST_TRADE_YEAR} on.
        </p>
      )}

      {shown && count > 0 && kind === 'trades' && (
        <TradesView trades={shown.trades} yourTeam={yourTeam} allSeasons={year === 'all'} />
      )}
      {shown && count > 0 && kind !== 'trades' && (
        <MovesView moves={shown.moves.filter((m) => m.kind === kind)} kind={kind} yourTeam={yourTeam} />
      )}
    </div>
  )
}

function DayRecords({ ownerDay, leagueDay, noun }: { ownerDay: OwnerDay | null; leagueDay: BusiestDay | null; noun: string }) {
  if (!ownerDay || !leagueDay) return null
  return (
    <div className="trade-callouts">
      {/* One in a day isn't a record worth naming. */}
      {ownerDay.count >= 2 && (
        <div className="stat-card">
          <div className="stat-label">Most {noun}s in one day</div>
          <div className="stat-value">{ownerDay.count}</div>
          <div className="stat-sub">
            {ownerDay.name}, {dayLabel(ownerDay.day)}
          </div>
        </div>
      )}
      <div className="stat-card">
        <div className="stat-label">League's busiest day</div>
        <div className="stat-value">{leagueDay.count}</div>
        <div className="stat-sub">
          {plural(leagueDay.count, noun)}, {dayLabel(leagueDay.day)}
        </div>
      </div>
    </div>
  )
}

function TradesView({ trades, yourTeam, allSeasons }: { trades: Trade[]; yourTeam: string | null; allSeasons: boolean }) {
  const records = traderRecords(trades)
  const biggest = biggestWin(trades)
  const days = tradeDays(trades)
  return (
    <>
      <p className="subtitle">
        Each side gets credit for what its new players scored for it as starters, from the week of the
        trade on. Bench points don't count.
      </p>
      <DayRecords {...days} noun="trade" />
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
                  <TeamLink ownerId={r.ownerId}>{r.name}</TeamLink>
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
            Most one-sided{allSeasons ? ' ever' : ''}:{' '}
            {biggest.sides.find((s) => s.team_id === biggest.winner_team_id)?.team_name} won by {fmt(biggest.margin)} (
            {dateLabel(biggest.date)}).
          </p>
        )}
      </section>
      <section className="trade-list">
        {[...trades]
          .sort((a, b) => b.date - a.date)
          .map((t) => (
            <TradeCard key={`${t.date}-${t.sides.map((s) => s.team_id).join('-')}`} trade={t} yourTeam={yourTeam} />
          ))}
      </section>
    </>
  )
}

function TradeCard({ trade, yourTeam }: { trade: Trade; yourTeam: string | null }) {
  const winner = trade.sides.find((s) => s.team_id === trade.winner_team_id)
  const mine = trade.sides.some((s) => isYours(yourTeam, s.owner_id))
  const year = new Date(trade.date).getFullYear()
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

const players = (ps: Move['added']) =>
  ps.length ? ps.map((p) => `${p.name}${p.position ? ` ${p.position}` : ''}`).join(', ') : '—'

function MovesView({ moves, kind, yourTeam }: { moves: Move[]; kind: MoveKind; yourTeam: string | null }) {
  const records = moveRecords(moves, kind)
  const noun = KINDS.find((k) => k.key === kind)!.noun
  const showBids = kind === 'waiver' && moves.some((m) => m.bid > 0)
  return (
    <>
      <DayRecords {...moveDays(moves)} noun={noun} />
      <section className="trade-summary">
        <table className="tw-standings trade-records">
          <thead>
            <tr>
              <th>Team</th>
              <th className="num">{kind === 'drop' ? 'Drops' : 'Pickups'}</th>
              <th className="num">Players</th>
              {showBids && <th className="num">Budget spent</th>}
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.ownerId} className={isYours(yourTeam, r.ownerId) ? 'your-team' : ''}>
                <td>
                  <TeamLink ownerId={r.ownerId}>{r.name}</TeamLink>
                </td>
                <td className="num">{r.count}</td>
                <td className="num">{r.players}</td>
                {showBids && <td className="num">${r.spent}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <div className="teams-wrap">
        <table className="teams moves-table">
          <thead>
            <tr>
              <th>Date</th>
              <th className="num">Wk</th>
              <th>Team</th>
              {kind !== 'drop' && <th>Added</th>}
              <th>Dropped</th>
              {showBids && <th className="num">Bid</th>}
            </tr>
          </thead>
          <tbody>
            {[...moves]
              .sort((a, b) => b.date - a.date)
              .map((m, i) => (
                <tr key={`${m.date}-${m.team_id}-${i}`} className={isYours(yourTeam, m.owner_id) ? 'your-team' : ''}>
                  <td className="nowrap">{dateLabel(m.date)}</td>
                  <td className="num">{m.week}</td>
                  <td className="nowrap">{m.team_name}</td>
                  {kind !== 'drop' && <td>{players(m.added)}</td>}
                  <td className="muted">{players(m.dropped)}</td>
                  {showBids && <td className="num">{m.bid ? `$${m.bid}` : '—'}</td>}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
