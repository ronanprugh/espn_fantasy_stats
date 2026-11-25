/** Transactions: one team's trading summary, and a trade's card. */
import type { Trade, TradeSide } from '../../api'
import { TeamLink } from '../../components/TeamLink'
import { isYours } from '../../hooks/useYourTeam'
import { partnerRecords, teamTradeSummary, tradeFor, type TradeFor } from '../../lib/trades'
import { dateLabel, fmt, fmtWar, plural, signed, Stat, tone, wins } from './shared'

const partnerNames = (seen: TradeFor) => seen.others.map((s) => s.team_name).join(' and ')

/** One team's trading: their record, best and worst trades, and partners. */
export function TeamTrades({ trades, team }: { trades: Trade[]; team: string }) {
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
export function TradeCard({
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
