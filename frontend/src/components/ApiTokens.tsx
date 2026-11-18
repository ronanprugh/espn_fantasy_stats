import { useEffect, useState } from 'react'
import { createApiToken, fetchApiTokens, revokeApiToken, type ApiToken } from '../api'

const when = (iso: string | null) =>
  iso ? new Date(iso.endsWith('Z') ? iso : `${iso}Z`).toLocaleString() : 'never'

/**
 * Personal API tokens: read-only access to your leagues for a script or an
 * assistant, sent as `Authorization: Bearer <token>`. A token can read
 * everything you can see here but change nothing, and it's shown once.
 */
export function ApiTokens() {
  const [tokens, setTokens] = useState<ApiToken[] | null>(null)
  const [name, setName] = useState('')
  const [created, setCreated] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = () =>
    fetchApiTokens()
      .then(setTokens)
      .catch((e: Error) => setError(e.message))

  useEffect(() => {
    load()
  }, [])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setCreated(null)
    setCopied(false)
    setBusy(true)
    try {
      const t = await createApiToken(name.trim() || 'API token')
      setCreated(t.token)
      setName('')
      await load()
    } catch (e: any) {
      setError(e.message || "Couldn't create a token")
    } finally {
      setBusy(false)
    }
  }

  const revoke = async (t: ApiToken) => {
    if (!confirm(`Revoke "${t.name}"? Anything using it stops working.`)) return
    setError(null)
    try {
      await revokeApiToken(t.id)
      await load()
    } catch (e: any) {
      setError(e.message || "Couldn't revoke that token")
    }
  }

  const copy = async () => {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <form className="league-form api-tokens" style={{ marginTop: 32 }} onSubmit={create}>
      <h3>API tokens</h3>
      <p className="subtitle">
        A token gives a script or an assistant read-only access to your leagues. It can see what
        you can see here but can't change anything. Revoke it when you're done.
      </p>

      <label htmlFor="token-name">Name</label>
      <input
        id="token-name"
        type="text"
        value={name}
        maxLength={64}
        placeholder="e.g. Claude"
        onChange={(e) => setName(e.target.value)}
      />

      {error && <div className="login-error">{error}</div>}

      {created && (
        <div className="invite-result" role="status">
          <p className="invite-label">Your new token (shown once; copy it now):</p>
          <code className="invite-code token-value">{created}</code>
          <div className="form-actions">
            <button type="button" className="secondary-btn small" onClick={copy}>
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      <div className="form-actions">
        <button type="submit" className="primary-btn" disabled={busy}>
          {busy ? 'Creating…' : 'Create token'}
        </button>
      </div>

      {tokens && tokens.length > 0 && (
        <ul className="token-list">
          {tokens.map((t) => (
            <li key={t.id}>
              <div className="token-main">
                <div className="token-name">{t.name}</div>
                <div className="token-meta">
                  <code>{t.prefix}…</code> · created {when(t.created_at)} · last used{' '}
                  {when(t.last_used_at)}
                </div>
              </div>
              <button type="button" className="danger-btn" onClick={() => revoke(t)}>
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  )
}
