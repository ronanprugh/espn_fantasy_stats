import { describe, expect, it } from 'vitest'
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
import { prData as data } from './powerRankings.fixture'

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
