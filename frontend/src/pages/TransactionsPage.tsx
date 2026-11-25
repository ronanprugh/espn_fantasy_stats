import { useEffect, useState } from 'react'
import {
  fetchMoves,
  fetchOwnerHistory,
  fetchTrades,
  type Move,
  type MoveKind,
  type Trade,
} from '../api'
import { ErrorMessage } from '../components/ErrorMessage'
import { ListSkeleton } from '../components/Loading'
import { NoLeagueSelected } from '../components/NoLeagueSelected'
import { SeasonPicker } from '../components/SeasonPicker'
import { TeamLink } from '../components/TeamLink'
import { useActiveInView } from '../hooks/useActiveInView'
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
import { MovesTable } from './transactions/Moves'
import { TeamRosters } from './transactions/TeamSeason'
import { TeamTrades, TradeCard } from './transactions/TradeViews'
import { dateLabel, dayLabel, fmtWar, KINDS, plural, signed, Stat, tone, wins, type Kind } from './transactions/shared'

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
 * waiver claims, pickups or drops; or (`?type=rosters`) the roster they
 * started a season with beside the one they ended it with.
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
  // A team's rosters, start and end: a view of its own, only with a team picked.
  const rostersView = params.get('type') === 'rosters' && !!team
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
  const key = rostersView ? 'rosters' : `${source}:${year}`
  const seasonsKey = seasons.join(',')

  useEffect(() => {
    if (!leagueId || year === null || rostersView) return
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

  // Before the early return: hooks run on every render.
  const tabsRef = useActiveInView<HTMLElement>([kind, rostersView, !!team])

  if (!leagueId) return <NoLeagueSelected />

  const shown = data && data.key === key && !loading && !rostersView ? data : null
  const scope = year === 'all' ? `${FIRST_TRADE_YEAR}–${seasons[seasons.length - 1] ?? ''}` : String(year ?? '')
  const kindInfo = KINDS.find((k) => k.key === kind)!
  const options = teamOptions(history, shown)
  const teamName = team ? (options.find((o) => o.ownerId === team)?.team ?? null) : null
  const trades = shown ? (team ? tradesFor(shown.trades, team) : shown.trades) : []
  const moves = shown ? shown.moves.filter((m) => m.kind === kind && (!team || m.owner_id === team)) : []
  const count = kind === 'trades' ? trades.length : moves.length
  // Rosters are a team's: back to trades when the team is cleared.
  const setTeam = (ownerId: string | null) =>
    update(ownerId || !rostersView ? { team: ownerId } : { team: null, type: null })
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
        {rostersView && (
          <span className="league">
            {scope}
            {teamName && ` · ${teamName}`} · rosters
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

      <nav ref={tabsRef} className="hub-tabs" aria-label="Kind of transaction">
        {KINDS.map((k) => {
          const on = !rostersView && k.key === kind
          return (
            <button
              key={k.key}
              type="button"
              className={on ? 'active' : ''}
              aria-pressed={on}
              onClick={() => update({ type: k.key === 'trades' ? null : k.key })}
            >
              {k.label}
            </button>
          )
        })}
        {team && (
          <button
            type="button"
            className={rostersView ? 'active' : ''}
            aria-pressed={rostersView}
            onClick={() => update({ type: 'rosters' })}
          >
            Rosters
          </button>
        )}
      </nav>

      {rostersView &&
        (typeof year === 'number' ? (
          <TeamRosters leagueId={leagueId} year={year} ownerId={team} />
        ) : (
          <p className="subtitle">Pick a season to see the roster {teamName ?? 'this team'} started it with beside the one it ended with.</p>
        ))}

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
      <MovesTable moves={moves} showTeam={!team} showAdded={kind !== 'drop'} showBids={showBids} yourTeam={yourTeam} />
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
