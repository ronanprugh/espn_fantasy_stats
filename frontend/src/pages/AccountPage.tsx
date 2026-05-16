import { useState } from 'react'
import { changePassword } from '../api'
import { useAuth } from '../contexts/AuthContext'

export function AccountPage() {
  const { user } = useAuth()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)
    if (next.length < 8) {
      setError('New password must be at least 8 characters')
      return
    }
    if (next !== confirm) {
      setError('Passwords do not match')
      return
    }
    if (next === current) {
      setError('New password must differ from the current one')
      return
    }
    setSubmitting(true)
    try {
      await changePassword(current, next)
      setSuccess(true)
      setCurrent('')
      setNext('')
      setConfirm('')
    } catch (e: any) {
      setError(e.message || 'Failed to change password')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h2>Account</h2>
        {user && <span className="league">{user.username}</span>}
      </header>

      <form className="league-form" style={{ marginTop: 16 }} onSubmit={submit}>
        <h3>Change Password</h3>

        <label>Current password</label>
        <input
          type="password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
          required
        />

        <label>New password</label>
        <input
          type="password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
          minLength={8}
          required
        />

        <label>Confirm new password</label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          required
        />

        {error && <div className="login-error">{error}</div>}
        {success && <div className="success-msg">Password updated.</div>}

        <div className="form-actions">
          <button type="submit" className="primary-btn" disabled={submitting}>
            {submitting ? 'Saving…' : 'Update password'}
          </button>
        </div>
      </form>
    </div>
  )
}
