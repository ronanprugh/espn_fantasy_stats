/** Transactions: a team's roster at the start of a season beside its roster at the end. */
import type { Move, RosterPlayer, SeasonRosters, Trade } from '../../api'
import { rosterChanges, type Arrival, type Departure } from '../../lib/rosterChanges'

const departureNote = (d: Departure) =>
  d.how === 'trade' ? `traded to ${d.to}, wk ${d.week}` : d.how === 'dropped' ? `dropped, wk ${d.week}` : 'left'

const arrivalNote = (a: Arrival) =>
  a.how === 'trade'
    ? `by trade from ${a.from}, wk ${a.week}`
    : a.how === 'waiver'
      ? `waiver claim, wk ${a.week}${a.bid ? ` · $${a.bid}` : ''}`
      : a.how === 'free_agent'
        ? `free agent, wk ${a.week}`
        : 'added'

/** A player as listed: `note` says how he left or joined, null if he stayed. */
type Row = RosterPlayer & { note: string | null }

function RosterColumn({ title, rows, mark }: { title: string; rows: Row[]; mark: 'gone' | 'new' }) {
  return (
    <div className="roster-col">
      <h4>{title}</h4>
      <ul>
        {rows.map((p) => (
          <li key={p.player_id} className={p.note === null ? '' : mark}>
            <span className="rc-pos">{p.position}</span>
            <span className="rc-name">
              {p.name}
              <span className="rc-team"> {p.pro_team}</span>
              {p.slot_position === 'IR' && <span className="rc-ir"> IR</span>}
            </span>
            {p.note !== null && <span className="rc-note">{p.note}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * The roster a team started the season with beside the one it ended with
 * (or has now, in a season being played): who stayed, who left and how, and
 * who joined and how.
 */
export function RosterChangesView({
  rosters,
  ownerId,
  trades,
  moves,
}: {
  rosters: SeasonRosters
  ownerId: string
  trades: Trade[]
  moves: Move[]
}) {
  if (!rosters.supported) return <p className="subtitle">ESPN keeps rosters from 2019 on.</p>
  const { start, end } = rosters
  if (!start || !end) return <p className="subtitle">No games played yet this season, so there are no rosters to show.</p>
  const c = rosterChanges(start.players, end.players, ownerId, trades, moves)
  return (
    <section className="roster-changes">
      <p className="tw-note">
        Kept {c.kept} of {c.start.length} · <span className="rc-key new">{c.added} joined</span> ·{' '}
        <span className="rc-key gone">{c.gone} left</span>
      </p>
      <div className="roster-cols">
        <RosterColumn
          title={`Start of season · week ${start.week}`}
          rows={c.start.map((p) => ({ ...p, note: p.departure && departureNote(p.departure) }))}
          mark="gone"
        />
        <RosterColumn
          title={`${rosters.in_progress ? 'Now' : 'End of season'} · week ${end.week}`}
          rows={c.end.map((p) => ({ ...p, note: p.arrival && arrivalNote(p.arrival) }))}
          mark="new"
        />
      </div>
    </section>
  )
}
