import { useState } from 'react'
import { changePassword, generateInvite } from '../api'
import { useAuth } from '../contexts/AuthContext'

export function AccountPage() {
  const { user } = useAuth()

  // Admin: invite code generation
  const [inviteHours, setInviteHours] = useState<1 | 6 | 12 | 24>(24)
  const [inviteResult, setInviteResult] = useState<{ code: string; expires_at: string } | null>(null)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteSubmitting, setInviteSubmitting] = useState(false)

  const generateCode = async () => {
    setInviteError(null)
    setInviteResult(null)
    setInviteSubmitting(true)
    try {
      const result = await generateInvite(inviteHours)
      setInviteResult(result)
    } catch (e: any) {
      setInviteError(e.message || 'Failed to generate invite')
    } finally {
      setInviteSubmitting(false)
    }
  }
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

      {user?.is_admin && (
        <div className="league-form" style={{ marginTop: 32 }}>
          <h3>Invite a new user</h3>
          <label>Code expires in</label>
          <select
            value={inviteHours}
            onChange={(e) => setInviteHours(Number(e.target.value) as 1 | 6 | 12 | 24)}
          >
            <option value={1}>1 hour</option>
            <option value={6}>6 hours</option>
            <option value={12}>12 hours</option>
            <option value={24}>24 hours</option>
          </select>

          {inviteError && <div className="login-error">{inviteError}</div>}

          {inviteResult && (
            <div className="invite-result">
              <p className="invite-label">Share this code (shown once):</p>
              <code className="invite-code">{inviteResult.code}</code>
              <p className="invite-expires">
                Expires: {new Date(inviteResult.expires_at).toLocaleString()}
              </p>
            </div>
          )}

          <div className="form-actions">
            <button
              type="button"
              className="primary-btn"
              onClick={generateCode}
              disabled={inviteSubmitting}
            >
              {inviteSubmitting ? 'Generating…' : 'Generate invite code'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
