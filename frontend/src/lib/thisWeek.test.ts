import { describe, expect, it } from 'vitest'
import type { PowerRankings, ScoreboardMatchup, SeasonScoreboard, SeasonTeams, Team } from '../api'
import {
  champion,
  currentWeek,
  latestRankings,
  seasonPhase,
  standingsSnapshot,
  teamGame,
  teamStreak,
  weekMatchups,
  yourTeamSummary,
} from './thisWeek'

function team(id: number, standing: number, final = 0, wins = 0, losses = 0): Team {
  return {
    team_id: id, team_name: `Team ${id}`, abbrev: `T${id}`,
    owners: [{ id: `o${id}`, first_name: 'O', last_name: `${id}` }],
    wins, losses, ties: 0, playoff_wins: 0, playoff_losses: 0, points_for: 0, points_against: 0,
    avg_points_for: 0, avg_points_against: 0, avg_plus_minus: 0,
    final_standing: final, standing, scores: [],
  }
}

function season(teams: Team[]): SeasonTeams {
  return { league_id: 1, year: 2026, scoring_type: 'ppr', teams }
}

function game(week: number, a: number, as: number, b: number, bs: number, winner: number | null): ScoreboardMatchup {
  return {
    week, is_playoff: false, round_label: 'regular', is_bye: false,
    team_a_id: a, team_a_name: `Team ${a}`, team_a_owner: '', team_a_score: as,
    team_b_id: b, team_b_name: `Team ${b}`, team_b_owner: '', team_b_score: bs, winner_id: winner,
  }
}

function board(matchups: ScoreboardMatchup[]): SeasonScoreboard {
  return { league_id: 1, year: 2026, weeks: [...new Set(matchups.map((m) => m.week))].sort((a, b) => a - b), matchups }
}

// Four teams. Weeks 1–2 final, week 3 live, week 4 unplayed.
const BOARD = board([
  game(1, 1, 100, 2, 90, 1), game(1, 3, 80, 4, 95, 4),
  game(2, 1, 110, 3, 99, 1), game(2, 2, 120, 4, 100, 2),
  game(3, 4, 40.5, 1, 22.1, null), game(3, 2, 10, 3, 0, null),
  game(4, 1, 0, 2, 0, null), game(4, 3, 0, 4, 0, null),
])
const LIVE = season([team(1, 1, 0, 2, 0), team(2, 2, 0, 1, 1), team(4, 3, 0, 1, 1), team(3, 4, 0, 0, 2)])

describe('seasonPhase', () => {
  it('is in season once games are played and before final standings', () => {
    expect(seasonPhase(LIVE, BOARD)).toBe('season')
  })

  it('is the offseason once every team has a final standing', () => {
    expect(seasonPhase(season([team(1, 1, 2), team(2, 2, 1)]), BOARD)).toBe('offseason')
  })

  it('is the preseason when nothing has been played', () => {
    expect(seasonPhase(LIVE, board([game(1, 1, 0, 2, 0, null)]))).toBe('preseason')
  })
})

describe('currentWeek', () => {
  it('is the latest week with points, live when a game has no winner yet', () => {
    expect(currentWeek(BOARD)).toEqual({ week: 3, live: true, nextWeek: 4 })
  })

  it('is final once every game has a result', () => {
    expect(currentWeek(board(BOARD.matchups.filter((m) => m.week <= 2)))).toEqual({ week: 2, live: false, nextWeek: null })
  })

  it('is null before any game', () => {
    expect(currentWeek(board([game(1, 1, 0, 2, 0, null)]))).toBeNull()
  })
})

describe('weekMatchups', () => {
  it('puts your matchup first', () => {
    expect(weekMatchups(BOARD, 3, 3).map((m) => m.team_a_id)).toEqual([2, 4])
    expect(weekMatchups(BOARD, 3, null).map((m) => m.team_a_id)).toEqual([4, 2])
  })
})

describe('teamGame and teamStreak', () => {
  it('reads a game from either side', () => {
    expect(teamGame(BOARD, 1, 3)).toMatchObject({ opponentName: 'Team 4', ownScore: 22.1, oppScore: 40.5, status: 'live' })
    expect(teamGame(BOARD, 4, 1)).toMatchObject({ opponentId: 3, status: 'W' })
    expect(teamGame(BOARD, 3, 2)).toMatchObject({ status: 'L' })
    expect(teamGame(BOARD, 2, 4)).toMatchObject({ opponentId: 1, status: 'upcoming' })
  })

  it('counts the run of results, leaving out the live game', () => {
    expect(teamStreak(BOARD, 1)).toBe('W2')
    expect(teamStreak(BOARD, 3)).toBe('L2')
  })
})

describe('yourTeamSummary', () => {
  it('gives record, standing, streak and this week, in season', () => {
    expect(yourTeamSummary(LIVE, BOARD, 'o1')).toMatchObject({
      teamName: 'Team 1', record: '2–0', standing: '1st', streak: 'W2',
      game: { week: 3, status: 'live' }, next: null,
    })
  })

  it('names next week once this week is over', () => {
    const done = board(BOARD.matchups.filter((m) => m.week !== 3))
    expect(yourTeamSummary(LIVE, done, 'o1')?.next).toMatchObject({ week: 4, opponentName: 'Team 2' })
  })

  it('says Finished in the offseason, without a game', () => {
    const over = season([team(1, 1, 2, 2, 0), team(2, 2, 1, 1, 1)])
    expect(yourTeamSummary(over, BOARD, 'o1')).toMatchObject({ standing: 'Finished 2nd', game: null, streak: null })
  })

  it('is null for an owner not in the season', () => {
    expect(yourTeamSummary(LIVE, BOARD, 'nobody')).toBeNull()
  })
})

describe('standingsSnapshot', () => {
  const eight = season(Array.from({ length: 8 }, (_, i) => team(i + 1, i + 1)))

  it('lists the top six and marks the playoff line', () => {
    const rows = standingsSnapshot(eight, null, 4)
    expect(rows.map((r) => r.place)).toEqual([1, 2, 3, 4, 5, 6])
    expect(rows.filter((r) => r.playoffLine).map((r) => r.place)).toEqual([4])
  })

  it('adds your row below the top six, after a gap', () => {
    const rows = standingsSnapshot(eight, 'o8', 4)
    expect(rows.map((r) => r.place)).toEqual([1, 2, 3, 4, 5, 6, 8])
    expect(rows[6]).toMatchObject({ yours: true, gapBefore: true })
  })

  it('has no gap when your row comes straight after', () => {
    expect(standingsSnapshot(eight, 'o7', 4)[6]).toMatchObject({ place: 7, gapBefore: false })
  })

  it('orders by finish and drops the playoff line once the season is over', () => {
    const over = season([team(1, 1, 3), team(2, 2, 1), team(3, 3, 2), team(4, 4, 4)])
    const rows = standingsSnapshot(over, null, 2)
    expect(rows.map((r) => r.team.team_id)).toEqual([2, 3, 1, 4])
    expect(rows.some((r) => r.playoffLine)).toBe(false)
  })
})

describe('champion', () => {
  it('is the first-place finisher once the season is over', () => {
    expect(champion(season([team(1, 1, 2), team(2, 2, 1)]))?.team_id).toBe(2)
    expect(champion(LIVE)).toBeNull()
  })
})

describe('latestRankings', () => {
  const entry = (team_id: number, rank: number, change: number | null) => ({
    team_id, rank, change, posted_change: null, record: '', standing: null, points_for: 0, written_name: '', blurb: '',
  })
  const data = {
    league_id: 1, primary_author: null, posts: [],
    seasons: [{
      season: 2026, reg_weeks: 14, last_week: 3, live: true, teams: [], previews: [],
      weeks: [
        { week: 2, source: 'posted', source_week: 2, post_id: 1, extra_post_ids: [], games: [], entries: [entry(1, 2, null), entry(2, 1, null)] },
        { week: 3, source: 'carried_forward', source_week: 2, post_id: null, extra_post_ids: [], games: [], entries: [entry(1, 2, 0), entry(2, 1, 0)] },
      ],
    }],
  } as unknown as PowerRankings

  it('takes the latest posted week, best rank first', () => {
    const r = latestRankings(data)
    expect(r?.week.week).toBe(2)
    expect(r?.top.map((e) => e.team_id)).toEqual([2, 1])
  })

  it('is null without rankings', () => {
    expect(latestRankings(null)).toBeNull()
    expect(latestRankings({ ...data, seasons: [] })).toBeNull()
  })
})
