/** Head to Head, Summary: each owner's record against the field, on desktop and phone. */
import { type HeadToHeadStats } from '../../api'
import { TeamLink } from '../../components/TeamLink'
import { type OwnerPrStats, type RankLookup } from '../../lib/powerRankings'
import { summaryRows } from '../../lib/rivalries'

/** How the power rankings called this rivalry: in meetings where both were
 * ranked, how often the better-ranked team won. */
export function RankedRecord({ data, look }: { data: HeadToHeadStats; look: RankLookup }) {
  let games = 0
  let called = 0
  let aRankedHigher = 0
  for (const m of data.matchups) {
    const ra = look(m.year, m.week, m.owner_a_team_id)?.entry.rank
    const rb = look(m.year, m.week, m.owner_b_team_id)?.entry.rank
    if (ra == null || rb == null || ra === rb || m.winner_owner_id == null) continue
    games += 1
    if (ra < rb) aRankedHigher += 1
    const favourite = ra < rb ? data.owner_a_id : data.owner_b_id
    if (m.winner_owner_id === favourite) called += 1
  }
  if (!games) return null
  return (
    <p className="subtitle h2h-pr-note">
      Power rankings: {data.owner_a_team_name} was ranked higher in {aRankedHigher} of {games} ranked meetings, and
      the better-ranked team won {called} of {games}.
    </p>
  )
}

export function H2HSummary({ data, pr }: { data: HeadToHeadStats; pr?: Map<string, OwnerPrStats> }) {
  const rows = summaryRows(data, pr)

  return (
    <section className="h2h-summary">
      <h3>Head-to-Head Summary</h3>
      <table className="h2h-table">
        <thead>
          <tr>
            <th></th>
            <th>
              <div className="h2h-team">
                <TeamLink ownerId={data.owner_a_id}>{data.owner_a_team_name}</TeamLink>
              </div>
              <div className="h2h-owner">{data.owner_a_name}</div>
            </th>
            <th>
              <div className="h2h-team">
                <TeamLink ownerId={data.owner_b_id}>{data.owner_b_team_name}</TeamLink>
              </div>
              <div className="h2h-owner">{data.owner_b_name}</div>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label}>
              <td className="label">{r.label}</td>
              <td className={`num ${r.highlight === 'a' ? 'winner-cell' : ''}`}>{r.a}</td>
              <td className={`num ${r.highlight === 'b' ? 'winner-cell' : ''}`}>{r.b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

/* The desktop summary is a table with a 480px floor, so on a phone it could only
 * scroll sideways — and a two-column comparison read through a scroll window is
 * exactly the thing that stops being a comparison. The mobile shape keeps the
 * same three parts (left value, label, right value) but drops the table: the
 * team headings become a sticky-free banner at the top, and each stat is a row
 * that fits the width because the label sits between the two figures rather
 * than in a column of its own. */
export function H2HSummaryMobile({ data, pr }: { data: HeadToHeadStats; pr?: Map<string, OwnerPrStats> }) {
  const rows = summaryRows(data, pr)
  const aLeads = data.owner_a_wins > data.owner_b_wins
  const bLeads = data.owner_b_wins > data.owner_a_wins

  return (
    <section className="h2h-summary">
      <h3>Head-to-Head Summary</h3>
      <div className="h2h-card">
        <div className="h2h-card-head">
          <div className={`h2h-card-team${aLeads ? ' leading' : ''}`}>
            <div className="h2h-card-name">
              <TeamLink ownerId={data.owner_a_id}>{data.owner_a_team_name}</TeamLink>
            </div>
            <div className="h2h-card-owner">{data.owner_a_name}</div>
          </div>
          <div className="h2h-card-record">
            <span className={aLeads ? 'leading' : ''}>{data.owner_a_wins}</span>
            <span className="dash">–</span>
            <span className={bLeads ? 'leading' : ''}>{data.owner_b_wins}</span>
            {data.ties > 0 && <span className="ties">({data.ties} T)</span>}
          </div>
          <div className={`h2h-card-team right${bLeads ? ' leading' : ''}`}>
            <div className="h2h-card-name">
              <TeamLink ownerId={data.owner_b_id}>{data.owner_b_team_name}</TeamLink>
            </div>
            <div className="h2h-card-owner">{data.owner_b_name}</div>
          </div>
        </div>

        {/* The all-time record is what the banner above already states. */}
        {rows
          .filter((r) => r.label !== 'All-time record')
          .map((r) => (
            <div key={r.label} className="h2h-stat-row">
              <span className={`h2h-stat-val${r.highlight === 'a' ? ' winner-cell' : ''}`}>
                {r.a}
              </span>
              <span className="h2h-stat-label">{r.label}</span>
              <span
                className={`h2h-stat-val right${r.highlight === 'b' ? ' winner-cell' : ''}`}
              >
                {r.b}
              </span>
            </div>
          ))}
      </div>
    </section>
  )
}
