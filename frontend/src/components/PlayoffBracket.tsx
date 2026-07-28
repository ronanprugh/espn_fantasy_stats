import { createContext, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import type { PlayoffMatchup, PlayoffTeam, SeasonPlayoffs } from '../api'
import { useIsMobile } from '../hooks/useIsMobile'

/* Bracket geometry.
 *
 * The SVG is laid out in absolute user units, so "make it fit a phone" is not a
 * CSS question — every coordinate below feeds the width the browser is asked to
 * paint. Two metric sets rather than one scale factor: shrinking the desktop
 * bracket uniformly would take the 13px labels down to ~9px, and a bracket you
 * cannot read is no better than one you cannot reach. Compact keeps type at a
 * legible size and takes the space out of the padding and the gutters instead.
 *
 * A three-round bracket is still wider than a phone at compact metrics. That is
 * expected: it scrolls inside .bracket-section, which is the fix for the clipped
 * SVG (the old `max-width: 100%` shrank the element without a viewBox, cropping
 * the right-hand rounds with no way to scroll to them). */
type BracketMetrics = {
  BOX_W: number
  BOX_H: number
  ROW_H: number
  COL_GAP: number
  Y_GAP: number
  TEXT_PAD_X: number
  FONT: number
}

const DESKTOP_METRICS: BracketMetrics = {
  BOX_W: 320,
  BOX_H: 88,
  ROW_H: 44,
  COL_GAP: 48,
  Y_GAP: 28,
  TEXT_PAD_X: 18,
  FONT: 13,
}

const COMPACT_METRICS: BracketMetrics = {
  BOX_W: 208,
  BOX_H: 72,
  ROW_H: 36,
  COL_GAP: 24,
  Y_GAP: 18,
  TEXT_PAD_X: 10,
  FONT: 12,
}

const MetricsContext = createContext<BracketMetrics>(DESKTOP_METRICS)
const useMetrics = () => useContext(MetricsContext)

type BracketNode = {
  match: PlayoffMatchup
  teamTop: PlayoffTeam
  teamBottom: PlayoffTeam
  scoreTop: number
  scoreBottom: number
  winnerId: number | null
  feederTop: BracketNode | null
  feederBottom: BracketNode | null
  isByeMatchup: boolean
  y: number
  week: number
}

const BYE_PLACEHOLDER: PlayoffTeam = {
  team_id: -1,
  team_name: 'BYE',
  owner_name: '',
  seed: 0,
  final_standing: 0,
}

function makeByeNode(team: PlayoffTeam, byeMatch: PlayoffMatchup): BracketNode {
  return {
    match: byeMatch,
    teamTop: team,
    teamBottom: BYE_PLACEHOLDER,
    scoreTop: byeMatch.team_a_score,
    scoreBottom: 0,
    winnerId: team.team_id,
    feederTop: null,
    feederBottom: null,
    isByeMatchup: true,
    y: 0,
    week: byeMatch.week,
  }
}

const findMatch = (
  matchups: PlayoffMatchup[],
  week: number,
  teamId: number,
): PlayoffMatchup | undefined =>
  matchups.find((m) => m.week === week && (m.team_a_id === teamId || m.team_b_id === teamId))

const findMatchBetween = (
  matchups: PlayoffMatchup[],
  week: number,
  aId: number,
  bId: number,
): PlayoffMatchup | undefined =>
  matchups.find(
    (m) =>
      m.week === week &&
      !m.is_bye &&
      ((m.team_a_id === aId && m.team_b_id === bId) ||
        (m.team_a_id === bId && m.team_b_id === aId)),
  )

const findMatchByStandings = (
  data: SeasonPlayoffs,
  week: number,
  standings: number[],
): PlayoffMatchup | undefined => {
  const ids = data.teams
    .filter((t) => standings.includes(t.final_standing))
    .map((t) => t.team_id)
  if (ids.length < 2) return undefined
  return findMatchBetween(data.matchups, week, ids[0], ids[1])
}

function buildNode(
  match: PlayoffMatchup,
  data: SeasonPlayoffs,
  teamsById: Map<number, PlayoffTeam>,
  maxDepth = Infinity,
): BracketNode {
  const teamA = teamsById.get(match.team_a_id)!
  const teamB = teamsById.get(match.team_b_id)!
  const [teamTop, teamBottom, scoreTop, scoreBottom] =
    teamA.seed <= teamB.seed
      ? [teamA, teamB, match.team_a_score, match.team_b_score]
      : [teamB, teamA, match.team_b_score, match.team_a_score]

  const idx = data.playoff_weeks.indexOf(match.week)
  const prevWeek = idx > 0 ? data.playoff_weeks[idx - 1] : null

  let feederTop: BracketNode | null = null
  let feederBottom: BracketNode | null = null
  if (prevWeek != null && maxDepth > 0) {
    const topPrev = findMatch(data.matchups, prevWeek, teamTop.team_id)
    const botPrev = findMatch(data.matchups, prevWeek, teamBottom.team_id)
    if (topPrev?.is_bye) feederTop = makeByeNode(teamTop, topPrev)
    else if (topPrev) feederTop = buildNode(topPrev, data, teamsById, maxDepth - 1)
    if (botPrev?.is_bye) feederBottom = makeByeNode(teamBottom, botPrev)
    else if (botPrev) feederBottom = buildNode(botPrev, data, teamsById, maxDepth - 1)
  }

  return {
    match,
    teamTop,
    teamBottom,
    scoreTop,
    scoreBottom,
    winnerId: match.winner_id,
    feederTop,
    feederBottom,
    isByeMatchup: false,
    y: 0,
    week: match.week,
  }
}

function assignY(node: BracketNode, counter: { v: number }): void {
  if (!node.feederTop && !node.feederBottom) {
    node.y = counter.v
    counter.v += 1
    return
  }
  let topY: number | null = null
  let botY: number | null = null
  if (node.feederTop) {
    assignY(node.feederTop, counter)
    topY = node.feederTop.y
  }
  if (node.feederBottom) {
    assignY(node.feederBottom, counter)
    botY = node.feederBottom.y
  }
  if (topY != null && botY != null) node.y = (topY + botY) / 2
  else node.y = (topY ?? botY)!
}

function collectNodes(node: BracketNode | null, acc: BracketNode[] = []): BracketNode[] {
  if (!node) return acc
  acc.push(node)
  collectNodes(node.feederTop, acc)
  collectNodes(node.feederBottom, acc)
  return acc
}

const xOf = (week: number, earliestWeek: number, m: BracketMetrics) =>
  (week - earliestWeek) * (m.BOX_W + m.COL_GAP)
const pixelY = (yUnit: number, m: BracketMetrics) => yUnit * (m.BOX_H + m.Y_GAP)

/* SVG text neither wraps nor clips, so a long team name would paint straight
 * through the score and out of the box. Truncation is by character count, which
 * is approximate for a proportional face but errs on the safe side at the width
 * budget each metric set allows. */
const nameLimit = (m: BracketMetrics) => (m === COMPACT_METRICS ? 18 : 30)
const truncate = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s)

function Connector({
  from,
  to,
  earliestWeek,
}: {
  from: BracketNode
  to: BracketNode
  earliestWeek: number
}) {
  const m = useMetrics()
  const fromX = xOf(from.week, earliestWeek, m) + m.BOX_W
  const fromYBox = pixelY(from.y, m)
  const toX = xOf(to.week, earliestWeek, m)
  const toYBox = pixelY(to.y, m)

  // Both ends attach at the vertical midpoint of their boxes.
  const fromYMid = fromYBox + m.BOX_H / 2
  const toYMid = toYBox + m.BOX_H / 2

  const midX = fromX + m.COL_GAP / 2
  return (
    <path
      className="bracket-connector"
      d={`M ${fromX} ${fromYMid} H ${midX} V ${toYMid} H ${toX}`}
      strokeWidth={1.5}
      fill="none"
    />
  )
}

function MatchBox({
  node,
  earliestWeek,
  onClick,
}: {
  node: BracketNode
  earliestWeek: number
  onClick?: (n: BracketNode) => void
}) {
  const m = useMetrics()
  const x = xOf(node.week, earliestWeek, m)
  const y = pixelY(node.y, m)
  const winnerIsTop = node.winnerId === node.teamTop.team_id
  const winnerIsBot = node.winnerId === node.teamBottom.team_id
  // Bye boxes aren't clickable — there's no box score for a bye.
  const clickable = !!onClick && !node.isByeMatchup
  return (
    <g
      transform={`translate(${x},${y})`}
      onClick={clickable ? () => onClick!(node) : undefined}
      style={clickable ? { cursor: 'pointer' } : undefined}
      className={`bracket-match${clickable ? ' clickable' : ''}${node.isByeMatchup ? ' bye' : ''}`}
    >
      <rect
        width={m.BOX_W}
        height={m.BOX_H}
        rx={8}
        className="bracket-match-rect"
      />
      <line
        className="bracket-row-divider"
        x1={0}
        y1={m.ROW_H}
        x2={m.BOX_W}
        y2={m.ROW_H}
      />
      <TeamRow
        team={node.teamTop}
        score={node.scoreTop}
        isWinner={winnerIsTop}
        isPlaceholder={false}
        yOffset={0}
      />
      <TeamRow
        team={node.teamBottom}
        score={node.scoreBottom}
        isWinner={winnerIsBot}
        isPlaceholder={node.isByeMatchup}
        yOffset={m.ROW_H}
      />
      {clickable && <title>View box score</title>}
    </g>
  )
}

function TeamRow({
  team,
  score,
  isWinner,
  isPlaceholder,
  yOffset,
}: {
  team: PlayoffTeam
  score: number
  isWinner: boolean
  isPlaceholder: boolean
  yOffset: number
}) {
  const m = useMetrics()
  const textY = m.ROW_H / 2 + m.FONT * 0.38 // visual vertical center
  if (isPlaceholder) {
    return (
      <g transform={`translate(0,${yOffset})`}>
        <text
          className="bracket-text-muted"
          x={m.TEXT_PAD_X}
          y={textY}
          fontSize={m.FONT}
          fontStyle="italic"
        >
          BYE
        </text>
      </g>
    )
  }
  return (
    <g transform={`translate(0,${yOffset})`}>
      <text
        className="bracket-text"
        x={m.TEXT_PAD_X}
        y={textY}
        fontSize={m.FONT}
        fontWeight={isWinner ? 600 : 400}
      >
        <tspan className="bracket-text-muted">{team.seed}.</tspan>
        <tspan dx={6}>{truncate(team.team_name, nameLimit(m))}</tspan>
      </text>
      <text
        className="bracket-text"
        x={m.BOX_W - m.TEXT_PAD_X}
        y={textY}
        fontSize={m.FONT}
        fontWeight={isWinner ? 600 : 400}
        textAnchor="end"
      >
        {score.toFixed(1)}
      </text>
    </g>
  )
}

function BracketSection({
  title,
  root,
  weekLabels,
  onMatchClick,
}: {
  title: string
  root: BracketNode | null
  weekLabels?: Record<number, string>
  onMatchClick?: (n: BracketNode) => void
}) {
  const m = useMetrics()
  if (!root) return null
  assignY(root, { v: 0 })
  const nodes = collectNodes(root)
  const weeks = Array.from(new Set(nodes.map((n) => n.week))).sort((a, b) => a - b)
  const earliestWeek = weeks[0]
  const maxY = Math.max(...nodes.map((n) => n.y))
  const width = xOf(weeks[weeks.length - 1], earliestWeek, m) + m.BOX_W + 4
  const height = pixelY(maxY, m) + m.BOX_H + 28

  // Pair up feeder→parent for connectors
  const pairs: Array<[BracketNode, BracketNode]> = []
  for (const n of nodes) {
    if (n.feederTop) pairs.push([n.feederTop, n])
    if (n.feederBottom) pairs.push([n.feederBottom, n])
  }

  return (
    <section className="bracket-section">
      <h3>{title}</h3>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="bracket-svg"
      >
        {/* Week column labels */}
        <g>
          {weeks.map((w) => (
            <text
              className="bracket-text-muted"
              key={w}
              x={xOf(w, earliestWeek, m) + m.BOX_W / 2}
              y={14}
              fontSize={11}
              textAnchor="middle"
            >
              {weekLabels?.[w] ?? `Wk ${w}`}
            </text>
          ))}
        </g>
        <g transform="translate(0,24)">
          {pairs.map(([from, to], i) => (
            <Connector key={i} from={from} to={to} earliestWeek={earliestWeek} />
          ))}
          {nodes.map((n) => (
            <MatchBox
              key={`${n.week}-${n.teamTop.team_id}`}
              node={n}
              earliestWeek={earliestWeek}
              onClick={onMatchClick}
            />
          ))}
        </g>
      </svg>
    </section>
  )
}

function StandalonePlacementGame({
  title,
  match,
  teamsById,
  onMatchClick,
}: {
  title: string
  match: PlayoffMatchup | undefined
  teamsById: Map<number, PlayoffTeam>
  onMatchClick?: (n: BracketNode) => void
}) {
  const m = useMetrics()
  if (!match) return null
  const teamA = teamsById.get(match.team_a_id)!
  const teamB = teamsById.get(match.team_b_id)!
  const [top, bot, st, sb] =
    teamA.seed <= teamB.seed
      ? [teamA, teamB, match.team_a_score, match.team_b_score]
      : [teamB, teamA, match.team_b_score, match.team_a_score]
  const node: BracketNode = {
    match,
    teamTop: top,
    teamBottom: bot,
    scoreTop: st,
    scoreBottom: sb,
    winnerId: match.winner_id,
    feederTop: null,
    feederBottom: null,
    isByeMatchup: false,
    y: 0,
    week: match.week,
  }
  return (
    <section className="bracket-section">
      <h3>{title}</h3>
      <svg
        width={m.BOX_W + 4}
        height={m.BOX_H + 28}
        viewBox={`0 0 ${m.BOX_W + 4} ${m.BOX_H + 28}`}
        className="bracket-svg"
      >
        <g>
          <text
            className="bracket-text-muted"
            x={m.BOX_W / 2}
            y={14}
            fontSize={11}
            textAnchor="middle"
          >
            Wk {match.week}
          </text>
        </g>
        <g transform="translate(0,24)">
          <MatchBox node={node} earliestWeek={match.week} onClick={onMatchClick} />
        </g>
      </svg>
    </section>
  )
}

export function PlayoffBracket({ data }: { data: SeasonPlayoffs }) {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  const metrics = isMobile ? COMPACT_METRICS : DESKTOP_METRICS
  const teamsById = new Map(data.teams.map((t) => [t.team_id, t]))
  const weeks = data.playoff_weeks
  if (weeks.length === 0) {
    return <p className="subtitle">No playoff data for this season.</p>
  }
  const lastWeek = weeks[weeks.length - 1]

  const onMatchClick =
    data.year >= 2019
      ? (n: BracketNode) =>
          navigate(
            `/box_score/${data.year}/${n.week}/${n.match.team_a_id}/${n.match.team_b_id}`,
          )
      : undefined

  // Championship: final + recurse all the way back
  const championship = (() => {
    const final = findMatchByStandings(data, lastWeek, [1, 2])
    if (!final) return null
    const root = buildNode(final, data, teamsById, Infinity)
    return root
  })()

  // 3rd-place: standalone (would be redundant to retrace through semis)
  const thirdPlace = findMatchByStandings(data, lastWeek, [3, 4])

  // 5th-place: trace back one level (consolation R1 in the prior playoff week)
  const fifthBracket = (() => {
    const m = findMatchByStandings(data, lastWeek, [5, 6])
    if (!m) return null
    return buildNode(m, data, teamsById, 1)
  })()

  // 7th-place (rare; e.g. 2024 had a bye, so no actual game)
  const seventhPlace = findMatchByStandings(data, lastWeek, [7, 8])

  // Final standings summary
  const standings = [...data.teams].sort((a, b) => a.final_standing - b.final_standing)

  return (
    <MetricsContext.Provider value={metrics}>
      <div className="playoffs">
        <BracketSection title="Championship" root={championship} onMatchClick={onMatchClick} />
        <StandalonePlacementGame
          title="3rd-place game"
          match={thirdPlace}
          teamsById={teamsById}
          onMatchClick={onMatchClick}
        />
        <BracketSection
          title="Consolation (5th place)"
          root={fifthBracket}
          onMatchClick={onMatchClick}
        />
        <StandalonePlacementGame
          title="7th-place game"
          match={seventhPlace}
          teamsById={teamsById}
          onMatchClick={onMatchClick}
        />

        <section className="standings-section">
          <h3>Final Standings</h3>
          <ol className="standings-list">
            {standings.map((t) => (
              <li key={t.team_id}>
                <span className="rank">{t.final_standing}.</span>
                <span className="team">{t.team_name}</span>
                <span className="owner">— {t.owner_name}</span>
                <span className="seed-tag">seed {t.seed}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </MetricsContext.Provider>
  )
}
