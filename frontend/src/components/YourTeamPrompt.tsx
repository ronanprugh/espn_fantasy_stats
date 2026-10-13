import { useState } from 'react'
import { updateLeague, type LeagueSummary, type OwnerHistory } from '../api'
import { useLeague } from '../contexts/LeagueContext'

/**
 * Asks which team is the viewer's when the league has no favorite set.
 *
 * Team Hub, Team Comparison and Head to Head all open on the favorite team,
 * and open empty without one. The setting existed but sat in Manage Leagues,
 * where nobody went looking for it. Saving here sets it for all three.
 */
export function YourTeamPrompt({
  league,
  owners,
  selectedOwnerId,
}: {
  league: LeagueSummary
  owners: OwnerHistory[]
  selectedOwnerId: string
}) {
  const { refresh } = useLeague()
  const [dismissed, setDismissed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (league.favorite_owner_id || dismissed || owners.length === 0) return null

  const selected = owners.find((o) => o.owner_id === selectedOwnerId)

  const save = async () => {
    if (!selected) return
    setSaving(true)
    setError(null)
    try {
      await updateLeague(league.id, { favorite_owner_id: selected.owner_id })
      // Reloads the league list, so favorite_owner_id is set everywhere and
      // this prompt unmounts.
      await refresh()
    } catch (e: any) {
      setError(e.message || "Couldn't save that")
      setSaving(false)
    }
  }

  return (
    <div className="your-team-prompt" role="note">
      {selected ? (
        <>
          <span>
            Is <strong>{selected.current_team_name}</strong> your team? Team Hub, Team Comparison
            and Head to Head will open on it.
          </span>
          <span className="your-team-actions">
            <button type="button" className="primary-btn small" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : "Yes, that's me"}
            </button>
            <button type="button" className="secondary-btn small" onClick={() => setDismissed(true)} disabled={saving}>
              Not now
            </button>
          </span>
        </>
      ) : (
        <span>
          Which team is yours? Pick it above to save it, and Team Hub, Team Comparison and Head
          to Head will open on it.
        </span>
      )}
      {error && <span className="login-error inline">{error}</span>}
    </div>
  )
}
