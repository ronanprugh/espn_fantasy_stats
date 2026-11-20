import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { prData } from '../lib/powerRankings.fixture'
import { PowerRankingsPage } from './PowerRankingsPage'

const league = { id: 1, espn_league_id: 1, display_name: 'League' }
vi.mock('../contexts/LeagueContext', () => ({ useLeague: () => ({ selectedLeague: league }) }))
vi.mock('../hooks/useYourTeam', async (original) => ({
  ...(await original<typeof import('../hooks/useYourTeam')>()),
  useYourTeam: () => null,
}))
const state = { data: prData }
vi.mock('../hooks/usePowerRankings', () => ({
  usePowerRankings: () => ({ data: state.data, loading: false, error: null, reload: vi.fn(), hasData: state.data.posts.length > 0 }),
}))

function renderPage(search = '') {
  return render(
    <MemoryRouter initialEntries={[`/power-rankings${search}`]}>
      <PowerRankingsPage />
    </MemoryRouter>,
  )
}

describe('PowerRankingsPage', () => {
  it('shows the latest week by default', () => {
    renderPage()
    expect(screen.getByRole('button', { name: 'Weekly' }).className).toBe('active')
    expect(screen.getAllByText('Threes').length).toBeGreaterThan(0)
  })

  it.each([
    ['Season', '?view=season'],
    ['All-Time', '?view=alltime'],
    ['Archive', '?view=archive'],
  ])('opens the %s view from the URL', (label, search) => {
    renderPage(search)
    expect(screen.getByRole('button', { name: label }).className).toBe('active')
    expect(screen.getAllByText(/Ones|Ann A/).length).toBeGreaterThan(0)
  })

  it('switches views from the tabs', async () => {
    renderPage()
    for (const label of ['Season', 'All-Time', 'Archive', 'Weekly']) {
      await userEvent.click(screen.getByRole('button', { name: label }))
      expect(screen.getByRole('button', { name: label }).className).toBe('active')
    }
  })

  it('offers an import when there are no rankings yet', () => {
    state.data = { ...prData, posts: [], seasons: [] }
    try {
      const { container } = renderPage()
      expect(screen.getByRole('heading', { name: 'No power rankings yet' })).toBeTruthy()
      expect(container.querySelector('input[type="file"]')).not.toBeNull()
    } finally {
      state.data = prData
    }
  })
})
