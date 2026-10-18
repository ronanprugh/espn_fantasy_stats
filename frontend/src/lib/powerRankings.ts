import type {
  PowerRankingEntry,
  PowerRankingPostSummary,
  PowerRankings,
  PowerRankingSeason,
  PowerRankingWeek,
} from '../api'

/**
 * Stats derived from a league's power rankings history.
 *
 * Every week of every ranked season has ranks, but not every week's ranks were
 * posted: gaps are filled from the nearest week (see backend power_rankings.py).
 * Stats count posted weeks only unless `includeAssumed` is on, so a team isn't
 * credited with "weeks at #1" for weeks nobody ranked it #1. Guest editions
 * count by default and can be left out.
 */
export type PrOptions = {
  /** Count weeks whose ranks were carried over from another week. */
  includeAssumed: boolean
  /** Count rankings written by someone other than the regular writer. */
  includeGuest: boolean
}

export const DEFAULT_PR_OPTIONS: PrOptions = { includeAssumed: false, includeGuest: true }

export const isAssumed = (w: PowerRankingWeek) => w.source !== 'posted'

/** One team's rank in one week, with everything needed to show where it came from. */
export type RankedWeek = {
  season: number
  week: number
  ownerId: string
  teamId: number
  entry: PowerRankingEntry
  assumed: boolean
  guest: boolean
  counted: boolean
}

export function postIndex(data: PowerRankings): Map<number, PowerRankingPostSummary> {
  return new Map(data.posts.map((p) => [p.id, p]))
}

/** Every team-week, chronologically, flagged with whether it counts under `opts`. */
export function rankedWeeks(data: PowerRankings, opts: PrOptions = DEFAULT_PR_OPTIONS): RankedWeek[] {
  const posts = postIndex(data)
  const out: RankedWeek[] = []
  for (const s of data.seasons) {
    const ownerOf = new Map(s.teams.map((t) => [t.team_id, t.owner_id]))
    for (const w of s.weeks) {
      const assumed = isAssumed(w)
      const guest = w.post_id != null && !!posts.get(w.post_id)?.is_guest
      const counted = (opts.includeAssumed || !assumed) && (opts.includeGuest || !guest)
      for (const e of w.entries) {
        const ownerId = ownerOf.get(e.team_id)
        if (!ownerId) continue
        out.push({ season: s.season, week: w.week, ownerId, teamId: e.team_id, entry: e, assumed, guest, counted })
      }
    }
  }
  return out
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)

export type Moment = { value: number; season: number; week: number }

export type OwnerPrStats = {
  ownerId: string
  ownerName: string
  /** Most recent team name. */
  teamName: string
  seasons: number
  weeks: number
  avgRank: number | null
  bestRank: number | null
  worstRank: number | null
  weeksAt1: number
  top3Weeks: number
  /** Weeks ranked last in the league. */
  lastWeeks: number
  /** Longest run of consecutive counted weeks at #1 within a season. */
  longestAt1: number
  /** Seasons that opened (week 1) at #1. */
  preseasonAt1: number
  avgPreseasonRank: number | null
  /** Average rank in each season's last ranked week. */
  avgFinalRank: number | null
  biggestClimb: Moment | null
  biggestDrop: Moment | null
  /** Average places moved per week, either direction. */
  volatility: number | null
  /** Average of (standing − rank): positive means ranked above the record. */
  respect: number | null
}

type Acc = {
  ranks: number[]
  seasons: Set<number>
  weeksAt1: number
  top3: number
  last: number
  streak: number
  longest: number
  streakSeason: number | null
  pre: number[]
  preAt1: number
  final: Map<number, number>
  climb: Moment | null
  drop: Moment | null
  moves: number[]
  respect: number[]
}

export function ownerStats(data: PowerRankings, opts: PrOptions = DEFAULT_PR_OPTIONS): OwnerPrStats[] {
  const names = latestNames(data)
  const leagueSize = new Map(data.seasons.map((s) => [s.season, s.teams.length]))
  const acc = new Map<string, Acc>()
  for (const r of rankedWeeks(data, opts)) {
    let a = acc.get(r.ownerId)
    if (!a) {
      a = {
        ranks: [], seasons: new Set(), weeksAt1: 0, top3: 0, last: 0, streak: 0, longest: 0,
        streakSeason: null, pre: [], preAt1: 0, final: new Map(), climb: null, drop: null, moves: [], respect: [],
      }
      acc.set(r.ownerId, a)
    }
    if (a.streakSeason !== r.season) {
      a.streak = 0
      a.streakSeason = r.season
    }
    if (!r.counted) continue
    const { rank, change, standing } = r.entry
    a.ranks.push(rank)
    a.seasons.add(r.season)
    if (rank === 1) {
      a.weeksAt1 += 1
      a.streak += 1
      a.longest = Math.max(a.longest, a.streak)
    } else {
      a.streak = 0
    }
    if (rank <= 3) a.top3 += 1
    if (rank === leagueSize.get(r.season)) a.last += 1
    if (r.week === 1) {
      a.pre.push(rank)
      if (rank === 1) a.preAt1 += 1
    }
    a.final.set(r.season, rank)
    if (change != null) {
      a.moves.push(Math.abs(change))
      if (change > 0 && (!a.climb || change > a.climb.value)) a.climb = { value: change, season: r.season, week: r.week }
      if (change < 0 && (!a.drop || -change > a.drop.value)) a.drop = { value: -change, season: r.season, week: r.week }
    }
    if (standing != null) a.respect.push(standing - rank)
  }
  return [...acc.entries()].map(([ownerId, a]) => ({
    ownerId,
    ownerName: names.get(ownerId)?.ownerName ?? '—',
    teamName: names.get(ownerId)?.teamName ?? '—',
    seasons: a.seasons.size,
    weeks: a.ranks.length,
    avgRank: mean(a.ranks),
    bestRank: a.ranks.length ? Math.min(...a.ranks) : null,
    worstRank: a.ranks.length ? Math.max(...a.ranks) : null,
    weeksAt1: a.weeksAt1,
    top3Weeks: a.top3,
    lastWeeks: a.last,
    longestAt1: a.longest,
    preseasonAt1: a.preAt1,
    avgPreseasonRank: mean(a.pre),
    avgFinalRank: mean([...a.final.values()]),
    biggestClimb: a.climb,
    biggestDrop: a.drop,
    volatility: mean(a.moves),
    respect: mean(a.respect),
  }))
}

export type OwnerSeasonPr = {
  season: number
  ownerId: string
  teamId: number
  teamName: string
  weeks: number
  avgRank: number | null
  preseasonRank: number | null
  finalRank: number | null
  bestRank: number | null
  worstRank: number | null
  weeksAt1: number
  respect: number | null
  /** Place after the playoffs, when the season is over. */
  finish: number | null
}

/** Per owner per season. Keyed `${season}:${ownerId}`. */
export function ownerSeasonStats(
  data: PowerRankings,
  opts: PrOptions = DEFAULT_PR_OPTIONS,
): Map<string, OwnerSeasonPr> {
  const out = new Map<string, OwnerSeasonPr>()
  for (const s of data.seasons) {
    for (const t of s.teams) {
      out.set(`${s.season}:${t.owner_id}`, {
        season: s.season, ownerId: t.owner_id, teamId: t.team_id, teamName: t.team_name,
        weeks: 0, avgRank: null, preseasonRank: null, finalRank: null, bestRank: null, worstRank: null,
        weeksAt1: 0, respect: null, finish: t.final_standing,
      })
    }
  }
  const ranks = new Map<string, number[]>()
  const respect = new Map<string, number[]>()
  for (const r of rankedWeeks(data, opts)) {
    if (!r.counted) continue
    const key = `${r.season}:${r.ownerId}`
    const row = out.get(key)
    if (!row) continue
    const { rank, standing } = r.entry
    ;(ranks.get(key) ?? ranks.set(key, []).get(key)!).push(rank)
    if (standing != null) (respect.get(key) ?? respect.set(key, []).get(key)!).push(standing - rank)
    row.weeks += 1
    if (r.week === 1) row.preseasonRank = rank
    row.finalRank = rank
    if (rank === 1) row.weeksAt1 += 1
    row.bestRank = row.bestRank == null ? rank : Math.min(row.bestRank, rank)
    row.worstRank = row.worstRank == null ? rank : Math.max(row.worstRank, rank)
  }
  for (const [key, row] of out) {
    row.avgRank = mean(ranks.get(key) ?? [])
    row.respect = mean(respect.get(key) ?? [])
  }
  return out
}

function latestNames(data: PowerRankings): Map<string, { ownerName: string; teamName: string }> {
  const out = new Map<string, { ownerName: string; teamName: string }>()
  for (const s of data.seasons) {
    for (const t of s.teams) out.set(t.owner_id, { ownerName: t.owner_name, teamName: t.team_name })
  }
  return out
}

export type RankLookup = (season: number, week: number, teamId: number) =>
  | { entry: PowerRankingEntry; assumed: boolean; sourceWeek: number }
  | undefined

/** A team's rank going into a given week, for badges on other pages. */
export function rankLookup(data: PowerRankings | null): RankLookup {
  const map = new Map<string, { entry: PowerRankingEntry; assumed: boolean; sourceWeek: number }>()
  for (const s of data?.seasons ?? []) {
    for (const w of s.weeks) {
      for (const e of w.entries) {
        map.set(`${s.season}:${w.week}:${e.team_id}`, { entry: e, assumed: isAssumed(w), sourceWeek: w.source_week })
      }
    }
  }
  return (season, week, teamId) => map.get(`${season}:${week}:${teamId}`)
}

export type Accuracy = {
  games: number
  correct: number
  bySeason: { season: number; games: number; correct: number }[]
}

/** How often the better-ranked team won its game that week. Ties, and games
 * between teams of equal rank, are left out. */
export function pickAccuracy(data: PowerRankings, opts: PrOptions = DEFAULT_PR_OPTIONS): Accuracy {
  const posts = postIndex(data)
  const bySeason: Accuracy['bySeason'] = []
  for (const s of data.seasons) {
    let games = 0
    let correct = 0
    for (const w of s.weeks) {
      const guest = w.post_id != null && !!posts.get(w.post_id)?.is_guest
      if ((!opts.includeAssumed && isAssumed(w)) || (!opts.includeGuest && guest)) continue
      const rank = new Map(w.entries.map((e) => [e.team_id, e.rank]))
      for (const [a, b, winner] of w.games) {
        const ra = rank.get(a)
        const rb = rank.get(b)
        if (winner == null || ra == null || rb == null || ra === rb) continue
        games += 1
        if ((ra < rb ? a : b) === winner) correct += 1
      }
    }
    if (games) bySeason.push({ season: s.season, games, correct })
  }
  return {
    games: bySeason.reduce((n, s) => n + s.games, 0),
    correct: bySeason.reduce((n, s) => n + s.correct, 0),
    bySeason,
  }
}

export type Upset = {
  season: number
  week: number
  winnerTeamId: number
  loserTeamId: number
  winnerRank: number
  loserRank: number
  /** How many places separated them. */
  gap: number
}

/** Wins by the lower-ranked team, biggest gap first. */
export function biggestUpsets(data: PowerRankings, limit = 10, opts: PrOptions = DEFAULT_PR_OPTIONS): Upset[] {
  const posts = postIndex(data)
  const out: Upset[] = []
  for (const s of data.seasons) {
    for (const w of s.weeks) {
      const guest = w.post_id != null && !!posts.get(w.post_id)?.is_guest
      if ((!opts.includeAssumed && isAssumed(w)) || (!opts.includeGuest && guest)) continue
      const rank = new Map(w.entries.map((e) => [e.team_id, e.rank]))
      for (const [a, b, winner] of w.games) {
        if (winner == null) continue
        const loser = winner === a ? b : a
        const wr = rank.get(winner)
        const lr = rank.get(loser)
        if (wr == null || lr == null || wr <= lr) continue
        out.push({ season: s.season, week: w.week, winnerTeamId: winner, loserTeamId: loser, winnerRank: wr, loserRank: lr, gap: wr - lr })
      }
    }
  }
  return out.sort((x, y) => y.gap - x.gap || y.season - x.season).slice(0, limit)
}

/** The owner whose name matches the regular writer, if they're in the league. */
export function authorOwnerId(data: PowerRankings): string | null {
  if (!data.primary_author) return null
  const want = data.primary_author.trim().toLowerCase()
  for (const s of data.seasons) {
    const t = s.teams.find((x) => x.owner_name.trim().toLowerCase() === want)
    if (t) return t.owner_id
  }
  return null
}

export function teamIn(season: PowerRankingSeason, teamId: number) {
  return season.teams.find((t) => t.team_id === teamId)
}

/** "1st", "2nd", "13th". */
export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}

/** Arrow text for a weekly move: "▲3", "▼2", "–". */
export function formatChange(change: number | null): string {
  if (change == null) return ''
  if (change === 0) return '–'
  return change > 0 ? `▲${change}` : `▼${-change}`
}

/** Plain-language label for where an assumed week's ranks came from. */
export function sourceLabel(w: PowerRankingWeek): string {
  if (w.source === 'carried_forward') return `No rankings posted. Carried over from Week ${w.source_week}.`
  if (w.source === 'carried_back') return `No rankings posted yet this season. Taken from Week ${w.source_week}, the season's first rankings.`
  return ''
}

/** "Preseason" for week 1, else "Week N". */
export function weekLabel(week: number): string {
  return week === 1 ? 'Preseason' : `Week ${week}`
}
