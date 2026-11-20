/** Power rankings test data, shared by the lib and page tests. */
import type { PowerRankings, PowerRankingWeek } from '../api'

const entry = (team_id: number, rank: number, change: number | null, standing: number | null = null) => ({
  team_id, rank, change, posted_change: null, record: '0-0', standing, points_for: 0, written_name: '', blurb: '',
})

export const prWeek = (
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
export const prData: PowerRankings = {
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
        prWeek(1, [1, 2, 3], 'posted', 1, [[1, 3, 3]]),
        prWeek(2, [1, 2, 3], 'carried_forward', null, [[1, 2, 1]], [1, 2, 3]),
        prWeek(3, [3, 1, 2], 'posted', 3, [[3, 2, 3]], [1, 2, 3]),
      ],
    },
  ],
}
