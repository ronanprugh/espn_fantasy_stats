import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { signup } from '../api'

export function SignupPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [inviteCode, setInviteCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await signup(username, password, inviteCode)
      navigate('/login', { replace: true, state: { signedUp: true } })
    } catch (e: any) {
      setError(e.message || 'Signup failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>ESPN Fantasy Stats</h1>
        <p className="subtitle">Create your account</p>

        <label htmlFor="su-user">Username</label>
        <input
          id="su-user"
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoFocus
          required
          minLength={3}
          maxLength={64}
        />

        <label htmlFor="su-pw">Password</label>
        <input
          id="su-pw"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
          minLength={8}
        />

        <label htmlFor="su-code">Invite code</label>
        <input
          id="su-code"
          type="text"
          value={inviteCode}
          onChange={(e) => setInviteCode(e.target.value)}
          autoComplete="off"
          required
          placeholder="Paste the code you received"
        />

        {error && <div className="login-error">{error}</div>}

        <button type="submit" disabled={submitting}>
          {submitting ? 'Creating account…' : 'Create account'}
        </button>

        <p className="login-hint">
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </form>
    </div>
  )
}
