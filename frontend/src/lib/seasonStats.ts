import type { SeasonTeams } from '../api'

/**
 * Derived per-team stats for one season, computed from the weekly scores the
 * season payload already carries.
 *
 * Every stat here reads only the first `gamesPlayed` entries of `team.scores`.
 * That list is not just the regular season: it runs on through playoff and
 * consolation weeks, and for a season in progress the unplayed weeks are 0.0.
 * Reading past the regular season would make a 0.0 placeholder everyone's low
 * week and drag every average down.
 */
export type TeamSeasonStats = {
  /** (W + ½T) / games, e.g. 0.5 for 7-7. */
  winPct: number
  /** Points per game relative to the league's points per game that season,
   * e.g. 0.12 for 12% above average. */
  ptsVsAvg: number
  allPlayWins: number
  allPlayLosses: number
  allPlayTies: number
  allPlayPct: number
  /** Actual wins minus the wins the all-play rate predicts over the same
   * schedule. Positive means the team won more than its scoring earned. */
  luck: number
  highScore: number
  highWeek: number
  lowScore: number
  lowWeek: number
  /** Weeks the team posted the league's highest score; a tie counts for each. */
  topScorerWeeks: number
  /** Population standard deviation of weekly scores. */
  stdDev: number
}

/** Regular-season games completed. Taken as the league maximum so one team's
 * missing row can't truncate everyone else's season. */
export function gamesPlayed(season: SeasonTeams): number {
  return Math.max(0, ...season.teams.map((t) => t.wins + t.losses + t.ties))
}

/** A season is in progress until ESPN assigns final standings, which happens
 * once its playoffs finish. Read from the data rather than the calendar, so a
 * season stops counting as current the moment it's actually over. */
export function isInProgress(season: SeasonTeams): boolean {
  return season.teams.some((t) => !t.final_standing)
}

const winsWithTies = (w: number, t: number) => w + t / 2

/** Stats keyed by team_id. Empty for a season with no completed games. */
export function computeSeasonStats(season: SeasonTeams): Map<number, TeamSeasonStats> {
  const result = new Map<number, TeamSeasonStats>()
  const games = gamesPlayed(season)
  if (games === 0 || season.teams.length === 0) return result

  const weekly = new Map(season.teams.map((t) => [t.team_id, t.scores.slice(0, games)]))

  let leagueTotal = 0
  let leagueCount = 0
  for (const scores of weekly.values()) {
    for (const s of scores) {
      leagueTotal += s
      leagueCount += 1
    }
  }
  const leaguePpg = leagueCount ? leagueTotal / leagueCount : 0

  const weekTops: number[] = []
  for (let w = 0; w < games; w++) {
    weekTops.push(Math.max(...[...weekly.values()].map((s) => s[w] ?? -Infinity)))
  }

  for (const team of season.teams) {
    const scores = weekly.get(team.team_id)!
    if (scores.length === 0) continue

    let apW = 0
    let apL = 0
    let apT = 0
    for (let w = 0; w < scores.length; w++) {
      for (const other of season.teams) {
        if (other.team_id === team.team_id) continue
        const theirs = weekly.get(other.team_id)![w]
        if (theirs === undefined) continue
        if (scores[w] > theirs) apW += 1
        else if (scores[w] < theirs) apL += 1
        else apT += 1
      }
    }
    const apGames = apW + apL + apT
    const allPlayPct = apGames ? winsWithTies(apW, apT) / apGames : 0

    const teamGames = team.wins + team.losses + team.ties
    const winPct = teamGames ? winsWithTies(team.wins, team.ties) / teamGames : 0

    const ppg = scores.reduce((a, b) => a + b, 0) / scores.length
    const variance = scores.reduce((a, s) => a + (s - ppg) ** 2, 0) / scores.length

    let highWeek = 0
    let lowWeek = 0
    scores.forEach((s, i) => {
      if (s > scores[highWeek]) highWeek = i
      if (s < scores[lowWeek]) lowWeek = i
    })

    result.set(team.team_id, {
      winPct,
      ptsVsAvg: leaguePpg ? ppg / leaguePpg - 1 : 0,
      allPlayWins: apW,
      allPlayLosses: apL,
      allPlayTies: apT,
      allPlayPct,
      luck: winsWithTies(team.wins, team.ties) - allPlayPct * teamGames,
      highScore: scores[highWeek],
      highWeek: highWeek + 1,
      lowScore: scores[lowWeek],
      lowWeek: lowWeek + 1,
      topScorerWeeks: scores.filter((s, w) => s === weekTops[w]).length,
      stdDev: Math.sqrt(variance),
    })
  }
  return result
}

/** Baseball-style rate: 0.5 → ".500", 1 → "1.000". */
export function formatRate(x: number): string {
  return x.toFixed(3).replace(/^0(?=\.)/, '')
}

export function formatRecord(w: number, l: number, t: number): string {
  return t ? `${w}-${l}-${t}` : `${w}-${l}`
}
