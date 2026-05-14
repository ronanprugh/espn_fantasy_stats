import { useEffect, useState } from 'react'
import {
  createLeague,
  deleteLeague,
  fetchOwnerHistory,
  updateLeague,
  type LeagueSummary,
  type OwnerHistory,
} from '../api'
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
          <LeagueRow
            key={l.id}
            league={l}
            isSelected={selectedLeague?.id === l.id}
            onSelect={() => select(l.espn_league_id)}
            onChanged={refresh}
          />
        ))}
      </ul>
    </div>
  )
}

function LeagueRow({
  league,
  isSelected,
  onSelect,
  onChanged,
}: {
  league: LeagueSummary
  isSelected: boolean
  onSelect: () => void
  onChanged: () => Promise<void>
}) {
  const [editingName, setEditingName] = useState(false)
  const [editingFavorite, setEditingFavorite] = useState(false)
  const [nameDraft, setNameDraft] = useState(league.display_name)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [owners, setOwners] = useState<OwnerHistory[] | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchOwnerHistory(league.espn_league_id)
      .then((h) => {
        if (!cancelled) setOwners(h.owners)
      })
      .catch(() => {
        if (!cancelled) setOwners([])
      })
    return () => {
      cancelled = true
    }
  }, [league.espn_league_id])

  const favoriteOwner = owners?.find((o) => o.owner_id === league.favorite_owner_id) ?? null
  const favoriteLabel = favoriteOwner
    ? `${favoriteOwner.current_team_name} (${favoriteOwner.owner_name})`
    : league.favorite_owner_id
      ? '…'
      : 'None'

  const startEditName = (e: React.MouseEvent) => {
    e.stopPropagation()
    setNameDraft(league.display_name)
    setError(null)
    setEditingName(true)
  }

  const cancelEditName = (e?: React.MouseEvent) => {
    e?.stopPropagation()
    setEditingName(false)
  }

  const saveName = async (e?: React.FormEvent) => {
    e?.preventDefault()
    const trimmed = nameDraft.trim()
    if (!trimmed) {
      setError('Name is required')
      return
    }
    if (trimmed === league.display_name) {
      setEditingName(false)
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateLeague(league.id, { display_name: trimmed })
      await onChanged()
      setEditingName(false)
    } catch (err: any) {
      setError(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const saveFavorite = async (ownerId: string | null) => {
    setSaving(true)
    setError(null)
    try {
      if (ownerId === null) {
        await updateLeague(league.id, { clear_favorite: true })
      } else {
        await updateLeague(league.id, { favorite_owner_id: ownerId })
      }
      await onChanged()
      setEditingFavorite(false)
    } catch (err: any) {
      setError(err.message || 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (editingName) {
    return (
      <li className={`editing ${isSelected ? 'selected' : ''}`}>
        <form className="league-row-main editing-form" onSubmit={saveName}>
          <input
            type="text"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Escape') cancelEditName()
            }}
          />
          <div className="league-id">ESPN ID: {league.espn_league_id}</div>
          {error && <div className="login-error inline">{error}</div>}
        </form>
        <div className="league-row-actions">
          <button className="primary-btn small" onClick={saveName} disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={cancelEditName} disabled={saving}>
            Cancel
          </button>
        </div>
      </li>
    )
  }

  return (
    <li
      className={isSelected ? 'selected' : 'clickable'}
      onClick={() => {
        if (!isSelected) onSelect()
      }}
    >
      <div className="league-row-main">
        <div className="league-name">{league.display_name}</div>
        <div className="league-id">ESPN ID: {league.espn_league_id}</div>
        <div className="league-favorite" onClick={(e) => e.stopPropagation()}>
          <span className="favorite-label">Favorite:</span>{' '}
          {editingFavorite ? (
            <span className="favorite-edit">
              <select
                value={league.favorite_owner_id ?? ''}
                onChange={(e) => saveFavorite(e.target.value || null)}
                disabled={saving || owners === null}
                autoFocus
              >
                <option value="">— none —</option>
                {owners?.map((o) => (
                  <option key={o.owner_id} value={o.owner_id}>
                    {o.current_team_name} ({o.owner_name})
                  </option>
                ))}
              </select>
              <button onClick={() => setEditingFavorite(false)}>Cancel</button>
            </span>
          ) : (
            <>
              <span className="favorite-value">{favoriteLabel}</span>
              <button
                className="link-btn"
                onClick={() => setEditingFavorite(true)}
                disabled={owners === null}
              >
                {league.favorite_owner_id ? 'Change' : 'Set'}
              </button>
            </>
          )}
        </div>
        {error && <div className="login-error inline">{error}</div>}
      </div>
      <div className="league-row-actions">
        {isSelected ? (
          <span className="pill-tag active">Active</span>
        ) : (
          <span className="pill-tag use-this">Use this</span>
        )}
        <button className="edit-btn" onClick={startEditName}>Edit</button>
        <button
          className="danger-btn"
          onClick={async (e) => {
            e.stopPropagation()
            if (confirm(`Remove "${league.display_name}" from your account?`)) {
              await deleteLeague(league.id)
              await onChanged()
            }
          }}
        >
          Remove
        </button>
      </div>
    </li>
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
