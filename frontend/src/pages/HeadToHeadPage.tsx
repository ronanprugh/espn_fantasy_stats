import { useEffect, useState } from 'react'
import {
  fetchConfig,
  fetchHeadToHead,
  fetchOwnerHistory,
  type Config,
  type HeadToHeadMatchup,
  type HeadToHeadStats,
  type OwnerHistory,
} from '../api'

export function HeadToHeadPage() {
  const [config, setConfig] = useState<Config | null>(null)
  const [owners, setOwners] = useState<OwnerHistory[]>([])
  const [ownerA, setOwnerA] = useState<string>('')
  const [ownerB, setOwnerB] = useState<string>('')
  const [data, setData] = useState<HeadToHeadStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchConfig()
      .then((c) => {
        setConfig(c)
        return fetchOwnerHistory(c.league_id)
      })
      .then((h) => setOwners(h.owners))
      .catch((e) => setError(String(e)))
  }, [])

  useEffect(() => {
    if (!config || !ownerA || !ownerB || ownerA === ownerB) {
      setData(null)
      return
    }
    setLoading(true)
    setError(null)
    fetchHeadToHead(config.league_id, ownerA, ownerB)
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [config, ownerA, ownerB])

  const handleMatchupClick = (_m: HeadToHeadMatchup) => {
    // Future: navigate to box score for this matchup.
  }

  return (
    <div className="page">
      <header className="page-header">
        <h2>Head to Head</h2>
      </header>

      {error && <p className="error">{error}</p>}

      <div className="compare-controls">
        <div className="control">
          <label htmlFor="owner-a">Team A</label>
          <select
            id="owner-a"
            value={ownerA}
            onChange={(e) => setOwnerA(e.target.value)}
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
            onChange={(e) => setOwnerB(e.target.value)}
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

      {loading && <p>Loading…</p>}

      {!loading && data && data.total_matchups === 0 && (
        <p className="subtitle" style={{ marginTop: 24 }}>
          These two have never played each other.
        </p>
      )}

      {!loading && data && data.total_matchups > 0 && (
        <>
          <H2HSummary data={data} />
          <H2HMatchupsList matchups={data.matchups} data={data} onClick={handleMatchupClick} />
        </>
      )}
    </div>
  )
}

function H2HSummary({ data }: { data: HeadToHeadStats }) {
  const rows: Array<{ label: string; a: string | number; b: string | number; highlight?: 'a' | 'b' | null }> = [
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
  ]

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
              <td className={r.highlight === 'a' ? 'winner-cell' : ''}>{r.a}</td>
              <td className={r.highlight === 'b' ? 'winner-cell' : ''}>{r.b}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function H2HMatchupsList({
  matchups,
  data,
  onClick,
}: {
  matchups: HeadToHeadMatchup[]
  data: HeadToHeadStats
  onClick: (m: HeadToHeadMatchup) => void
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
                className="clickable-row"
                title="Coming soon: click for box score"
              >
                <td>{m.year}</td>
                <td>Wk {m.week}</td>
                <td>{m.is_playoff ? <span className="playoff-tag">Playoff</span> : 'Regular'}</td>
                <td className={aWon ? 'winner-cell' : ''}>{m.owner_a_score.toFixed(1)}</td>
                <td className="vs">vs</td>
                <td className={bWon ? 'winner-cell' : ''}>{m.owner_b_score.toFixed(1)}</td>
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
