import { describe, expect, it } from 'vitest'
import type { PowerRankings, PowerRankingWeek } from '../api'
import {
  authorOwnerId,
  biggestUpsets,
  formatChange,
  ordinal,
  ownerSeasonStats,
  ownerStats,
  pickAccuracy,
  rankLookup,
} from './powerRankings'

const entry = (team_id: number, rank: number, change: number | null, standing: number | null = null) => ({
  team_id, rank, change, posted_change: null, record: '0-0', standing, points_for: 0, written_name: '', blurb: '',
})

const week = (
  w: number,
  order: number[],
  source: PowerRankingWeek['source'] = 'posted',
  post_id: number | null = w,
  games: PowerRankingWeek['games'] = [],
  prev: number[] | null = null,
): PowerRankingWeek => ({
  week: w,
  source,
  source_week: w,
  post_id: source === 'posted' ? post_id : null,
  extra_post_ids: [],
  entries: order.map((t, i) => entry(t, i + 1, prev ? prev.indexOf(t) - i : null, i + 1)),
  games,
})

/** Three teams. Week 1 posted [1,2,3]; week 2 carried over; week 3 posted
 * [3,1,2] by a guest; team 3 beat team 1 in week 1 (an upset). */
const data: PowerRankings = {
  league_id: 1,
  primary_author: 'Ann A',
  posts: [
    { id: 1, season: 2024, week: 1, posted_at: '', title: 'Pre', author: 'Ann A', is_guest: false, kind: 'rankings', format: 'text', has_image: false, has_entries: true, note: null },
    { id: 3, season: 2024, week: 3, posted_at: '', title: 'W3', author: 'Guest G', is_guest: true, kind: 'rankings', format: 'text', has_image: false, has_entries: true, note: null },
  ],
  seasons: [
    {
      season: 2024,
      reg_weeks: 3,
      last_week: 3,
      live: false,
      previews: [],
      teams: [
        { team_id: 1, team_name: 'Ones', owner_id: 'a', owner_name: 'Ann A', final_standing: 2, reg_standing: 1 },
        { team_id: 2, team_name: 'Twos', owner_id: 'b', owner_name: 'Bob B', final_standing: 3, reg_standing: 3 },
        { team_id: 3, team_name: 'Threes', owner_id: 'c', owner_name: 'Cy C', final_standing: 1, reg_standing: 2 },
      ],
      weeks: [
        week(1, [1, 2, 3], 'posted', 1, [[1, 3, 3]]),
        week(2, [1, 2, 3], 'carried_forward', null, [[1, 2, 1]], [1, 2, 3]),
        week(3, [3, 1, 2], 'posted', 3, [[3, 2, 3]], [1, 2, 3]),
      ],
    },
  ],
}

const byOwner = (opts?: Parameters<typeof ownerStats>[1]) =>
  new Map(ownerStats(data, opts).map((o) => [o.ownerId, o]))

describe('ownerStats', () => {
  it('counts posted weeks only by default', () => {
    const a = byOwner().get('a')!
    expect(a.weeks).toBe(2)
    expect(a.weeksAt1).toBe(1)
    expect(a.avgRank).toBe(1.5)
  })

  it('counts carried-over weeks when asked', () => {
    const a = byOwner({ includeAssumed: true, includeGuest: true }).get('a')!
    expect(a.weeks).toBe(3)
    expect(a.weeksAt1).toBe(2)
    expect(a.longestAt1).toBe(2)
  })

  it('can leave guest editions out', () => {
    const c = byOwner({ includeAssumed: false, includeGuest: false }).get('c')!
    expect(c.weeks).toBe(1)
    expect(c.weeksAt1).toBe(0)
  })

  it('records the biggest climb and the preseason rank', () => {
    const c = byOwner().get('c')!
    expect(c.biggestClimb).toEqual({ value: 2, season: 2024, week: 3 })
    expect(c.avgPreseasonRank).toBe(3)
    expect(byOwner().get('a')!.preseasonAt1).toBe(1)
  })
})

describe('ownerSeasonStats', () => {
  it('gives preseason, final and average rank per season', () => {
    const c = ownerSeasonStats(data).get('2024:c')!
    expect(c.preseasonRank).toBe(3)
    expect(c.finalRank).toBe(1)
    expect(c.avgRank).toBe(2)
    expect(c.finish).toBe(1)
  })
})

describe('pickAccuracy and upsets', () => {
  it('scores the better-ranked team against the result', () => {
    // Week 1: #1 lost to #3 (miss). Week 3: #1 beat #3 (hit). Week 2 is carried.
    expect(pickAccuracy(data)).toMatchObject({ games: 2, correct: 1 })
    expect(pickAccuracy(data, { includeAssumed: true, includeGuest: true })).toMatchObject({ games: 3, correct: 2 })
  })

  it('lists wins by the lower-ranked team, biggest gap first', () => {
    const [u] = biggestUpsets(data)
    expect(u).toMatchObject({ winnerTeamId: 3, loserTeamId: 1, gap: 2, week: 1 })
  })
})

describe('helpers', () => {
  it('looks up a team-week and says whether it was assumed', () => {
    const look = rankLookup(data)
    expect(look(2024, 2, 1)).toMatchObject({ assumed: true, entry: { rank: 1 } })
    expect(look(2024, 3, 3)).toMatchObject({ assumed: false, entry: { rank: 1 } })
    expect(look(2023, 1, 1)).toBeUndefined()
  })

  it('finds the writer among the owners', () => {
    expect(authorOwnerId(data)).toBe('a')
  })

  it('formats ordinals and moves', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd'])
    expect([3, -2, 0, null].map(formatChange)).toEqual(['▲3', '▼2', '–', ''])
  })
})
