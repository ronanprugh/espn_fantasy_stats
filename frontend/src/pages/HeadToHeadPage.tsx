import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  fetchHeadToHead,
  fetchOwnerHistory,
  type HeadToHeadMatchup,
  type HeadToHeadStats,
  type OwnerHistory,
} from '../api'
import { NoLeagueSelected } from '../components/NoLeagueSelected'
import { PrBadge } from '../components/PrBadge'
import { RoundBadge } from '../components/RoundBadge'
import { useLeague } from '../contexts/LeagueContext'
import { useIsMobile } from '../hooks/useIsMobile'
import { Loading } from '../components/Loading'
import { ErrorMessage } from '../components/ErrorMessage'
import { useUrlState } from '../hooks/useUrlState'
import { usePowerRankings } from '../hooks/usePowerRankings'
import { ownerStats, rankLookup, type OwnerPrStats, type RankLookup } from '../lib/powerRankings'

export function HeadToHeadPage() {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const { selectedLeague } = useLeague()
  const [owners, setOwners] = useState<OwnerHistory[]>([])
  const [params, update] = useUrlState()
  const ownerA = params.get('a') ?? ''
  const ownerB = params.get('b') ?? ''
  const [data, setData] = useState<HeadToHeadStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pr = usePowerRankings(selectedLeague?.espn_league_id ?? null)
  const look = useMemo(() => (pr.hasData ? rankLookup(pr.data) : undefined), [pr.data, pr.hasData])
  const prStats = useMemo(
    () => (pr.hasData && pr.data ? new Map(ownerStats(pr.data).map((o) => [o.ownerId, o])) : undefined),
    [pr.data, pr.hasData],
  )

  useEffect(() => {
    if (!selectedLeague) return
    fetchOwnerHistory(selectedLeague.espn_league_id)
      .then((h) => {
        setOwners(h.owners)
        if (!ownerA && selectedLeague.favorite_owner_id) {
          const fav = h.owners.find((o) => o.owner_id === selectedLeague.favorite_owner_id)
          if (fav) update({ a: fav.owner_id })
        }
      })
      .catch((e: Error) => setError(e.message))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLeague?.espn_league_id])

  useEffect(() => {
    if (!selectedLeague || !ownerA || !ownerB || ownerA === ownerB) {
      setData(null)
      return
    }
    setLoading(true)
    setError(null)
    fetchHeadToHead(selectedLeague.espn_league_id, ownerA, ownerB)
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [selectedLeague?.espn_league_id, ownerA, ownerB])

  if (!selectedLeague) return <NoLeagueSelected />


  const handleMatchupClick = (m: HeadToHeadMatchup) => {
    if (m.year < 2019) return // box scores unavailable
    navigate(`/box_score/${m.year}/${m.week}/${m.owner_a_team_id}/${m.owner_b_team_id}`)
  }

  return (
    <div className="page">
      <header className="page-header">
        <h2>Head to Head</h2>
      </header>

      {error && <ErrorMessage message={error} />}

      <div className="compare-controls">
        <div className="control">
          <label htmlFor="owner-a">Team A</label>
          <select
            id="owner-a"
            value={ownerA}
            onChange={(e) => update({ a: e.target.value || null })}
          >
            <option value="">— pick a team —</option>
            {owners
              .filter((o) => o.owner_id !== ownerB)
              .map((o) => (
                <option key={o.owner_id} value={o.owner_id}>
                  {o.current_team_name} — {o.owner_name}
                </option>
              ))}
          </select>
        </div>

        <div className="control">
          <label htmlFor="owner-b">Team B</label>
          <select
            id="owner-b"
            value={ownerB}
            onChange={(e) => update({ b: e.target.value || null })}
          >
            <option value="">— pick a team —</option>
            {owners
              .filter((o) => o.owner_id !== ownerA)
              .map((o) => (
                <option key={o.owner_id} value={o.owner_id}>
                  {o.current_team_name} — {o.owner_name}
                </option>
              ))}
          </select>
        </div>
      </div>

      {loading && <Loading />}

      {!loading && data && data.total_matchups === 0 && (
        <p className="subtitle" style={{ marginTop: 24 }}>
          These two have never played each other.
        </p>
      )}

      {!loading && data && data.total_matchups > 0 && (
        <>
          {isMobile ? <H2HSummaryMobile data={data} pr={prStats} /> : <H2HSummary data={data} pr={prStats} />}
          {look && <RankedRecord data={data} look={look} />}
          {isMobile ? (
            <H2HMatchupsMobile matchups={data.matchups} data={data} onClick={handleMatchupClick} look={look} />
          ) : (
            <H2HMatchupsList matchups={data.matchups} data={data} onClick={handleMatchupClick} look={look} />
          )}
        </>
      )}
    </div>
  )
}

type SummaryRow = {
  label: string
  a: string | number
  b: string | number
  highlight?: 'a' | 'b' | null
}

/** How the power rankings called this rivalry: in meetings where both were
 * ranked, how often the better-ranked team won. */
function RankedRecord({ data, look }: { data: HeadToHeadStats; look: RankLookup }) {
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

function summaryRows(data: HeadToHeadStats, pr?: Map<string, OwnerPrStats>): SummaryRow[] {
  const pa = pr?.get(data.owner_a_id)
  const pb = pr?.get(data.owner_b_id)
  const prRows: SummaryRow[] =
    pa?.avgRank != null && pb?.avgRank != null
      ? [
          {
            label: 'Avg Power Rank',
            a: pa.avgRank.toFixed(2),
            b: pb.avgRank.toFixed(2),
            highlight: pa.avgRank < pb.avgRank ? 'a' : pb.avgRank < pa.avgRank ? 'b' : null,
          },
          {
            label: 'Weeks at #1',
            a: pa.weeksAt1,
            b: pb.weeksAt1,
            highlight: pa.weeksAt1 > pb.weeksAt1 ? 'a' : pb.weeksAt1 > pa.weeksAt1 ? 'b' : null,
          },
        ]
      : []
  return [
    {
      label: 'All-time record',
      a: `${data.owner_a_wins}-${data.owner_b_wins}${data.ties ? `-${data.ties}` : ''}`,
      b: `${data.owner_b_wins}-${data.owner_a_wins}${data.ties ? `-${data.ties}` : ''}`,
      highlight: data.owner_a_wins > data.owner_b_wins ? 'a' : data.owner_b_wins > data.owner_a_wins ? 'b' : null,
    },
    {
      label: 'Total matchups',
      a: data.total_matchups,
      b: data.total_matchups,
    },
    {
      label: 'Avg Points For',
      a: data.owner_a_avg_pf.toFixed(2),
      b: data.owner_b_avg_pf.toFixed(2),
      highlight: data.owner_a_avg_pf > data.owner_b_avg_pf ? 'a' : data.owner_b_avg_pf > data.owner_a_avg_pf ? 'b' : null,
    },
    {
      label: 'Total Points For',
      a: data.owner_a_total_pf.toFixed(1),
      b: data.owner_b_total_pf.toFixed(1),
    },
    {
      label: 'Avg Points Against',
      a: data.owner_b_avg_pf.toFixed(2),
      b: data.owner_a_avg_pf.toFixed(2),
    },
    {
      label: 'Playoff matchups',
      a: data.playoff_matchups,
      b: data.playoff_matchups,
    },
    {
      label: 'Playoff wins',
      a: data.owner_a_playoff_wins,
      b: data.owner_b_playoff_wins,
      highlight:
        data.owner_a_playoff_wins > data.owner_b_playoff_wins
          ? 'a'
          : data.owner_b_playoff_wins > data.owner_a_playoff_wins
          ? 'b'
          : null,
    },
    {
      label: 'Playoff losses',
      a: data.owner_b_playoff_wins,
      b: data.owner_a_playoff_wins,
    },
    ...prRows,
  ]
}

function H2HSummary({ data, pr }: { data: HeadToHeadStats; pr?: Map<string, OwnerPrStats> }) {
  const rows = summaryRows(data, pr)

  return (
    <section className="h2h-summary">
      <h3>Head-to-Head Summary</h3>
      <table className="h2h-table">
        <thead>
          <tr>
            <th></th>
            <th>
              <div className="h2h-team">{data.owner_a_team_name}</div>
              <div className="h2h-owner">{data.owner_a_name}</div>
            </th>
            <th>
              <div className="h2h-team">{data.owner_b_team_name}</div>
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
function H2HSummaryMobile({ data, pr }: { data: HeadToHeadStats; pr?: Map<string, OwnerPrStats> }) {
  const rows = summaryRows(data, pr)
  const aLeads = data.owner_a_wins > data.owner_b_wins
  const bLeads = data.owner_b_wins > data.owner_a_wins

  return (
    <section className="h2h-summary">
      <h3>Head-to-Head Summary</h3>
      <div className="h2h-card">
        <div className="h2h-card-head">
          <div className={`h2h-card-team${aLeads ? ' leading' : ''}`}>
            <div className="h2h-card-name">{data.owner_a_team_name}</div>
            <div className="h2h-card-owner">{data.owner_a_name}</div>
          </div>
          <div className="h2h-card-record">
            <span className={aLeads ? 'leading' : ''}>{data.owner_a_wins}</span>
            <span className="dash">–</span>
            <span className={bLeads ? 'leading' : ''}>{data.owner_b_wins}</span>
            {data.ties > 0 && <span className="ties">({data.ties} T)</span>}
          </div>
          <div className={`h2h-card-team right${bLeads ? ' leading' : ''}`}>
            <div className="h2h-card-name">{data.owner_b_team_name}</div>
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

/* Seven columns of matchup history do not survive a phone width, and the two
 * that matter — who scored what — are the ones a table would squeeze. Each
 * matchup becomes a card: meta line on top, then the two scores facing each
 * other with the winner marked. Rows stay tappable through to the box score. */
function H2HMatchupsMobile({
  matchups,
  data,
  onClick,
  look,
}: {
  matchups: HeadToHeadMatchup[]
  data: HeadToHeadStats
  onClick: (m: HeadToHeadMatchup) => void
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
          const clickable = m.year >= 2019
          return (
            <div
              key={i}
              className={`h2h-m-card${clickable ? ' clickable' : ''}`}
              onClick={clickable ? () => onClick(m) : undefined}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              onKeyDown={
                clickable
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onClick(m)
                      }
                    }
                  : undefined
              }
            >
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
            </div>
          )
        })}
      </div>
    </section>
  )
}

function Rank({ look, m, side }: { look?: RankLookup; m: HeadToHeadMatchup; side: 'a' | 'b' }) {
  const r = look?.(m.year, m.week, side === 'a' ? m.owner_a_team_id : m.owner_b_team_id)
  return r ? <PrBadge rank={r.entry.rank} assumed={r.assumed} sourceWeek={r.sourceWeek} /> : null
}

function H2HMatchupsList({
  matchups,
  data,
  onClick,
  look,
}: {
  matchups: HeadToHeadMatchup[]
  data: HeadToHeadStats
  onClick: (m: HeadToHeadMatchup) => void
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
            return (
              <tr
                key={i}
                onClick={() => onClick(m)}
                className={m.year >= 2019 ? 'clickable-row' : ''}
                title={m.year >= 2019 ? 'View box score' : 'Box scores not available before 2019'}
              >
                <td className="num">{m.year}</td>
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
