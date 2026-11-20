/** Importing power rankings from a file, and the empty state that offers it. */
import { useState } from 'react'
import { deletePowerRankings, importPowerRankings } from '../../api'

export function EmptyState({ leagueId, onImported }: { leagueId: number; onImported: () => void }) {
  return (
    <section className="pr-empty">
      <h3>No power rankings yet</h3>
      <p>
        Import your league's power rankings to chart them week by week, read every write-up, and see rankings next to
        results on Standings, All-Time, Team Hub, Trends, Head to Head and the Scoreboard.
      </p>
      <ImportPanel leagueId={leagueId} onDone={onImported} />
      <details className="pr-format">
        <summary>What the file looks like</summary>
        <pre>{`{
  "posts": [
    {
      "season": 2024,
      "week": 2,                     // the week it looks ahead to; preseason is 1
      "posted_at": "2024-09-12T17:07:18",
      "title": "POWER RANKINGS WEEK 2",
      "author": "Your Commissioner",
      "kind": "rankings",            // or "preview"
      "format": "text",              // or "image", with image_base64 + image_mime
      "text": "The full post…",
      "entries": [
        { "rank": 1, "team_name": "Team Name", "record": "1-0", "blurb": "…" }
      ]
    }
  ]
}`}</pre>
        <p>
          Entries can name a team by <code>team_name</code> (any name it has used, or its abbreviation) or by ESPN{' '}
          <code>team_id</code>.
        </p>
      </details>
    </section>
  )
}

export function ImportPanel({ leagueId, onDone, replacing = false }: { leagueId: number; onDone: () => void; replacing?: boolean }) {
  const [status, setStatus] = useState<{ kind: 'idle' | 'busy' | 'ok' | 'error'; message?: string }>({ kind: 'idle' })
  const [confirmDelete, setConfirmDelete] = useState(false)

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setStatus({ kind: 'busy', message: `Importing ${file.name}…` })
    let json: unknown
    try {
      json = JSON.parse(await file.text())
    } catch {
      setStatus({ kind: 'error', message: `${file.name} isn't valid JSON.` })
      return
    }
    try {
      const r = await importPowerRankings(leagueId, json)
      setStatus({ kind: 'ok', message: `Imported ${r.posts} posts (${r.rankings} with rankings) across ${r.seasons.length} seasons.` })
      onDone()
    } catch (e) {
      setStatus({ kind: 'error', message: (e as Error).message })
    }
  }

  return (
    <div className="pr-import">
      <label className="primary-btn pr-file-btn">
        {replacing ? 'Replace with a new file' : 'Import a file'}
        <input
          id={replacing ? 'pr-import-replace' : 'pr-import'}
          type="file"
          accept="application/json,.json"
          onChange={(e) => onFile(e.target.files?.[0])}
          disabled={status.kind === 'busy'}
        />
      </label>
      {replacing && !confirmDelete && (
        <button className="danger-btn" onClick={() => setConfirmDelete(true)}>
          Remove all power rankings
        </button>
      )}
      {replacing && confirmDelete && (
        <span className="pr-confirm">
          Remove every post for everyone in this league?{' '}
          <button
            className="danger-btn"
            onClick={async () => {
              await deletePowerRankings(leagueId)
              setConfirmDelete(false)
              onDone()
            }}
          >
            Remove
          </button>{' '}
          <button className="secondary-btn" onClick={() => setConfirmDelete(false)}>Keep them</button>
        </span>
      )}
      {replacing && <p className="subtitle">Importing replaces the whole archive for everyone who has added this league.</p>}
      {status.message && (
        <p className={status.kind === 'error' ? 'login-error inline' : 'subtitle'} role={status.kind === 'error' ? 'alert' : undefined}>
          {status.message}
        </p>
      )}
    </div>
  )
}
