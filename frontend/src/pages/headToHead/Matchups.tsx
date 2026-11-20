/** Head to Head, Matchups: every game between two owners, on desktop and phone. */
import { type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { type HeadToHeadMatchup, type HeadToHeadStats } from '../../api'
import { PrBadge } from '../../components/PrBadge'
import { RoundBadge } from '../../components/RoundBadge'
import { useFromHere } from '../../hooks/useFromHere'
import { boxScoreHref, noBoxScoreReason } from '../../lib/links'
import { type RankLookup } from '../../lib/powerRankings'

export type FromHere = ReturnType<typeof useFromHere>

export const matchupHref = (m: HeadToHeadMatchup) =>
  boxScoreHref(m.year, m.week, m.owner_a_team_id, m.owner_b_team_id)

/** A phone matchup card. Nothing inside it is a link, so the card itself is
 * one; a game with no box score is a plain card that says why on hover. */
export function MatchupCard({ m, fromHere, children }: { m: HeadToHeadMatchup; fromHere: FromHere; children: ReactNode }) {
  const unavailable = noBoxScoreReason(m.year)
  return unavailable ? (
    <div className="h2h-m-card" title={unavailable}>
      {children}
    </div>
  ) : (
    <Link
      to={matchupHref(m)}
      state={fromHere}
      className="h2h-m-card clickable"
      aria-label={`Box score: ${m.year} week ${m.week}, ${m.owner_a_score.toFixed(1)} to ${m.owner_b_score.toFixed(1)}`}
    >
      {children}
    </Link>
  )
}

export function Rank({ look, m, side }: { look?: RankLookup; m: HeadToHeadMatchup; side: 'a' | 'b' }) {
  const r = look?.(m.year, m.week, side === 'a' ? m.owner_a_team_id : m.owner_b_team_id)
  return r ? <PrBadge rank={r.entry.rank} assumed={r.assumed} sourceWeek={r.sourceWeek} /> : null
}

/* Seven columns of matchup history do not survive a phone width, and the two
 * that matter — who scored what — are the ones a table would squeeze. Each
 * matchup becomes a card: meta line on top, then the two scores facing each
 * other with the winner marked. Rows stay tappable through to the box score. */
export function H2HMatchupsMobile({
  matchups,
  data,
  fromHere,
  look,
}: {
  matchups: HeadToHeadMatchup[]
  data: HeadToHeadStats
  fromHere: FromHere
  look?: RankLookup
}) {
  return (
    <section className="h2h-matchups">
      <h3>All Matchups ({matchups.length})</h3>
      {/* Which side is whose is stated once, above the list, rather than
        * repeated on every card where it would crowd out the scores. */}
      <div className="h2h-m-head">
        <span>{data.owner_a_team_name}</span>
        <span className="right">{data.owner_b_team_name}</span>
      </div>
      <div className="h2h-m-list">
        {matchups.map((m, i) => {
          const aWon = m.winner_owner_id === data.owner_a_id
          const bWon = m.winner_owner_id === data.owner_b_id
          return (
            <MatchupCard key={i} m={m} fromHere={fromHere}>
              <div className="h2h-m-meta">
                <span>
                  {m.year} · Wk {m.week}
                </span>
                <RoundBadge round={m.round_label} />
              </div>
              <div className="h2h-m-scores">
                <span className={`h2h-m-score${aWon ? ' winner-cell' : ''}`}>
                  <Rank look={look} m={m} side="a" /> {m.owner_a_score.toFixed(1)}
                </span>
                <span className="h2h-m-vs">vs</span>
                <span className={`h2h-m-score right${bWon ? ' winner-cell' : ''}`}>
                  {m.owner_b_score.toFixed(1)} <Rank look={look} m={m} side="b" />
                </span>
              </div>
            </MatchupCard>
          )
        })}
      </div>
    </section>
  )
}

export function H2HMatchupsList({
  matchups,
  data,
  fromHere,
  look,
}: {
  matchups: HeadToHeadMatchup[]
  data: HeadToHeadStats
  fromHere: FromHere
  look?: RankLookup
}) {
  return (
    <section className="h2h-matchups">
      <h3>All Matchups ({matchups.length})</h3>
      <table className="h2h-matchups-table">
        <thead>
          <tr>
            <th>Year</th>
            <th>Week</th>
            <th>Round</th>
            <th>{data.owner_a_team_name}</th>
            <th></th>
            <th>{data.owner_b_team_name}</th>
            <th>Winner</th>
          </tr>
        </thead>
        <tbody>
          {matchups.map((m, i) => {
            const aWon = m.winner_owner_id === data.owner_a_id
            const bWon = m.winner_owner_id === data.owner_b_id
            const unavailable = noBoxScoreReason(m.year)
            return (
              <tr
                key={i}
                className={unavailable ? '' : 'clickable-row link-row'}
                title={unavailable ?? undefined}
              >
                <td className="num">
                  {!unavailable && (
                    <Link
                      to={matchupHref(m)}
                      state={fromHere}
                      className="row-cover"
                      title="View box score"
                      aria-label={`Box score: ${m.year} week ${m.week}`}
                    />
                  )}
                  {m.year}
                </td>
                <td className="num">Wk {m.week}</td>
                <td><RoundBadge round={m.round_label} /></td>
                <td className={`num ${aWon ? 'winner-cell' : ''}`}>
                  <Rank look={look} m={m} side="a" /> {m.owner_a_score.toFixed(1)}
                </td>
                <td className="vs">vs</td>
                <td className={`num ${bWon ? 'winner-cell' : ''}`}>
                  {m.owner_b_score.toFixed(1)} <Rank look={look} m={m} side="b" />
                </td>
                <td>
                  {aWon
                    ? data.owner_a_team_name
                    : bWon
                    ? data.owner_b_team_name
                    : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
