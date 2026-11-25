import { useEffect, useState } from 'react'
import {
  fetchMoves,
  fetchOwnerHistory,
  fetchTrades,
  type Move,
  type MoveKind,
  type Trade,
  type TradeSide,
} from '../api'
import { ErrorMessage } from '../components/ErrorMessage'
import { ListSkeleton } from '../components/Loading'
import { NoLeagueSelected } from '../components/NoLeagueSelected'
import { SeasonPicker } from '../components/SeasonPicker'
import { TeamLink } from '../components/TeamLink'
import { useLeagueYears } from '../hooks/useLeagueYears'
import { useUrlState } from '../hooks/useUrlState'
import { loadSeasons } from '../lib/loadSeasons'
import { isYours, useYourTeam } from '../hooks/useYourTeam'
import {
  biggestWin,
  bySeason,
  FIRST_TRADE_YEAR,
  moveDays,
  moveRecords,
  partnerRecords,
  teamTradeSummary,
  tradeDays,
  traderRecords,
  tradedOn,
  tradeFor,
  tradesFor,
  tradeShortfall,
  type Shortfall,
  type BusiestDay,
  type OwnerDay,
  type TradeFor,
} from '../lib/trades'

type Kind = 'trades' | MoveKind
const KINDS: { key: Kind; label: string; noun: string }[] = [
  { key: 'trades', label: 'Trades', noun: 'trade' },
  { key: 'waiver', label: 'Waiver claims', noun: 'waiver claim' },
  { key: 'free_agent', label: 'Free agents', noun: 'free-agent pickup' },
  { key: 'drop', label: 'Drops', noun: 'drop' },
]

const fmt = (n: number) => n.toFixed(1)
const signed = (n: number, digits = 1) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n).toFixed(digits)}`
const fmtWar = (n: number) => signed(n, 2)
const wins = (n: number) => `${n.toFixed(2)} ${n === 1 ? 'win' : 'wins'}`
const tone = (n: number | null) => (n === null ? '' : n > 0 ? 'pos' : n < 0 ? 'neg' : '')
const dateLabel = (ms: number) =>
  new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
const plural = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`
/** 2021 · 2021 and 2023 · 2020, 2021 and 2023 */
const listYears = (ys: number[]) =>
  ys.length < 2 ? String(ys[0] ?? '') : `${ys.slice(0, -1).join(', ')} and ${ys[ys.length - 1]}`

/** `missing`: played seasons ESPN returned no transactions for. `short`:
 * seasons where ESPN counts more trades than could be rebuilt. */
type Loaded = { key: string; trades: Trade[]; moves: Move[]; missing: number[]; short: Shortfall[] }

/** A team the filter can pick: an owner, under their current team name. */
type TeamOption = { ownerId: string; team: string }

/** Every owner the league has had, for the team filter, by team name. Empty
 * until the league's history arrives (or if it can't be had). */
function useTeamOptions(leagueId: number | null): TeamOption[] {
  const [options, setOptions] = useState<{ leagueId: number; list: TeamOption[] } | null>(null)
  useEffect(() => {
    if (!leagueId) return
    let cancelled = false
    fetchOwnerHistory(leagueId)
      .then((h) => {
        if (cancelled) return
        const list = h.owners.map((o) => ({ ownerId: o.owner_id, team: o.current_team_name || o.owner_name }))
        setOptions({ leagueId, list })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [leagueId])
  return options && options.leagueId === leagueId ? options.list : []
}

/** The league's owners, plus any in the loaded transactions they don't
 * cover (the history can lag or fail), sorted by team name. */
function teamOptions(history: TeamOption[], data: Loaded | null): TeamOption[] {
  const by = new Map(history.map((o) => [o.ownerId, o]))
  const seen = [...(data?.trades.flatMap((t) => t.sides) ?? []), ...(data?.moves ?? [])]
  for (const s of seen) if (!by.has(s.owner_id)) by.set(s.owner_id, { ownerId: s.owner_id, team: s.team_name })
  return [...by.values()].sort((a, b) => a.team.localeCompare(b.team))
}

/**
 * The league's transactions, one kind at a time: trades (and who won them),
 * waiver claims, free-agent pickups and drops. A season, or every season
 * since 2019 (all ESPN keeps) for all-time records.
 *
 * `?team=` narrows it to one owner: their trades seen from their side, with
 * their record, best and worst deal and who they traded with; or their
 * waiver claims, pickups or drops.
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
  const team = params.get('team') || null
  const yourTeam = useYourTeam()
  const history = useTeamOptions(leagueId)
  const [data, setData] = useState<Loaded | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // All seasons loads season by season: [done, total] while it does.
  const [progress, setProgress] = useState<[number, number] | null>(null)
  // Trades and moves come from different endpoints; fetch only what's
  // shown. All seasons asks for each season in turn (loadSeasons): one
  // request for every season's ESPN work could outlast the proxy's timeout
  // on a cold cache. The team filter works on what's loaded: no refetch.
  const source = kind === 'trades' ? 'trades' : 'moves'
  const key = `${source}:${year}`
  const seasonsKey = seasons.join(',')

  useEffect(() => {
    if (!leagueId || year === null) return
    // All seasons needs the season list (a direct link can arrive before it).
    if (year === 'all' && seasons.length === 0) return
    let cancelled = false
    setLoading(true)
    setError(null)
    setProgress(null)
    const years = year === 'all' ? seasons : [year]
    const onProgress = year === 'all' ? (done: number, total: number) => !cancelled && setProgress([done, total]) : undefined
    const load: Promise<Loaded> =
      source === 'trades'
        ? loadSeasons(years, (y) => fetchTrades(leagueId, y), onProgress).then((rs) => {
            const trades = rs.flatMap((r) => r.trades)
            const counts = Object.fromEntries(
              rs.filter((r) => r.espn_trade_count != null).map((r) => [r.year, r.espn_trade_count as number]),
            )
            return {
              key,
              trades,
              moves: [],
              missing: rs.filter((r) => r.unavailable).map((r) => r.year),
              short: tradeShortfall(trades, counts),
            }
          })
        : loadSeasons(years, (y) => fetchMoves(leagueId, y), onProgress).then((rs) => ({
            key,
            trades: [],
            moves: rs.flatMap((r) => r.moves),
            missing: rs.filter((r) => r.unavailable).map((r) => r.year),
            short: [],
          }))
    load
      .then((d) => !cancelled && setData(d))
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // `key` stands for the source and the season, `seasonsKey` for `seasons`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leagueId, key, seasonsKey])

  if (!leagueId) return <NoLeagueSelected />

  const shown = data && data.key === key && !loading ? data : null
  const scope = year === 'all' ? `${FIRST_TRADE_YEAR}–${seasons[seasons.length - 1] ?? ''}` : String(year ?? '')
  const kindInfo = KINDS.find((k) => k.key === kind)!
  const options = teamOptions(history, shown)
  const teamName = team ? (options.find((o) => o.ownerId === team)?.team ?? null) : null
  const trades = shown ? (team ? tradesFor(shown.trades, team) : shown.trades) : []
  const moves = shown ? shown.moves.filter((m) => m.kind === kind && (!team || m.owner_id === team)) : []
  const count = kind === 'trades' ? trades.length : moves.length
  const setTeam = (ownerId: string | null) => update({ team: ownerId })
  const yoursListed = !!yourTeam && options.some((o) => o.ownerId === yourTeam)

  return (
    <div className="page trades-page">
      <header className="page-header">
        <h2>Transactions</h2>
        {shown && (
          <span className="league">
            {scope}
            {teamName && ` · ${teamName}`} · {plural(count, kindInfo.noun)}
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

      <div className="tx-team-filter">
        <label htmlFor="tx-team">Team</label>
        <select id="tx-team" value={team ?? ''} onChange={(e) => setTeam(e.target.value || null)}>
          <option value="">All teams</option>
          {/* A linked team the list doesn't know yet, so the select still shows it. */}
          {team && !options.some((o) => o.ownerId === team) && <option value={team}>…</option>}
          {options.map((o) => (
            <option key={o.ownerId} value={o.ownerId}>
              {o.team}
              {isYours(yourTeam, o.ownerId) ? ' (you)' : ''}
            </option>
          ))}
        </select>
        {yoursListed && team !== yourTeam && (
          <button type="button" className="tx-chip" onClick={() => setTeam(yourTeam)}>
            My team
          </button>
        )}
        {team && (
          <button type="button" className="tx-chip" onClick={() => setTeam(null)}>
            Show all teams
          </button>
        )}
      </div>

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
      {loading && progress && progress[1] > 1 && (
        <p className="subtitle">
          Loading season {Math.min(progress[0] + 1, progress[1])} of {progress[1]}…
        </p>
      )}
      {loading && <ListSkeleton rows={4} />}

      {shown && shown.missing.length > 0 && (
        <p className="subtitle">
          ESPN didn't return any transactions for {listYears(shown.missing)}, so{' '}
          {shown.missing.length === 1 ? 'that season is' : 'those seasons are'} missing here rather than empty. This
          page tries again later.
        </p>
      )}
      {shown && kind === 'trades' && shown.short.length > 0 && (
        <p className="subtitle">
          ESPN records{' '}
          {shown.short
            .map((s) => `${plural(s.espn, 'trade')} in ${s.year} (${s.shown} shown)`)
            .join(', ')}
          . Earlier seasons' trades are rebuilt from weekly rosters, so two trades between the same two teams within a
          week of each other appear as one.
        </p>
      )}
      {shown && count === 0 && shown.missing.length === 0 && (
        <p className="subtitle">
          {team
            ? `${teamName ?? 'This team'} made no ${kindInfo.noun}s in ${scope}.`
            : `No ${kindInfo.noun}s in ${scope}. ESPN keeps transactions from ${FIRST_TRADE_YEAR} on.`}
        </p>
      )}

      {shown && count > 0 && kind === 'trades' && (
        <TradesView
          trades={trades}
          all={shown.trades}
          team={team}
          yourTeam={yourTeam}
          allSeasons={year === 'all'}
          onFilter={setTeam}
        />
      )}
      {shown && count > 0 && kind !== 'trades' && (
        <MovesView
          moves={moves}
          kind={kind}
          team={team}
          yourTeam={yourTeam}
          allSeasons={year === 'all'}
          onFilter={setTeam}
        />
      )}
    </div>
  )
}

function Stat({ label, value, sub, valueTone = '' }: { label: string; value: string | number; sub?: string; valueTone?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className={`stat-value${valueTone ? ` ${valueTone}` : ''}`}>{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

function DayRecords({ ownerDay, leagueDay, noun }: { ownerDay: OwnerDay | null; leagueDay: BusiestDay | null; noun: string }) {
  if (!ownerDay || !leagueDay) return null
  return (
    <div className="trade-callouts">
      {/* One in a day isn't a record worth naming. */}
      {ownerDay.count >= 2 && (
        <Stat label={`Most ${noun}s in one day`} value={ownerDay.count} sub={`${ownerDay.name}, ${dayLabel(ownerDay.day)}`} />
      )}
      <Stat label="League's busiest day" value={leagueDay.count} sub={`${plural(leagueDay.count, noun)}, ${dayLabel(leagueDay.day)}`} />
    </div>
  )
}

/** A record table's count, as a button that narrows the page to that team. */
function FilterCount({ n, name, noun, ownerId, onFilter }: { n: number; name: string; noun: string; ownerId: string; onFilter: (ownerId: string) => void }) {
  return (
    <button type="button" className="tx-count" title={`Show only ${name}'s ${noun}s`} onClick={() => onFilter(ownerId)}>
      {n}
    </button>
  )
}

function TradesView({
  trades,
  all,
  team,
  yourTeam,
  allSeasons,
  onFilter,
}: {
  /** The trades shown: the team's, with a team picked. */
  trades: Trade[]
  /** Every loaded trade, to follow a player traded on by the other side. */
  all: Trade[]
  team: string | null
  yourTeam: string | null
  allSeasons: boolean
  onFilter: (ownerId: string) => void
}) {
  const onward = tradedOn(all)
  return (
    <>
      <details className="tx-method">
        <summary>How trades are scored</summary>
        <p>
          Trades are won on WAR, wins above replacement: for each start a side's new players made for it from the
          week of the trade on, how much more likely their points made an average team to win than a waiver-level
          player's would have. Bench weeks don't count. Points per game compare each team as it played with how it
          would have done keeping the players it sent. Completed weeks only.
        </p>
      </details>
      {team ? (
        <TeamTrades trades={trades} team={team} />
      ) : (
        <LeagueTrades trades={trades} yourTeam={yourTeam} allSeasons={allSeasons} onFilter={onFilter} />
      )}
      {(allSeasons ? bySeason(trades) : [{ year: 0, items: [...trades].sort((a, b) => b.date - a.date) }]).map((g) => (
        <section key={g.year} className="tx-season">
          {allSeasons && <SeasonHead year={g.year} trades={g.items} team={team} />}
          <div className="trade-list">
            {g.items.map((t) => (
              <TradeCard key={`${t.year}:${t.uid}`} trade={t} team={team} yourTeam={yourTeam} onward={onward} />
            ))}
          </div>
        </section>
      ))}
    </>
  )
}

/** A season's heading in All seasons: its trades, and the team's record in them. */
function SeasonHead({ year, trades, team }: { year: number; trades: Trade[]; team: string | null }) {
  const seen = team ? trades.map((t) => tradeFor(t, team)).filter((x): x is TradeFor => !!x) : []
  const won = seen.filter((s) => s.result === 'won').length
  const lost = seen.filter((s) => s.result === 'lost').length
  return (
    <h3 className="tx-season-head">
      {year}
      <span>
        {' '}
        · {plural(trades.length, 'trade')}
        {team && ` · ${won}–${lost}`}
      </span>
    </h3>
  )
}

/** Every team's trading: the day records, the records table and the most one-sided trade. */
function LeagueTrades({
  trades,
  yourTeam,
  allSeasons,
  onFilter,
}: {
  trades: Trade[]
  yourTeam: string | null
  allSeasons: boolean
  onFilter: (ownerId: string) => void
}) {
  const records = traderRecords(trades)
  const biggest = biggestWin(trades)
  return (
    <>
      <DayRecords {...tradeDays(trades)} noun="trade" />
      <section className="trade-summary">
        <table className="tw-standings trade-records">
          <thead>
            <tr>
              <th>Team</th>
              <th className="num">Trades</th>
              <th className="num">Won–Lost</th>
              <th className="num" title="WAR gained minus WAR given up across their trades">
                Net WAR
              </th>
              <th className="num" title="Points per game each trade added on average, against keeping the players they sent">
                PPG +/−
              </th>
            </tr>
          </thead>
          <tbody>
            {records.map((r) => (
              <tr key={r.ownerId} className={isYours(yourTeam, r.ownerId) ? 'your-team' : ''}>
                <td>
                  <TeamLink ownerId={r.ownerId}>{r.name}</TeamLink>
                </td>
                <td className="num">
                  <FilterCount n={r.trades} name={r.name} noun="trade" ownerId={r.ownerId} onFilter={onFilter} />
                </td>
                <td className="num">
                  {r.won}–{r.lost}
                </td>
                <td className={`num ${tone(r.netWar)}`}>{fmtWar(r.netWar)}</td>
                <td className={`num ${tone(r.ppgGain)}`}>{r.ppgGain === null ? '—' : signed(r.ppgGain)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="tw-note">Pick a team's trade count to see just their trades.</p>
        {biggest && (
          <p className="tw-note">
            Most one-sided{allSeasons ? ' ever' : ''}:{' '}
            {biggest.sides.find((s) => s.team_id === biggest.winner_team_id)?.team_name} won by {wins(biggest.margin)} (
            {dateLabel(biggest.date)}).
          </p>
        )}
      </section>
    </>
  )
}

const partnerNames = (seen: TradeFor) => seen.others.map((s) => s.team_name).join(' and ')

/** One team's trading: their record, best and worst trades, and partners. */
function TeamTrades({ trades, team }: { trades: Trade[]; team: string }) {
  const summary = teamTradeSummary(trades, team)
  if (!summary) return null
  const { record: r, best, worst } = summary
  const even = r.trades - r.won - r.lost
  const partners = partnerRecords(trades, team)
  return (
    <>
      <div className="trade-callouts tx-stats">
        <Stat label="Trades" value={r.trades} sub={`with ${plural(partners.length, 'team')}`} />
        <Stat label="Won–Lost" value={`${r.won}–${r.lost}`} sub={even ? `${even} even` : undefined} />
        <Stat label="Net WAR" value={fmtWar(r.netWar)} valueTone={tone(r.netWar)} sub="gained less given up" />
        {r.ppgGain !== null && (
          <Stat label="PPG +/−" value={signed(r.ppgGain)} valueTone={tone(r.ppgGain)} sub="per trade, against keeping" />
        )}
      </div>
      {best && (
        <div className="trade-callouts">
          <Stat
            label="Best trade"
            value={`${fmtWar(best.net)} WAR`}
            valueTone={tone(best.net)}
            sub={`with ${partnerNames(best)}, ${dateLabel(best.trade.date)}`}
          />
          {worst && (
            <Stat
              label="Worst trade"
              value={`${fmtWar(worst.net)} WAR`}
              valueTone={tone(worst.net)}
              sub={`with ${partnerNames(worst)}, ${dateLabel(worst.trade.date)}`}
            />
          )}
        </div>
      )}
      <section className="trade-summary">
        <table className="tw-standings trade-records">
          <thead>
            <tr>
              <th>Traded with</th>
              <th className="num">Trades</th>
              <th className="num">Won–Lost</th>
              <th className="num" title="Their WAR less this partner's, across trades between them">
                Net WAR
              </th>
            </tr>
          </thead>
          <tbody>
            {partners.map((p) => (
              <tr key={p.ownerId}>
                <td>
                  <TeamLink ownerId={p.ownerId}>{p.name}</TeamLink>
                </td>
                <td className="num">{p.trades}</td>
                <td className="num">
                  {p.won}–{p.lost}
                </td>
                <td className={`num ${tone(p.netWar)}`}>{fmtWar(p.netWar)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  )
}

/** A trade. With a team picked, their side comes first and the verdict is theirs. */
function TradeCard({
  trade,
  team,
  yourTeam,
  onward,
}: {
  trade: Trade
  team: string | null
  yourTeam: string | null
  onward: Map<string, string>
}) {
  const seen = team ? tradeFor(trade, team) : null
  const sides = seen ? [seen.side, ...seen.others] : trade.sides
  const winner = trade.sides.find((s) => s.team_id === trade.winner_team_id)
  // Picking a team already says whose trades these are: no highlight then.
  const mine = !team && trade.sides.some((s) => isYours(yourTeam, s.owner_id))
  const verdict = seen
    ? seen.result === 'won'
      ? `Won by ${wins(trade.margin)}`
      : seen.result === 'lost'
        ? `Lost by ${wins(trade.margin)}`
        : 'Even so far'
    : winner
      ? `${winner.team_name} won by ${wins(trade.margin)}`
      : 'Even so far'
  const verdictTone = !winner ? ' even' : seen?.result === 'lost' ? ' lost' : ''
  const year = trade.year
  return (
    <article className={`trade-card${mine ? ' your-matchup' : ''}${seen ? ` tx-${seen.result}` : ''}`}>
      <header className="trade-head">
        <span>
          Week {trade.week} · {dateLabel(trade.date)}
        </span>
        <span className={`trade-verdict${verdictTone}`}>{verdict}</span>
      </header>
      <div className="trade-sides">
        {sides.map((s) => (
          <TradeSideView
            key={s.team_id}
            side={s}
            year={year}
            won={s.team_id === trade.winner_team_id}
            onwardOf={(playerId) => onward.get(`${trade.uid}:${s.team_id}:${playerId}`)}
          />
        ))}
      </div>
    </article>
  )
}

function TradeSideView({
  side,
  year,
  won,
  onwardOf,
}: {
  side: TradeSide
  year: number
  won: boolean
  /** The team a received player was traded on to, if he was. */
  onwardOf: (playerId: number) => string | undefined
}) {
  return (
    <div className={`trade-side${won ? ' won' : ''}`}>
      <div className="trade-side-head">
        <TeamLink ownerId={side.owner_id} year={year}>
          {side.team_name}
        </TeamLink>
        <span className="trade-side-total" title={`${fmt(side.started_points)} starting points`}>
          {fmtWar(side.war)} WAR
        </span>
      </div>
      <PpgLine side={side} />
      <div className="trade-got">got</div>
      <ul>
        {side.received.map((p) => (
          <li key={p.player_id}>
            <span className="trade-player">
              {p.name}
              {p.position && <span className="trade-pos"> {p.position}</span>}
            </span>
            <TradePlayerStats player={p} onward={onwardOf(p.player_id)} />
          </li>
        ))}
      </ul>
    </div>
  )
}

/** A received player's WAR and starts for his new team. One traded on before
 * he played for it says where he went; one traded on later says so too. */
function TradePlayerStats({ player: p, onward }: { player: TradeSide['received'][number]; onward?: string }) {
  if (onward && p.weeks_started === 0 && p.bench_points === 0) {
    return <span className="trade-onward">traded on to {onward}</span>
  }
  return (
    <>
      <span className="trade-pts" title={`${fmt(p.bench_points)} more on the bench`}>
        {fmtWar(p.war)}
        <span className="trade-weeks">
          {' '}
          · {fmt(p.started_points)} pts · {p.weeks_started} wk
        </span>
      </span>
      {/* Its own line, so a long team name wraps instead of running out of the card. */}
      {onward && <span className="trade-onward">then traded to {onward}</span>}
    </>
  )
}

/** The team's points per game since the trade, against keeping its players. */
function PpgLine({ side }: { side: TradeSide }) {
  if (side.ppg === null || side.ppg_if_kept === null) return null
  const gain = side.ppg - side.ppg_if_kept
  return (
    <div
      className="trade-ppg"
      title={`Over ${plural(side.games, 'game')} since the trade. Had they kept the players they sent, each slot a new player started in goes to the best of those players and their own bench that week.`}
    >
      {fmt(side.ppg)} PPG · {fmt(side.ppg_if_kept)} keeping their players{' '}
      <span className={tone(gain)}>({signed(gain)})</span>
    </div>
  )
}


const players = (ps: Move['added']) =>
  ps.length ? ps.map((p) => `${p.name}${p.position ? ` ${p.position}` : ''}`).join(', ') : '—'

function MovesView({
  moves,
  kind,
  team,
  yourTeam,
  allSeasons,
  onFilter,
}: {
  /** This kind's moves: the team's, with a team picked. */
  moves: Move[]
  kind: MoveKind
  team: string | null
  yourTeam: string | null
  allSeasons: boolean
  onFilter: (ownerId: string) => void
}) {
  const records = moveRecords(moves, kind)
  const noun = KINDS.find((k) => k.key === kind)!.noun
  const showBids = kind === 'waiver' && moves.some((m) => m.bid > 0)
  return (
    <>
      {team ? (
        <TeamMoves moves={moves} kind={kind} allSeasons={allSeasons} showBids={showBids} />
      ) : (
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
                    <td className="num">
                      <FilterCount n={r.count} name={r.name} noun={noun} ownerId={r.ownerId} onFilter={onFilter} />
                    </td>
                    <td className="num">{r.players}</td>
                    {showBids && <td className="num">${r.spent}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="tw-note">Pick a team's count to see just theirs.</p>
          </section>
        </>
      )}
      <div className="teams-wrap">
        <table className="teams moves-table">
          <thead>
            <tr>
              <th>Date</th>
              <th className="num">Wk</th>
              {!team && <th>Team</th>}
              {kind !== 'drop' && <th>Added</th>}
              <th>Dropped</th>
              {showBids && <th className="num">Bid</th>}
            </tr>
          </thead>
          <tbody>
            {[...moves]
              .sort((a, b) => b.date - a.date)
              .map((m, i) => (
                <tr
                  key={`${m.date}-${m.team_id}-${i}`}
                  className={!team && isYours(yourTeam, m.owner_id) ? 'your-team' : ''}
                >
                  <td className="nowrap">{dateLabel(m.date)}</td>
                  <td className="num">{m.week}</td>
                  {!team && <td className="nowrap">{m.team_name}</td>}
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

/** One team's moves of a kind: totals, their busiest day, and by season in All seasons. */
function TeamMoves({ moves, kind, allSeasons, showBids }: { moves: Move[]; kind: MoveKind; allSeasons: boolean; showBids: boolean }) {
  const [total] = moveRecords(moves, kind)
  if (!total) return null
  const info = KINDS.find((k) => k.key === kind)!
  const { ownerDay } = moveDays(moves)
  const seasons = allSeasons ? bySeason(moves).map((g) => ({ year: g.year, r: moveRecords(g.items, kind)[0] })) : []
  return (
    <>
      <div className="trade-callouts tx-stats">
        <Stat label={info.label} value={total.count} />
        <Stat label={kind === 'drop' ? 'Players dropped' : 'Players added'} value={total.players} />
        {showBids && <Stat label="Budget spent" value={`$${total.spent}`} />}
        {ownerDay && ownerDay.count >= 2 && <Stat label="Most in one day" value={ownerDay.count} sub={dayLabel(ownerDay.day)} />}
      </div>
      {seasons.length > 1 && (
        <section className="trade-summary">
          <table className="tw-standings trade-records">
            <thead>
              <tr>
                <th>Season</th>
                <th className="num">{kind === 'drop' ? 'Drops' : 'Pickups'}</th>
                <th className="num">Players</th>
                {showBids && <th className="num">Budget spent</th>}
              </tr>
            </thead>
            <tbody>
              {seasons.map(({ year, r }) => (
                <tr key={year}>
                  <td>{year}</td>
                  <td className="num">{r.count}</td>
                  <td className="num">{r.players}</td>
                  {showBids && <td className="num">${r.spent}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  )
}
