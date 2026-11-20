import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from '../api'
import { LeaguesPage } from './LeaguesPage'

const league = { id: 5, espn_league_id: 77, display_name: 'Our League', favorite_owner_id: null }
const refresh = vi.fn(async () => {})

vi.mock('../contexts/LeagueContext', () => ({
  useLeague: () => ({ leagues: [league], loaded: true, refresh, select: vi.fn(), selectedLeague: league }),
}))
vi.mock('../api', async (original) => ({
  ...(await original<typeof import('../api')>()),
  fetchOwnerHistory: vi.fn(async () => ({ league_id: 77, years: [], owners: [] })),
  updateLeague: vi.fn(),
}))
const updateLeague = vi.mocked(api.updateLeague)

function openCookies() {
  render(
    <MemoryRouter>
      <LeaguesPage />
    </MemoryRouter>,
  )
  return userEvent.click(screen.getByRole('button', { name: 'Cookies' }))
}

beforeEach(() => {
  updateLeague.mockReset()
  refresh.mockClear()
})

describe('LeaguesPage: replacing a league\'s ESPN cookies', () => {
  it('needs both cookies, or neither', async () => {
    await openCookies()
    await userEvent.type(screen.getByLabelText('espn_s2'), 'AEAonly')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(screen.getByText(/Fill in both cookies/)).toBeTruthy()
    expect(updateLeague).not.toHaveBeenCalled()
  })

  it('saves both and refreshes the list', async () => {
    updateLeague.mockResolvedValue(league)
    await openCookies()
    await userEvent.type(screen.getByLabelText('espn_s2'), ' AEAnew ')
    await userEvent.type(screen.getByLabelText('SWID'), 'SWID-1')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(updateLeague).toHaveBeenCalledWith(5, { espn_s2: 'AEAnew', swid: 'SWID-1' })
    expect(refresh).toHaveBeenCalled()
    expect(await screen.findByRole('button', { name: 'Cookies' })).toBeTruthy()  // back to the row
  })

  it("shows ESPN's refusal in the form", async () => {
    updateLeague.mockRejectedValue(new Error("ESPN didn't let these cookies read this league."))
    await openCookies()
    await userEvent.type(screen.getByLabelText('espn_s2'), 'AEAold')
    await userEvent.type(screen.getByLabelText('SWID'), 'SWID-1')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText(/didn't let these cookies read this league/)).toBeTruthy()
    expect(screen.getByLabelText('SWID')).toBeTruthy()  // still open, to fix and retry
  })
})
