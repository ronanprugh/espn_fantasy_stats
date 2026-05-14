import { useState } from 'react'
import { createLeague, deleteLeague } from '../api'
import { useLeague } from '../contexts/LeagueContext'

export function LeaguesPage() {
  const { leagues, refresh, select, selectedLeague } = useLeague()
  const [showForm, setShowForm] = useState(leagues.length === 0)

  return (
    <div className="page">
      <header className="page-header">
        <h2>Your Leagues</h2>
        {!showForm && (
          <button className="primary-btn" onClick={() => setShowForm(true)}>
            + Add league
          </button>
        )}
      </header>

      {leagues.length === 0 && !showForm && (
        <p className="subtitle">You haven't added any leagues yet.</p>
      )}

      {showForm && <AddLeagueForm onDone={async () => { await refresh(); setShowForm(false) }} onCancel={() => setShowForm(false)} />}

      <ul className="leagues-list">
        {leagues.map((l) => (
          <li key={l.id} className={selectedLeague?.id === l.id ? 'selected' : ''}>
            <div className="league-row-main">
              <div className="league-name">{l.display_name}</div>
              <div className="league-id">ESPN ID: {l.espn_league_id}</div>
            </div>
            <div className="league-row-actions">
              {selectedLeague?.id !== l.id && (
                <button onClick={() => select(l.espn_league_id)}>Use this</button>
              )}
              {selectedLeague?.id === l.id && <span className="pill-tag">Active</span>}
              <button
                className="danger-btn"
                onClick={async () => {
                  if (confirm(`Remove "${l.display_name}" from your account?`)) {
                    await deleteLeague(l.id)
                    await refresh()
                  }
                }}
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function AddLeagueForm({ onDone, onCancel }: { onDone: () => Promise<void>; onCancel: () => void }) {
  const [leagueId, setLeagueId] = useState('')
  const [name, setName] = useState('')
  const [s2, setS2] = useState('')
  const [swid, setSwid] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await createLeague({
        espn_league_id: Number(leagueId),
        display_name: name,
        espn_s2: s2 || undefined,
        swid: swid || undefined,
      })
      await onDone()
    } catch (e: any) {
      setError(e.message || 'Failed to add league')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="league-form" onSubmit={submit}>
      <h3>Add a League</h3>

      <label>ESPN League ID</label>
      <input
        type="number"
        value={leagueId}
        onChange={(e) => setLeagueId(e.target.value)}
        placeholder="1375368"
        required
      />

      <label>Display name</label>
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="The Payton Bowl"
        required
      />

      <label>espn_s2 cookie <span className="hint">(private leagues only)</span></label>
      <input
        type="password"
        value={s2}
        onChange={(e) => setS2(e.target.value)}
        placeholder="AEACjGBB..."
      />

      <label>SWID cookie <span className="hint">(private leagues only)</span></label>
      <input
        type="text"
        value={swid}
        onChange={(e) => setSwid(e.target.value)}
        placeholder="{...}"
      />

      <p className="hint">
        Get these from fantasy.espn.com → DevTools → Application → Cookies. Stored encrypted.
      </p>

      {error && <div className="login-error">{error}</div>}

      <div className="form-actions">
        <button type="submit" disabled={submitting} className="primary-btn">
          {submitting ? 'Adding…' : 'Add league'}
        </button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  )
}
