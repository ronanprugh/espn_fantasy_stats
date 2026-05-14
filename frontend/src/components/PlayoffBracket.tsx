import { useNavigate } from 'react-router-dom'
import type { PlayoffMatchup, PlayoffTeam, SeasonPlayoffs } from '../api'

const BOX_W = 320
const BOX_H = 88
const ROW_H = 44
const COL_GAP = 48
const Y_GAP = 28
const TEXT_PAD_X = 18

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

const xOf = (week: number, earliestWeek: number) => (week - earliestWeek) * (BOX_W + COL_GAP)
const pixelY = (yUnit: number) => yUnit * (BOX_H + Y_GAP)

function Connector({
  from,
  to,
  earliestWeek,
}: {
  from: BracketNode
  to: BracketNode
  earliestWeek: number
}) {
  const fromX = xOf(from.week, earliestWeek) + BOX_W
  const fromYBox = pixelY(from.y)
  const toX = xOf(to.week, earliestWeek)
  const toYBox = pixelY(to.y)

  // Both ends attach at the vertical midpoint of their boxes.
  const fromYMid = fromYBox + BOX_H / 2
  const toYMid = toYBox + BOX_H / 2

  const midX = fromX + COL_GAP / 2
  return (
    <path
      d={`M ${fromX} ${fromYMid} H ${midX} V ${toYMid} H ${toX}`}
      stroke="#999"
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
  const x = xOf(node.week, earliestWeek)
  const y = pixelY(node.y)
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
        width={BOX_W}
        height={BOX_H}
        fill="white"
        stroke="#d0d0d0"
        rx={8}
        className="bracket-match-rect"
      />
      <line x1={0} y1={ROW_H} x2={BOX_W} y2={ROW_H} stroke="#eee" />
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
        yOffset={ROW_H}
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
  const textY = ROW_H / 2 + 5 // visual vertical center for 13px text
  if (isPlaceholder) {
    return (
      <g transform={`translate(0,${yOffset})`}>
        <text
          x={TEXT_PAD_X}
          y={textY}
          fontSize={13}
          fontStyle="italic"
          fill="#999"
        >
          BYE
        </text>
      </g>
    )
  }
  return (
    <g transform={`translate(0,${yOffset})`}>
      <text x={TEXT_PAD_X} y={textY} fontSize={13} fontWeight={isWinner ? 600 : 400}>
        <tspan fill="#999">{team.seed}.</tspan>
        <tspan dx={6}>{team.team_name}</tspan>
      </text>
      <text
        x={BOX_W - TEXT_PAD_X}
        y={textY}
        fontSize={13}
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
  if (!root) return null
  assignY(root, { v: 0 })
  const nodes = collectNodes(root)
  const weeks = Array.from(new Set(nodes.map((n) => n.week))).sort((a, b) => a - b)
  const earliestWeek = weeks[0]
  const maxY = Math.max(...nodes.map((n) => n.y))
  const width = xOf(weeks[weeks.length - 1], earliestWeek) + BOX_W + 4
  const height = pixelY(maxY) + BOX_H + 28

  // Pair up feeder→parent for connectors
  const pairs: Array<[BracketNode, BracketNode]> = []
  for (const n of nodes) {
    if (n.feederTop) pairs.push([n.feederTop, n])
    if (n.feederBottom) pairs.push([n.feederBottom, n])
  }

  return (
    <section className="bracket-section">
      <h3>{title}</h3>
      <svg width={width} height={height} className="bracket-svg">
        {/* Week column labels */}
        <g>
          {weeks.map((w) => (
            <text
              key={w}
              x={xOf(w, earliestWeek) + BOX_W / 2}
              y={14}
              fontSize={11}
              fill="#888"
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
      <svg width={BOX_W + 4} height={BOX_H + 28} className="bracket-svg">
        <g>
          <text
            x={BOX_W / 2}
            y={14}
            fontSize={11}
            fill="#888"
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
  )
}
