import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { SlowHint } from '../components/Loading'

export function LoginPage() {
  const { login, sessionExpired } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const justSignedUp = (location.state as { signedUp?: boolean } | null)?.signedUp ?? false
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(username, password)
      const dest = (location.state as { from?: string } | null)?.from ?? '/'
      navigate(dest, { replace: true })
    } catch (e: any) {
      setError(e.message || 'Login failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>ESPN Fantasy Stats</h1>
        <p className="subtitle">Sign in to continue</p>

        <label htmlFor="lg-user">Username</label>
        <input
          id="lg-user"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoFocus
          required
        />

        <label htmlFor="lg-pw">Password</label>
        <input
          id="lg-pw"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />

        {sessionExpired && !justSignedUp && (
          <div className="login-success">Your session expired. Sign in again to pick up where you left off.</div>
        )}
        {justSignedUp && (
          <div className="login-success">Account created — sign in below.</div>
        )}
        {error && <div className="login-error">{error}</div>}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>
        <SlowHint active={submitting} />

        <p className="login-hint">
          Have an invite code? <Link to="/signup">Create an account</Link>
        </p>
      </form>
    </div>
  )
}
