import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../../api'
import type { Move, TradeSide } from '../../api'
import { TeamSeasonTransactions } from './TeamSeason'

vi.mock('../../api', async (original) => ({
  ...(await original<typeof import('../../api')>()),
  fetchTrades: vi.fn(),
  fetchMoves: vi.fn(),
  fetchTeams: vi.fn(),
  fetchSeasonRosters: vi.fn(),
}))
const fetchTrades = vi.mocked(api.fetchTrades)
const fetchMoves = vi.mocked(api.fetchMoves)
const fetchTeams = vi.mocked(api.fetchTeams)
const fetchSeasonRosters = vi.mocked(api.fetchSeasonRosters)

const side = (id: number, name: string, received: number[], sent: number[], war: number): TradeSide => ({
  team_id: id, team_name: name, owner_id: `o${id}`, owner_name: name,
  received: received.map((pid) => ({
    player_id: pid, name: `P${pid}`, position: 'RB', started_points: 0, bench_points: 0, weeks_started: 0, war,
  })),
  sent: sent.map((pid) => ({ player_id: pid, name: `P${pid}`, position: 'RB' })),
  started_points: 0, war, ppg: null, ppg_if_kept: null, games: 0,
})
const move = (owner: string, kind: Move['kind'], date: number, added: string[], dropped: string[]): Move => ({
  year: 2025, date, week: date, kind, team_id: 1, team_name: 'Alpha', owner_id: owner, owner_name: '',
  added: added.map((name, i) => ({ player_id: 100 + i + date, name, position: 'WR' })),
  dropped: dropped.map((name, i) => ({ player_id: 200 + i + date, name, position: 'WR' })), bid: 0,
})

beforeEach(() => {
  for (const f of [fetchTrades, fetchMoves, fetchTeams, fetchSeasonRosters]) f.mockReset()
  fetchSeasonRosters.mockResolvedValue({
    league_id: 1, year: 2025, team_id: 1, supported: true, in_progress: true,
    start: { week: 1, players: [{ player_id: 9, name: 'Henry', position: 'RB', slot_position: 'RB', pro_team: 'BAL' }] },
    end: { week: 12, players: [{ player_id: 9, name: 'Henry', position: 'RB', slot_position: 'RB', pro_team: 'BAL' }] },
  })
  fetchTrades.mockResolvedValue({
    league_id: 1, year: 2025, supported: true,
    trades: [
      { year: 2025, uid: 'a', date: 1, week: 4, winner_team_id: 1, margin: 0.3, sides: [side(1, 'Alpha', [7], [8], 0.5), side(2, 'Bravo', [8], [7], 0.2)] },
      { year: 2025, uid: 'b', date: 2, week: 5, winner_team_id: 3, margin: 0.1, sides: [side(2, 'Bravo', [6], [5], 0.1), side(3, 'Charlie', [5], [6], 0.2)] },
    ],
  })
  fetchMoves.mockResolvedValue({
    league_id: 1, year: 2025, supported: true,
    moves: [move('o1', 'waiver', 3, ['Puka'], []), move('o1', 'drop', 4, [], ['Cut']), move('o2', 'free_agent', 5, ['Other'], [])],
  })
})

function renderModule() {
  return render(
    <MemoryRouter>
      <TeamSeasonTransactions leagueId={1} year={2025} ownerId="o1" teamId={1} />
    </MemoryRouter>,
  )
}

describe('TeamSeasonTransactions', () => {
  it('shows the team\'s rosters, its trades from its side, and its moves', async () => {
    renderModule()
    // A season being played ends "now".
    expect(await screen.findByText('Now · week 12')).toBeTruthy()
    expect(screen.getByText('Won by 0.30 wins')).toBeTruthy()
    // Bravo and Charlie's trade isn't Alpha's.
    expect(screen.queryByText('Charlie')).toBeNull()
    expect(screen.getByText('Puka WR')).toBeTruthy()
    expect(screen.queryByText('Other WR')).toBeNull()
    expect(screen.getByRole('columnheader', { name: 'Type' })).toBeTruthy()
    expect(screen.getByRole('link', { name: /Every season's transactions/ }).getAttribute('href')).toBe(
      '/transactions?year=all&team=o1',
    )
    // The team id was given: no lookup.
    expect(fetchTeams).not.toHaveBeenCalled()
    expect(fetchSeasonRosters).toHaveBeenCalledWith(1, 2025, 1)
  })

  it('still shows the trades and moves when the rosters fail', async () => {
    fetchSeasonRosters.mockRejectedValue(new Error('Not Found'))
    renderModule()
    expect(await screen.findByText(/Couldn't load the rosters/)).toBeTruthy()
    expect(screen.getByText('Won by 0.30 wins')).toBeTruthy()
    expect(screen.getByText('Puka WR')).toBeTruthy()
  })

  it('says so when the team made no trades or moves', async () => {
    fetchTrades.mockResolvedValue({ league_id: 1, year: 2025, supported: true, trades: [] })
    fetchMoves.mockResolvedValue({ league_id: 1, year: 2025, supported: true, moves: [] })
    renderModule()
    expect(await screen.findByText('No trades in 2025.')).toBeTruthy()
    expect(screen.getByText('None in 2025.')).toBeTruthy()
  })
})
