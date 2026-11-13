import type {
  PowerRankingEntry,
  PowerRankings,
  PowerRankingSeason,
  PowerRankingWeek,
  ScoreboardMatchup,
  SeasonScoreboard,
  SeasonTeams,
  Team,
} from '../api'
import { isUnplayed } from './scoreboard'
import { formatDashRecord, isInProgress } from './seasonStats'
import { currentStreak, ordinal } from './teamHub'

/**
 * The This Week front page, worked out from the latest season's teams and
 * scoreboard (and the power rankings, when the league has them).
 */

/** In season: games have been played and there are no final standings yet.
 * Offseason: the latest season is over. Preseason: the latest season exists
 * but nothing has been played, so the page shows the season before. */
export type Phase = 'season' | 'offseason' | 'preseason'

export function seasonPhase(teams: SeasonTeams, scoreboard: SeasonScoreboard): Phase {
  if (!isInProgress(teams)) return 'offseason'
  return scoreboard.matchups.some((m) => !m.is_bye && !isUnplayed(m)) ? 'season' : 'preseason'
}

/** A game that has started but has no result: ESPN sets the winner once the
 * week is over. (A tie also has no winner; ties are rare enough, and a tied
 * week reads the same as a finished live one once the next week starts.) */
export function isLive(m: ScoreboardMatchup): boolean {
  return !m.is_bye && !isUnplayed(m) && m.winner_id === null
}

export type WeekStatus = {
  /** The week to show: the latest one with points on the board. */
  week: number
  /** Some of its games are still going. */
  live: boolean
  /** The week after, when the schedule has one. */
  nextWeek: number | null
}

export function currentWeek(scoreboard: SeasonScoreboard): WeekStatus | null {
  const started = scoreboard.matchups.filter((m) => !m.is_bye && !isUnplayed(m)).map((m) => m.week)
  if (started.length === 0) return null
  const week = Math.max(...started)
  const live = scoreboard.matchups.some((m) => m.week === week && isLive(m))
  const nextWeek = scoreboard.weeks.find((w) => w > week) ?? null
  return { week, live, nextWeek }
}

/** A week's matchups with yours first; the rest keep ESPN's order. */
export function weekMatchups(
  scoreboard: SeasonScoreboard,
  week: number,
  yourTeamId: number | null,
): ScoreboardMatchup[] {
  const mine = (m: ScoreboardMatchup) =>
    yourTeamId !== null && (m.team_a_id === yourTeamId || (!m.is_bye && m.team_b_id === yourTeamId))
  return scoreboard.matchups
    .filter((m) => m.week === week)
    .sort((a, b) => Number(mine(b)) - Number(mine(a)))
}

export type TeamGame = {
  week: number
  opponentId: number
  opponentName: string
  ownScore: number
  oppScore: number
  /** W/L/T once decided, `live` while being played, `upcoming` before. */
  status: 'W' | 'L' | 'T' | 'live' | 'upcoming'
}

/** One team's game in a week, from its side. Null on a bye or a week off. */
export function teamGame(scoreboard: SeasonScoreboard, teamId: number, week: number): TeamGame | null {
  const m = scoreboard.matchups.find(
    (x) => x.week === week && !x.is_bye && (x.team_a_id === teamId || x.team_b_id === teamId),
  )
  if (!m) return null
  const isA = m.team_a_id === teamId
  const status: TeamGame['status'] = isUnplayed(m)
    ? 'upcoming'
    : m.winner_id === null
      ? isLive(m) && week === currentWeek(scoreboard)?.week ? 'live' : 'T'
      : m.winner_id === teamId
        ? 'W'
        : 'L'
  return {
    week,
    opponentId: isA ? m.team_b_id : m.team_a_id,
    opponentName: isA ? m.team_b_name : m.team_a_name,
    ownScore: isA ? m.team_a_score : m.team_b_score,
    oppScore: isA ? m.team_b_score : m.team_a_score,
    status,
  }
}

/** The team's current run of results ("W3"), live games aside. */
export function teamStreak(scoreboard: SeasonScoreboard, teamId: number): string | null {
  const games = scoreboard.weeks
    .map((w) => teamGame(scoreboard, teamId, w))
    .filter((g): g is TeamGame => !!g && (g.status === 'W' || g.status === 'L' || g.status === 'T'))
    .map((g) => ({ week: g.week, is_bye: false, result: g.status }))
  return currentStreak(games)
}

/** Where a team stands: its current standing in season, its finish after. */
export function placeOf(team: Team, season: SeasonTeams): number {
  return isInProgress(season) ? team.standing : team.final_standing || team.standing
}

export type YourTeamSummary = {
  teamId: number
  teamName: string
  record: string
  /** "4th" in season, "Finished 2nd" after. */
  standing: string
  streak: string | null
  /** This week's game (the latest with points), in season. */
  game: TeamGame | null
  /** Next week's opponent, when this week is over and there is a next week. */
  next: TeamGame | null
}

export function yourTeamSummary(
  teams: SeasonTeams,
  scoreboard: SeasonScoreboard | null,
  ownerId: string,
): YourTeamSummary | null {
  const team = teams.teams.find((t) => t.owners[0]?.id === ownerId)
  if (!team) return null
  const inProgress = isInProgress(teams)
  const status = scoreboard && inProgress ? currentWeek(scoreboard) : null
  const game = status && scoreboard ? teamGame(scoreboard, team.team_id, status.week) : null
  const next =
    status && scoreboard && !status.live && status.nextWeek !== null
      ? teamGame(scoreboard, team.team_id, status.nextWeek)
      : null
  return {
    teamId: team.team_id,
    teamName: team.team_name,
    record: formatDashRecord(team.wins, team.losses, team.ties),
    standing: inProgress ? ordinal(team.standing) : `Finished ${ordinal(placeOf(team, teams))}`,
    streak: scoreboard && inProgress ? teamStreak(scoreboard, team.team_id) : null,
    game,
    next,
  }
}

export type SnapshotRow = {
  place: number
  team: Team
  yours: boolean
  /** Draw the playoff line under this row. */
  playoffLine: boolean
  /** Rows were skipped between the previous row and this one. */
  gapBefore: boolean
}

/**
 * The standings in brief: the top `top` teams, plus your row if it's lower
 * down. In season, the line under the last playoff place is marked.
 */
export function standingsSnapshot(
  teams: SeasonTeams,
  yourOwnerId: string | null,
  playoffTeams: number | null,
  top = 6,
): SnapshotRow[] {
  const inProgress = isInProgress(teams)
  const ordered = [...teams.teams].sort((a, b) => placeOf(a, teams) - placeOf(b, teams))
  const rows: SnapshotRow[] = []
  ordered.forEach((team, i) => {
    const yours = !!yourOwnerId && team.owners[0]?.id === yourOwnerId
    if (i >= top && !yours) return
    const place = placeOf(team, teams)
    rows.push({
      place,
      team,
      yours,
      playoffLine: inProgress && playoffTeams !== null && place === playoffTeams && i < ordered.length - 1,
      gapBefore: i > top,
    })
  })
  return rows
}

/** The league's champion, once the season is over. */
export function champion(teams: SeasonTeams): Team | null {
  if (isInProgress(teams)) return null
  return teams.teams.find((t) => t.final_standing === 1) ?? null
}

export type LatestRankings = {
  season: PowerRankingSeason
  week: PowerRankingWeek
  top: PowerRankingEntry[]
}

/** The latest season's most recent posted rankings (not a carried-over week),
 * as the Power Rankings page opens on, with its top `top` entries. */
export function latestRankings(data: PowerRankings | null, top = 5): LatestRankings | null {
  const season = data?.seasons[data.seasons.length - 1]
  if (!season || season.weeks.length === 0) return null
  const week =
    [...season.weeks].reverse().find((w) => w.source === 'posted') ?? season.weeks[season.weeks.length - 1]
  const entries = [...week.entries].sort((a, b) => a.rank - b.rank).slice(0, top)
  return entries.length ? { season, week, top: entries } : null
}
