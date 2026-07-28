import { Fragment, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  fetchBoxScores,
  type BoxPlayer,
  type BoxScoreMatchup,
  type BoxScoreTeam,
} from '../api'
import { useLeague } from '../contexts/LeagueContext'
import { useIsMobile } from '../hooks/useIsMobile'

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

  const { selectedLeague } = useLeague()
  const [matchup, setMatchup] = useState<BoxScoreMatchup | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedLeague) return
    setLoading(true)
    setError(null)
    fetchBoxScores(selectedLeague.espn_league_id, year, week)
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
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [selectedLeague?.espn_league_id, year, week, teamA, teamB])

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

      {matchup && <MatchupBody matchup={matchup} />}
    </div>
  )
}

/* Two lineups, two shapes. On a wide screen they sit side by side as full
 * tables. On a phone the side-by-side grid collapsed to one column, which turned
 * a matchup into two lists a reader had to scroll between to compare — the one
 * thing a box score exists to make easy. The mobile shape interleaves them into
 * a single slot-per-row sheet instead, mirrored about the slot column. */
function MatchupBody({ matchup }: { matchup: BoxScoreMatchup }) {
  const isMobile = useIsMobile()
  const { home, away } = matchup

  return (
    <>
      <MatchupHeader matchup={matchup} />
      {isMobile && home && away ? (
        <MobileLineups home={home} away={away} />
      ) : (
        <div className="box-score-grid">
          {home && <TeamLineup team={home} />}
          {away && <TeamLineup team={away} />}
        </div>
      )}
    </>
  )
}

type PairedRow = { slot: string; home: BoxPlayer | null; away: BoxPlayer | null }

/* The slot column is the narrowest in the mirrored layout, and ESPN's own
 * multi-position slot names are its longest labels — "RB/WR/TE" ran straight
 * through the points column beside it. These are the conventional short forms. */
const SLOT_ABBREV: Record<string, string> = {
  'RB/WR/TE': 'FLEX',
  'WR/TE': 'W/T',
  'RB/WR': 'R/W',
  'D/ST': 'DST',
}

const shortSlot = (slot: string) => SLOT_ABBREV[slot] ?? slot

/* Rows are paired positionally within each group after sorting, which is what
 * makes the mirrored layout line up: both lineups come out of sortLineup in the
 * same slot order, so index i is the same slot on both sides. Where the two
 * differ in length (a short bench, an IR spot on one side only) the shorter side
 * contributes an empty cell rather than shifting every row below it. */
function pairLineups(home: BoxScoreTeam, away: BoxScoreTeam): {
  starters: PairedRow[]
  bench: PairedRow[]
} {
  const group = (team: BoxScoreTeam, starters: boolean) =>
    sortLineup(team.lineup).filter((p) => isStarter(p.slot_position) === starters)

  const zip = (h: BoxPlayer[], a: BoxPlayer[]): PairedRow[] =>
    Array.from({ length: Math.max(h.length, a.length) }, (_, i) => ({
      slot: h[i]?.slot_position ?? a[i]?.slot_position ?? '',
      home: h[i] ?? null,
      away: a[i] ?? null,
    }))

  return {
    starters: zip(group(home, true), group(away, true)),
    bench: zip(group(home, false), group(away, false)),
  }
}

function MobileLineups({ home, away }: { home: BoxScoreTeam; away: BoxScoreTeam }) {
  const { starters, bench } = pairLineups(home, away)

  return (
    <section className="bs-mobile">
      <div className="bs-m-legend">
        <span className="bs-m-legend-side">Proj · Pts</span>
        <span className="bs-m-legend-slot">Slot</span>
        <span className="bs-m-legend-side right">Pts · Proj</span>
      </div>
      {starters.map((r, i) => (
        <MobileLineupRow key={`s${i}`} row={r} />
      ))}
      {bench.length > 0 && <div className="bs-m-divider">Bench</div>}
      {bench.map((r, i) => (
        <MobileLineupRow key={`b${i}`} row={r} bench />
      ))}
    </section>
  )
}

function MobileLineupRow({ row, bench = false }: { row: PairedRow; bench?: boolean }) {
  const { home, away } = row
  // The higher score is the only thing worth colouring here; the reader is
  // scanning for who won each slot.
  const homeAhead = home && away ? home.points > away.points : false
  const awayAhead = home && away ? away.points > home.points : false

  return (
    <div className={`bs-m-row${bench ? ' bench' : ''}`}>
      <PlayerCell player={home} side="left" />
      <div className="bs-m-proj">{home ? home.projected_points.toFixed(1) : ''}</div>
      <div className={`bs-m-pts${homeAhead ? ' ahead' : ''}`}>
        {home ? home.points.toFixed(1) : ''}
      </div>
      <div className="bs-m-slot">{shortSlot(row.slot)}</div>
      <div className={`bs-m-pts${awayAhead ? ' ahead' : ''}`}>
        {away ? away.points.toFixed(1) : ''}
      </div>
      <div className="bs-m-proj">{away ? away.projected_points.toFixed(1) : ''}</div>
      <PlayerCell player={away} side="right" />
    </div>
  )
}

/* Two name columns and five numeric ones do not fit a 320px phone at full first
 * names, and truncating "Christian McCaffrey" to "Christian…" hides the half of
 * the name that identifies the player. Initialising the first name is what the
 * scoring apps do, and it keeps the surname whole. Team defenses ("49ers D/ST")
 * are left alone — there is no first name to shorten. */
function shortName(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length < 2 || parts[parts.length - 1] === 'D/ST') return name
  return `${parts[0][0]}. ${parts.slice(1).join(' ')}`
}

function PlayerCell({ player, side }: { player: BoxPlayer | null; side: 'left' | 'right' }) {
  if (!player) return <div className={`bs-m-player ${side} empty`}>—</div>
  const meta = [player.position, player.pro_team].filter(Boolean).join(' · ')
  return (
    <div className={`bs-m-player ${side}`}>
      <div className="bs-m-name">{player.name ? shortName(player.name) : '—'}</div>
      {meta && <div className="bs-m-meta">{meta}</div>}
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
            <th className="right num">Pts</th>
            <th className="right num">Proj</th>
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
                  <td className="points num">{p.points.toFixed(2)}</td>
                  <td className="proj num">{p.projected_points.toFixed(2)}</td>
                </tr>
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </section>
  )
}
