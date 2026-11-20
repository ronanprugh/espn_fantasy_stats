/** Power Rankings, Archive: every post, coverage by week, and search. */
import { useMemo, useState, type ReactNode } from 'react'
import { type PowerRankingPostSummary, type PowerRankings } from '../../api'
import { postIndex, sourceLabel, teamIn, weekLabel } from '../../lib/powerRankings'
import { ImportPanel } from './ImportPanel'
import { type OpenPost, fmtDate } from './shared'

export function Coverage({ data, onPick }: { data: PowerRankings; onPick: (season: number, week: number) => void }) {
  const posts = postIndex(data)
  const maxWeeks = Math.max(...data.seasons.map((s) => s.reg_weeks))
  return (
    <div className="teams-wrap">
      <table className="pr-coverage">
        <thead>
          <tr>
            <th />
            {Array.from({ length: maxWeeks }, (_, i) => (
              <th key={i} className="num">{i === 0 ? 'Pre' : i + 1}</th>
            ))}
            <th className="num">Posted</th>
          </tr>
        </thead>
        <tbody>
          {[...data.seasons].reverse().map((s) => (
            <tr key={s.season}>
              <th scope="row">{s.season}</th>
              {Array.from({ length: maxWeeks }, (_, i) => {
                const w = s.weeks.find((x) => x.week === i + 1)
                if (!w) return <td key={i}><span className={`cov ${i < s.reg_weeks ? 'future' : 'none'}`} /></td>
                const p = w.post_id != null ? posts.get(w.post_id) : undefined
                return (
                  <td key={i}>
                    <button
                      className={`cov ${w.source === 'posted' ? 'posted' : 'assumed'}`}
                      onClick={() => onPick(s.season, w.week)}
                      title={w.source === 'posted' ? `${weekLabel(w.week)}: ${p?.title}${p?.is_guest ? ` (guest: ${p.author})` : ''}` : `${weekLabel(w.week)}: ${sourceLabel(w)}`}
                      aria-label={`${s.season} ${weekLabel(w.week)}`}
                    >
                      {p?.is_guest ? 'G' : ''}
                    </button>
                  </td>
                )
              })}
              <td className="num opp-owner">
                {s.weeks.filter((w) => w.source === 'posted').length}/{s.weeks.length}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="chart-footnote">
        Solid: rankings posted. Hatched: no rankings that week, so the nearest week's are used. G: guest edition. Click a week to open it.
      </p>
    </div>
  )
}

export function ArchiveView({
  data,
  leagueId,
  openPost,
  onImported,
}: {
  data: PowerRankings
  leagueId: number
  openPost: OpenPost
  onImported: () => void
}) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const hits = useMemo(() => {
    if (q.length < 3) return []
    const out: { season: number; week: number; teamName: string; blurb: string; postId: number }[] = []
    for (const s of data.seasons) {
      for (const w of s.weeks) {
        if (w.post_id == null) continue
        for (const e of w.entries) {
          if (e.blurb.toLowerCase().includes(q) || teamIn(s, e.team_id)?.team_name.toLowerCase().includes(q)) {
            if (!e.blurb) continue
            out.push({ season: s.season, week: w.week, teamName: teamIn(s, e.team_id)?.team_name ?? '', blurb: e.blurb, postId: w.post_id })
          }
        }
      }
    }
    return out.reverse().slice(0, 60)
  }, [data, q])
  const bySeason = new Map<number, PowerRankingPostSummary[]>()
  for (const p of data.posts) (bySeason.get(p.season) ?? bySeason.set(p.season, []).get(p.season)!).push(p)

  return (
    <section className="pr-archive">
      <div className="control pr-search">
        <label htmlFor="pr-search">Search the write-ups</label>
        <input
          id="pr-search"
          type="search"
          placeholder="A player, a team, a nickname…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      {q.length >= 3 && (
        <div className="pr-hits">
          <p className="subtitle">{hits.length === 60 ? 'First 60 matches' : `${hits.length} match${hits.length === 1 ? '' : 'es'}`}</p>
          <ul>
            {hits.map((h, i) => (
              <li key={i}>
                <button className="pr-hit" onClick={() => openPost(h.postId, h.blurb)}>
                  <span className="pr-hit-when">{h.season} {weekLabel(h.week)} · {h.teamName}</span>
                  <span className="pr-hit-text">{snippet(h.blurb, q)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {[...bySeason.entries()].reverse().map(([season, posts]) => (
        <section key={season} className="pr-archive-season">
          <h3>{season}</h3>
          <ul className="pr-posts">
            {posts.map((p) => (
              <li key={p.id}>
                <button className="pr-post-row" onClick={() => openPost(p.id)}>
                  <span className="pr-post-when">{fmtDate(p.posted_at)}</span>
                  <span className="pr-post-title">{p.title}</span>
                  <span className="pr-post-tags">
                    {p.kind === 'preview' && <span className="tag">Playoff preview</span>}
                    {p.format === 'image' && <span className="tag">{p.has_image ? 'Image' : 'Image not saved'}</span>}
                    {p.is_guest && <span className="tag guest">Guest: {p.author}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <details className="pr-manage">
        <summary>Replace or remove this league's power rankings</summary>
        <ImportPanel leagueId={leagueId} onDone={onImported} replacing />
      </details>
    </section>
  )
}

export function snippet(text: string, q: string): ReactNode {
  const at = text.toLowerCase().indexOf(q)
  if (at < 0) return text.slice(0, 160) + (text.length > 160 ? '…' : '')
  const start = Math.max(0, at - 60)
  const end = Math.min(text.length, at + q.length + 100)
  return (
    <>
      {start > 0 && '…'}
      {text.slice(start, at)}
      <mark>{text.slice(at, at + q.length)}</mark>
      {text.slice(at + q.length, end)}
      {end < text.length && '…'}
    </>
  )
}
