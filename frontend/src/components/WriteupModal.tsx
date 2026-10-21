import { useEffect, useRef, useState } from 'react'
import { fetchPowerRankingPost, powerRankingImageUrl, type PowerRankingPost } from '../api'

/**
 * A power rankings post in full. Opened from a team's line, it scrolls to and
 * marks that team's write-up within the post.
 */
export function WriteupModal({
  leagueId,
  postId,
  highlight,
  onClose,
}: {
  leagueId: number
  postId: number
  /** A team's blurb to mark in the text. */
  highlight?: string
  onClose: () => void
}) {
  const [post, setPost] = useState<PowerRankingPost | null>(null)
  const [error, setError] = useState<string | null>(null)
  const markRef = useRef<HTMLElement | null>(null)
  const closeRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    setPost(null)
    fetchPowerRankingPost(leagueId, postId).then(setPost).catch((e: Error) => setError(e.message))
  }, [leagueId, postId])

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    markRef.current?.scrollIntoView({ block: 'center' })
  }, [post])

  const body = post ? splitHighlight(post.text, highlight) : null
  const date = post ? new Date(post.posted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal writeup-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="writeup-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <div>
            <h3 id="writeup-title">{post?.title ?? 'Loading…'}</h3>
            {post && (
              <div className="writeup-meta">
                {post.season} · {date} · {post.is_guest ? <span className="guest-tag">Guest edition by {post.author}</span> : post.author}
              </div>
            )}
          </div>
          <button ref={closeRef} type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="modal-body">
          {error && <p className="error">{error}</p>}
          {post?.note && <p className="writeup-note">{post.note}</p>}
          {post?.has_image && (
            <img className="writeup-image" src={powerRankingImageUrl(leagueId, post.id)} alt={post.title} />
          )}
          {body && (
            <div className="writeup-text">
              {body.before}
              {body.match && <mark ref={markRef}>{body.match}</mark>}
              {body.after}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/** Blurbs were cut from the post with non-breaking spaces and curly quotes
 * straightened, so the search runs on a same-length normalised copy and the
 * original text is what's shown. */
const normalise = (s: string) => s.replace(/\u00a0/g, ' ').replace(/[\u2018\u2019]/g, "'")

function splitHighlight(text: string, needle?: string) {
  const want = needle ? normalise(needle.trim()) : ''
  const hay = normalise(text)
  const probe = want.slice(0, 80)
  const at = probe ? hay.indexOf(probe) : -1
  if (at < 0) return { before: text, match: '', after: '' }
  const end = hay.startsWith(want, at) ? at + want.length : at + probe.length
  return { before: text.slice(0, at), match: text.slice(at, end), after: text.slice(end) }
}
