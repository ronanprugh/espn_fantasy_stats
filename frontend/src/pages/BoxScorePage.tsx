import { Fragment, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  fetchBoxScores,
  fetchConfig,
  type BoxPlayer,
  type BoxScoreMatchup,
  type BoxScoreTeam,
  type Config,
} from '../api'

const STARTER_ORDER = ['QB', 'RB', 'WR', 'TE', 'RB/WR/TE', 'WR/TE', 'OP', 'FLEX', 'K', 'D/ST']

function isStarter(slot: string): boolean {
  return slot !== 'BE' && slot !== 'IR' && slot !== ''
}

function slotRank(slot: string): number {
  const i = STARTER_ORDER.indexOf(slot)
  return i === -1 ? STARTER_ORDER.length : i
}

function sortLineup(lineup: BoxPlayer[]): BoxPlayer[] {
  return [...lineup].sort((a, b) => {
    const aS = isStarter(a.slot_position)
    const bS = isStarter(b.slot_position)
    if (aS !== bS) return aS ? -1 : 1
    if (aS) return slotRank(a.slot_position) - slotRank(b.slot_position)
    // bench before IR
    if (a.slot_position !== b.slot_position) return a.slot_position === 'BE' ? -1 : 1
    return b.points - a.points
  })
}

export function BoxScorePage() {
  const params = useParams<{ year: string; week: string; teamA: string; teamB: string }>()
  const year = Number(params.year)
  const week = Number(params.week)
  const teamA = Number(params.teamA)
  const teamB = Number(params.teamB)

  const [config, setConfig] = useState<Config | null>(null)
  const [matchup, setMatchup] = useState<BoxScoreMatchup | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchConfig().then(setConfig).catch((e) => setError(String(e)))
  }, [])

  useEffect(() => {
    if (!config) return
    setLoading(true)
    setError(null)
    fetchBoxScores(config.league_id, year, week)
      .then((data) => {
        const ids = new Set([teamA, teamB])
        const found = data.matchups.find((m) => {
          const hId = m.home?.team_id
          const aId = m.away?.team_id
          return (
            (hId !== undefined && aId !== undefined && ids.has(hId) && ids.has(aId)) ||
            (hId !== undefined && ids.has(hId) && !m.away) ||
            (aId !== undefined && ids.has(aId) && !m.home)
          )
        })
        setMatchup(found ?? null)
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [config, year, week, teamA, teamB])

  return (
    <div className="page">
      <header className="page-header">
        <h2>Box Score</h2>
        <Link to="/scoreboard" className="back-link">
          ← Back to scoreboard
        </Link>
      </header>

      <p className="subtitle">
        {year}, Week {week}
      </p>

      {error && <p className="error">{error}</p>}
      {loading && <p>Loading…</p>}

      {!loading && !matchup && !error && (
        <p className="subtitle">Couldn't find that matchup.</p>
      )}

      {matchup && (
        <>
          <MatchupHeader matchup={matchup} />
          <div className="box-score-grid">
            {matchup.home && <TeamLineup team={matchup.home} />}
            {matchup.away && <TeamLineup team={matchup.away} />}
          </div>
        </>
      )}
    </div>
  )
}

function MatchupHeader({ matchup }: { matchup: BoxScoreMatchup }) {
  const h = matchup.home
  const a = matchup.away
  if (!h || !a) {
    const t = h ?? a!
    return (
      <section className="box-matchup-header">
        <div className="bs-team">
          <div className="bs-team-name">{t.team_name}</div>
          <div className="bs-team-owner">{t.owner_name}</div>
        </div>
        <div className="bs-score">{t.total_points.toFixed(2)}</div>
        <div className="bs-bye">BYE</div>
      </section>
    )
  }
  const homeWon = h.total_points > a.total_points
  const awayWon = a.total_points > h.total_points
  return (
    <section className="box-matchup-header">
      <div className={`bs-side ${homeWon ? 'winner' : ''}`}>
        <div className="bs-team-name">{h.team_name}</div>
        <div className="bs-team-owner">{h.owner_name}</div>
        <div className="bs-score">{h.total_points.toFixed(2)}</div>
        {h.projected_points > 0 && (
          <div className="bs-projected">Proj: {h.projected_points.toFixed(2)}</div>
        )}
      </div>
      <div className="bs-vs">vs</div>
      <div className={`bs-side ${awayWon ? 'winner' : ''}`}>
        <div className="bs-team-name">{a.team_name}</div>
        <div className="bs-team-owner">{a.owner_name}</div>
        <div className="bs-score">{a.total_points.toFixed(2)}</div>
        {a.projected_points > 0 && (
          <div className="bs-projected">Proj: {a.projected_points.toFixed(2)}</div>
        )}
      </div>
    </section>
  )
}

function TeamLineup({ team }: { team: BoxScoreTeam }) {
  const sorted = sortLineup(team.lineup)
  const firstBenchIdx = sorted.findIndex((p) => !isStarter(p.slot_position))

  return (
    <section className="bs-lineup">
      <h3>{team.team_name}</h3>
      <table className="lineup-table">
        <thead>
          <tr>
            <th>Slot</th>
            <th>Player</th>
            <th>Pos</th>
            <th>NFL</th>
            <th>Pts</th>
            <th>Proj</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => {
            const showDivider = i === firstBenchIdx && firstBenchIdx > 0
            return (
              <Fragment key={p.player_id || i}>
                {showDivider && (
                  <tr className="bench-divider">
                    <td colSpan={6}>Bench</td>
                  </tr>
                )}
                <tr className={isStarter(p.slot_position) ? 'starter' : 'bench'}>
                  <td className="slot">{p.slot_position}</td>
                  <td className="player-name">{p.name || '—'}</td>
                  <td>{p.position}</td>
                  <td>{p.pro_team}</td>
                  <td className="points">{p.points.toFixed(2)}</td>
                  <td className="proj">{p.projected_points.toFixed(2)}</td>
                </tr>
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
