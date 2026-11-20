import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { LoginPage } from './LoginPage'

const auth = { login: vi.fn(), sessionExpired: false }
vi.mock('../contexts/AuthContext', () => ({ useAuth: () => auth }))

function renderLogin(state?: object) {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/login', state }]}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/standings" element={<p>Standings page</p>} />
        <Route path="/" element={<p>Front page</p>} />
      </Routes>
    </MemoryRouter>,
  )
}

async function signIn() {
  await userEvent.type(screen.getByLabelText('Username'), 'ronan')
  await userEvent.type(screen.getByLabelText('Password'), 'pw')
  await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
}

describe('LoginPage', () => {
  it('shows why signing in failed', async () => {
    auth.login.mockRejectedValueOnce(new Error('Invalid credentials'))
    renderLogin()
    await signIn()
    expect(await screen.findByText('Invalid credentials')).toBeTruthy()
  })

  it('returns to the page the reader was sent here from', async () => {
    auth.login.mockResolvedValueOnce(undefined)
    renderLogin({ from: '/standings' })
    await signIn()
    expect(await screen.findByText('Standings page')).toBeTruthy()
  })
})
