import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SeasonTrades, Trade, TradeSide } from '../api'
import * as api from '../api'
import { TransactionsPage } from './TransactionsPage'

vi.mock('../hooks/useLeagueYears', () => ({
  useLeagueYears: () => ({ leagueId: 1, years: [2024, 2025], loading: false, error: null }),
}))
vi.mock('../hooks/useYourTeam', async (original) => ({
  ...(await original<typeof import('../hooks/useYourTeam')>()),
  useYourTeam: () => null,
}))
vi.mock('../api', async (original) => ({
  ...(await original<typeof import('../api')>()),
  fetchTrades: vi.fn(),
}))
const fetchTrades = vi.mocked(api.fetchTrades)

const player = (id: number, name: string) => ({
  player_id: id, name, position: 'RB', started_points: 0, bench_points: 0, weeks_started: 0, war: 0,
})
const side = (id: number, name: string, received: TradeSide['received'], sent: number[]): TradeSide => ({
  team_id: id, team_name: name, owner_id: `o${id}`, owner_name: name, received,
  sent: sent.map((pid) => ({ player_id: pid, name: `P${pid}`, position: 'RB' })),
  started_points: 0, war: 0, ppg: null, ppg_if_kept: null, games: 0,
})
const trade = (uid: string, date: number, sides: TradeSide[]): Trade => ({
  year: 2024, uid, date, week: 7, sides, winner_team_id: null, margin: 0,
})
const season = (trades: Trade[], extra: Partial<SeasonTrades> = {}): SeasonTrades => ({
  league_id: 1, year: 2024, supported: true, trades, ...extra,
})

function renderPage(search = '?year=2024') {
  return render(
    <MemoryRouter initialEntries={[`/transactions${search}`]}>
      <TransactionsPage />
    </MemoryRouter>,
  )
}

beforeEach(() => fetchTrades.mockReset())

describe('TransactionsPage', () => {
  it('says when ESPN returned nothing for a season, instead of "No trades"', async () => {
    fetchTrades.mockResolvedValue(season([], { unavailable: true }))
    renderPage()
    expect(await screen.findByText(/ESPN didn't return any transactions for 2024/)).toBeTruthy()
    expect(screen.queryByText(/No trades in 2024/)).toBeNull()
  })

  it('says when ESPN counts more trades than are shown', async () => {
    fetchTrades.mockResolvedValue(
      season([trade('a', 1, [side(1, 'Alpha', [], [9]), side(2, 'Bravo', [player(9, 'Henry')], [])])], {
        espn_trade_count: 2,
      }),
    )
    renderPage()
    expect(await screen.findByText(/ESPN records 2 trades in 2024 \(1 shown\)/)).toBeTruthy()
  })

  it('labels a player his new team traded on before he played for it', async () => {
    // Henry (9): Alpha -> Bravo, then Bravo -> Charlie the same week.
    const first = trade('a', 1, [side(1, 'Alpha', [], [9]), side(2, 'Bravo', [player(9, 'Henry')], [])])
    const second = trade('b', 2, [side(2, 'Bravo', [], [9]), side(3, 'Charlie', [player(9, 'Henry')], [])])
    fetchTrades.mockResolvedValue(season([first, second]))
    renderPage()
    expect(await screen.findByText('traded on to Charlie')).toBeTruthy()
  })

  it('loads All seasons one season at a time and reports each one', async () => {
    fetchTrades.mockImplementation(async (_league, year) =>
      year === 2024
        ? { ...season([], { unavailable: true }), year: 2024 }
        : {
            ...season([{ ...trade('c', 3, [side(1, 'Alpha', [], [9]), side(2, 'Bravo', [player(9, 'Henry')], [])]), year: 2025 }], {
              espn_trade_count: 2,
            }),
            year: 2025,
          },
    )
    renderPage('?year=all')
    expect(await screen.findByText(/ESPN didn't return any transactions for 2024/)).toBeTruthy()
    expect(screen.getByText(/ESPN records 2 trades in 2025 \(1 shown\)/)).toBeTruthy()
    expect(fetchTrades.mock.calls.map((c) => c[1]).sort()).toEqual([2024, 2025])  // one request per season
  })

  it('shows the season asked for even if an earlier request answers last', async () => {
    let answer2024: (v: SeasonTrades) => void = () => {}
    fetchTrades.mockImplementation((_league, year) =>
      year === 2024
        ? new Promise((resolve) => (answer2024 = resolve))
        : Promise.resolve({ ...season([], { unavailable: true }), year: 2025 }),
    )
    renderPage('?year=2024')
    // 2024 is still loading when the reader switches to 2025.
    await userEvent.click(screen.getByRole('button', { name: '2025' }))
    expect(await screen.findByText(/for 2025/)).toBeTruthy()
    answer2024(season([], { unavailable: true }))
    await new Promise((r) => setTimeout(r, 0))
    expect(screen.queryByText(/for 2024/)).toBeNull()
  })
})
