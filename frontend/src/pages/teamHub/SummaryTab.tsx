/** Team Hub, Summary: stat cards, trophies, records and the last matchup. */
import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { type RecordEntry, type TeamHub } from '../../api'
import { RoundBadge } from '../../components/RoundBadge'
import { boxScoreHref, noBoxScoreReason } from '../../lib/links'
import { type Opponent, type FromHere } from './shared'

export function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

export function TrophyCabinet({ accolades }: { accolades: TeamHub['accolades'] }) {
  const items = [
    { count: accolades.championships, label: '1st', emoji: '🏆', years: accolades.championship_years, cls: 'gold' },
    { count: accolades.runner_ups, label: '2nd', emoji: '🥈', years: accolades.runner_up_years, cls: 'silver' },
    { count: accolades.third_places, label: '3rd', emoji: '🥉', years: accolades.third_place_years, cls: 'bronze' },
  ]
  return (
    <div className="trophy-cabinet">
      {items.map((it) => (
        <div
          key={it.label}
          className={`trophy ${it.cls}${it.count === 0 ? ' empty' : ''}`}
          title={it.years.length ? it.years.join(', ') : 'none'}
        >
          <div className="trophy-icon">{it.emoji}</div>
          <div className="trophy-count">{it.count}</div>
          <div className="trophy-sub">{it.label}</div>
        </div>
      ))}
    </div>
  )
}

export function RecordsSection({
  records,
  opponent,
  fromHere,
}: {
  records: TeamHub['records']
  opponent: Opponent
  fromHere: FromHere
}) {
  const fmtCtx = (r: RecordEntry | null) =>
    r ? (
      <>
        {r.year} · Wk {r.week} · vs {opponent(r.year, r.opp_team_id, r.opponent)}
      </>
    ) : (
      '—'
    )
  const fmtVal = (r: RecordEntry | null, sign = '') =>
    r ? `${sign}${r.value.toFixed(1)}` : '—'
  // Each game record opens its box score; the streak cards are not games.
  const game = (r: RecordEntry | null) =>
    r ? { href: boxScoreHref(r.year, r.week, r.own_team_id, r.opp_team_id), year: r.year, fromHere } : undefined
  return (
    <section className="hub-records">
      <h3>Career Records</h3>
      <div className="records-grid">
        <RecordCard
          label="Highest Score"
          value={fmtVal(records.highest_score)}
          sub={fmtCtx(records.highest_score)}
          game={game(records.highest_score)}
        />
        <RecordCard
          label="Lowest Score"
          value={fmtVal(records.lowest_score)}
          sub={fmtCtx(records.lowest_score)}
          game={game(records.lowest_score)}
        />
        <RecordCard
          label="Biggest Win"
          value={fmtVal(records.biggest_win_margin, '+')}
          sub={fmtCtx(records.biggest_win_margin)}
          accent="pos"
          game={game(records.biggest_win_margin)}
        />
        <RecordCard
          label="Worst Loss"
          value={fmtVal(records.biggest_loss_margin, '−')}
          sub={fmtCtx(records.biggest_loss_margin)}
          accent="neg"
          game={game(records.biggest_loss_margin)}
        />
        <RecordCard
          label="Longest Win Streak"
          value={`${records.longest_win_streak}`}
          accent="pos"
        />
        <RecordCard
          label="Longest Losing Streak"
          value={`${records.longest_loss_streak}`}
          accent="neg"
        />
      </div>
    </section>
  )
}

export function RecordCard({
  label,
  value,
  sub,
  accent,
  game,
}: {
  label: string
  value: string
  sub?: ReactNode
  accent?: 'pos' | 'neg'
  game?: { href: string; year: number; fromHere: FromHere }
}) {
  // The opponent inside `sub` is a link of its own, so the box score link is
  // a cover laid over the card rather than a wrapper (see .card-cover).
  const unavailable = game ? noBoxScoreReason(game.year) : null
  const linked = !!game && !unavailable
  return (
    <div
      className={`record-card${accent ? ` ${accent}` : ''}${linked ? ' clickable' : ''}`}
      title={unavailable ?? undefined}
    >
      {linked && (
        <Link
          to={game.href}
          state={game.fromHere}
          className="card-cover"
          title="View box score"
          aria-label={`${label}: view box score`}
        />
      )}
      <div className="record-label">{label}</div>
      <div className="record-value">{value}</div>
      {sub && <div className="record-sub">{sub}</div>}
    </div>
  )
}

export function LastMatchupCard({ hub, opponent, fromHere }: { hub: TeamHub; opponent: Opponent; fromHere: FromHere }) {
  const m = hub.last_matchup!
  const ownWon = m.result === 'W'
  const oppWon = m.result === 'L'
  const unavailable = noBoxScoreReason(m.year)
  return (
    <div
      className={`scoreboard-card ${unavailable ? 'disabled' : 'clickable'}`}
      title={unavailable ?? undefined}
    >
      {!unavailable && (
        <Link
          to={boxScoreHref(m.year, m.week, m.own_team_id, m.opp_team_id)}
          state={fromHere}
          className="card-cover"
          title="View box score"
          aria-label={`Box score: ${m.own_team_name} vs ${m.opp_team_name}, ${m.year} week ${m.week}`}
        />
      )}
      <div className="card-badge">
        <RoundBadge round={m.round_label} hideRegular />
      </div>
      <div className="hub-matchup-meta">
        {m.year} · Week {m.week}
      </div>
      <div className={`card-row ${ownWon ? 'winner' : ''}`}>
        <div className="team">
          <div className="team-name">{m.own_team_name}</div>
          <div className="team-owner">{hub.owner_name}</div>
        </div>
        <div className="score">{m.own_score.toFixed(1)}</div>
      </div>
      <div className={`card-row ${oppWon ? 'winner' : ''}`}>
        <div className="team">
          <div className="team-name">{opponent(m.year, m.opp_team_id, m.opp_team_name)}</div>
          <div className="team-owner">{m.opp_owner_name}</div>
        </div>
        <div className="score">{m.opp_score.toFixed(1)}</div>
      </div>
    </div>
  )
}
