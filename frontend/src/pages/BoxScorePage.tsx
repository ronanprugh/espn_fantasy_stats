/**
 * Box Score: both lineups of one game, slot by slot, at
 * /box_score/:year/:week/:teamA/:teamB (2019 on). The back link returns to the
 * page it was opened from (useFromHere), or that week's Scoreboard.
 */
import { Fragment, useEffect, useState, type MouseEvent } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import {
  fetchBoxScores,
  type BoxPlayer,
  type BoxScoreMatchup,
  type BoxScoreTeam,
} from '../api'
import { useLeague } from '../contexts/LeagueContext'
import { useIsMobile } from '../hooks/useIsMobile'
import { useTeamOwners } from '../hooks/useTeamOwners'
import { TeamLink } from '../components/TeamLink'
import { headToHeadHref } from '../lib/links'
import { readFrom } from '../hooks/useFromHere'
import { TableSkeleton } from '../components/Loading'
import { ErrorMessage } from '../components/ErrorMessage'

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
  const location = useLocation()
  const navigate = useNavigate()
  // Opened from a page in the app: go back to it, selections and all. A pasted
  // link or a new tab has no `from`, so it falls back to that week's Scoreboard.
  const from = readFrom(location.state)
  const scoreboardHref = `/scoreboard?year=${year}&week=${week}`
  const goBack = (e: MouseEvent) => {
    // Plain clicks only: a modified click (new tab, new window) keeps the link.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigate(-1)
  }
  const ownerOf = useTeamOwners(selectedLeague?.espn_league_id, [year])
  const ownerA = ownerOf(year, teamA)
  const ownerB = ownerOf(year, teamB)

  const leagueId = selectedLeague?.espn_league_id
  useEffect(() => {
    if (!leagueId) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchBoxScores(leagueId, year, week)
      .then((data) => {
        if (cancelled) return
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
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    // A quick hop to another game mustn't let this one's answer land late.
    return () => {
      cancelled = true
    }
  }, [leagueId, year, week, teamA, teamB])

  return (
    <div className="page">
      <header className="page-header">
        <h2>Box Score</h2>
        {from ? (
          // A real link to the same place, so it can still open in a new tab,
          // but a plain click is a true Back: no extra history entry.
          <Link to={from.path} className="back-link" onClick={goBack}>
            ← Back to {from.label}
          </Link>
        ) : (
          <Link to={scoreboardHref} className="back-link">
            ← Back to Scoreboard
          </Link>
        )}
      </header>

      <p className="subtitle">
        {year}, Week {week}
        {' · '}
        <Link to={scoreboardHref} className="back-link">
          Week {week} scoreboard
        </Link>
        {ownerA && ownerB && ownerA !== ownerB && (
          <>
            {' · '}
            <Link to={headToHeadHref(ownerA, ownerB)} className="back-link">
              All meetings
            </Link>
          </>
        )}
      </p>

      {error && <ErrorMessage message={error} />}
      {loading && <TableSkeleton rows={10} cols={4} />}

      {!loading && !matchup && !error && (
        <p className="subtitle">Couldn't find that matchup.</p>
      )}

      {matchup && <MatchupBody matchup={matchup} owner={(teamId) => ownerOf(year, teamId)} year={year} />}
    </div>
  )
}

/* Two lineups, two shapes. On a wide screen they sit side by side as full
 * tables. On a phone the side-by-side grid collapsed to one column, which turned
 * a matchup into two lists a reader had to scroll between to compare — the one
 * thing a box score exists to make easy. The mobile shape interleaves them into
 * a single slot-per-row sheet instead, mirrored about the slot column. */
type OwnerOf = (teamId: number) => string | undefined

function MatchupBody({ matchup, owner, year }: { matchup: BoxScoreMatchup; owner: OwnerOf; year: number }) {
  const isMobile = useIsMobile()
  const { home, away } = matchup
  const ahead = slotWinners(home, away)

  return (
    <>
      <MatchupHeader matchup={matchup} owner={owner} year={year} />
      {home && away ? (
        <MirroredLineups home={home} away={away} wide={!isMobile} />
      ) : (
        <div className="box-score-grid">
          {home && <TeamLineup team={home} ahead={ahead} />}
          {away && <TeamLineup team={away} ahead={ahead} />}
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

/** The starter with the higher score in each lineup slot, pairing the two
 * lineups the same way the phone layout does. Bench points don't count, so the
 * bench has no winners (the phone layout mutes them too). A tie, or a slot
 * only one side filled, has no winner. */
function slotWinners(home: BoxScoreTeam | null, away: BoxScoreTeam | null): Set<BoxPlayer> {
  const won = new Set<BoxPlayer>()
  if (!home || !away) return won
  const { starters } = pairLineups(home, away)
  for (const r of starters) {
    if (!r.home || !r.away || r.home.points === r.away.points) continue
    won.add(r.home.points > r.away.points ? r.home : r.away)
  }
  return won
}

/* Both lineups in one sheet, mirrored about the slot column like a
 * scoreboard: each slot's two scores face each other in the middle. `wide`
 * is the desktop size, with full player names and a starters total. */
function MirroredLineups({ home, away, wide }: { home: BoxScoreTeam; away: BoxScoreTeam; wide: boolean }) {
  const { starters, bench } = pairLineups(home, away)
  const homeWon = home.total_points > away.total_points
  const awayWon = away.total_points > home.total_points

  return (
    <section className={`bs-mobile${wide ? ' wide' : ''}`}>
      <div className="bs-m-legend">
        {wide && <span className="bs-m-legend-team">{home.team_name}</span>}
        <span className="bs-m-legend-side">Proj · Pts</span>
        <span className="bs-m-legend-slot">Slot</span>
        <span className="bs-m-legend-side right">Pts · Proj</span>
        {wide && <span className="bs-m-legend-team right">{away.team_name}</span>}
      </div>
      {starters.map((r, i) => (
        <MobileLineupRow key={`s${i}`} row={r} wide={wide} />
      ))}
      <div className="bs-m-row bs-m-total">
        <div className="bs-m-player">Total</div>
        <div className="bs-m-proj">{home.projected_points > 0 ? home.projected_points.toFixed(1) : ''}</div>
        <div className={`bs-m-pts${homeWon ? ' ahead' : ''}`}>{home.total_points.toFixed(1)}</div>
        <div className="bs-m-slot" />
        <div className={`bs-m-pts${awayWon ? ' ahead' : ''}`}>{away.total_points.toFixed(1)}</div>
        <div className="bs-m-proj">{away.projected_points > 0 ? away.projected_points.toFixed(1) : ''}</div>
        <div className="bs-m-player right">Total</div>
      </div>
      {bench.length > 0 && <div className="bs-m-divider">Bench</div>}
      {bench.map((r, i) => (
        <MobileLineupRow key={`b${i}`} row={r} bench wide={wide} />
      ))}
    </section>
  )
}

function MobileLineupRow({ row, bench = false, wide = false }: { row: PairedRow; bench?: boolean; wide?: boolean }) {
  const { home, away } = row
  // The higher score is the only thing worth colouring here; the reader is
  // scanning for who won each slot.
  const homeAhead = home && away ? home.points > away.points : false
  const awayAhead = home && away ? away.points > home.points : false

  return (
    <div className={`bs-m-row${bench ? ' bench' : ''}`}>
      <PlayerCell player={home} side="left" full={wide} />
      <div className="bs-m-proj">{home ? home.projected_points.toFixed(1) : ''}</div>
      <div className={`bs-m-pts${homeAhead ? ' ahead' : ''}`}>
        {home ? home.points.toFixed(1) : ''}
      </div>
      <div className="bs-m-slot">{shortSlot(row.slot)}</div>
      <div className={`bs-m-pts${awayAhead ? ' ahead' : ''}`}>
        {away ? away.points.toFixed(1) : ''}
      </div>
      <div className="bs-m-proj">{away ? away.projected_points.toFixed(1) : ''}</div>
      <PlayerCell player={away} side="right" full={wide} />
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

function PlayerCell({ player, side, full = false }: { player: BoxPlayer | null; side: 'left' | 'right'; full?: boolean }) {
  if (!player) return <div className={`bs-m-player ${side} empty`}>—</div>
  const meta = [player.position, player.pro_team].filter(Boolean).join(' · ')
  return (
    <div className={`bs-m-player ${side}`}>
      <div className="bs-m-name">{player.name ? (full ? player.name : shortName(player.name)) : '—'}</div>
      {meta && <div className="bs-m-meta">{meta}</div>}
    </div>
  )
}

function MatchupHeader({ matchup, owner, year }: { matchup: BoxScoreMatchup; owner: OwnerOf; year: number }) {
  const h = matchup.home
  const a = matchup.away
  const name = (t: BoxScoreTeam) => (
    <TeamLink ownerId={owner(t.team_id)} year={year}>
      {t.team_name}
    </TeamLink>
  )
  if (!h || !a) {
    const t = h ?? a!
    return (
      <section className="box-matchup-header">
        <div className="bs-team">
          <div className="bs-team-name">{name(t)}</div>
          <div className="bs-team-owner">{t.owner_name}</div>
        </div>
        <div className="bs-score">{t.total_points.toFixed(2)}</div>
        <div className="bs-bye">BYE</div>
      </section>
    )
  }
  const homeWon = h.total_points > a.total_points
  const awayWon = a.total_points > h.total_points
  const proj = (t: BoxScoreTeam) =>
    t.projected_points > 0 ? <div className="bs-projected">Proj {t.projected_points.toFixed(2)}</div> : null
  // Scoreboard-style: the two totals face each other in the middle, each
  // team's name on its own side.
  return (
    <section className="box-matchup-header bs-board">
      <div className="bs-board-team">
        <div className="bs-team-name">{name(h)}</div>
        <div className="bs-team-owner">{h.owner_name}</div>
      </div>
      <div className="bs-board-scores">
        <div className={`bs-board-score${homeWon ? ' winner' : awayWon ? ' loser' : ''}`}>
          <div className="bs-score">{h.total_points.toFixed(2)}</div>
          {proj(h)}
        </div>
        <div className="bs-vs" aria-hidden="true">–</div>
        <div className={`bs-board-score${awayWon ? ' winner' : homeWon ? ' loser' : ''}`}>
          <div className="bs-score">{a.total_points.toFixed(2)}</div>
          {proj(a)}
        </div>
      </div>
      <div className="bs-board-team right">
        <div className="bs-team-name">{name(a)}</div>
        <div className="bs-team-owner">{a.owner_name}</div>
      </div>
    </section>
  )
}

function TeamLineup({ team, ahead }: { team: BoxScoreTeam; ahead: Set<BoxPlayer> }) {
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
                  <td className={`points num${ahead.has(p) ? ' ahead' : ''}`}>{p.points.toFixed(2)}</td>
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
