import { useEffect, useRef } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { useLeague } from '../contexts/LeagueContext'
import { useTheme } from '../contexts/ThemeContext'
import { OVERFLOW_DESTINATIONS } from './navDestinations'

type Props = {
  open: boolean
  onClose: () => void
}

const FOCUSABLE = 'a[href], button:not([disabled]), select, input, [tabindex]:not([tabindex="-1"])'

/**
 * The overflow half of the mobile navigation: the five non-primary destinations
 * plus the theme toggle and Sign out.
 *
 * Those last two matter more than they look. The mobile shell hides `.sidebar`,
 * which holds the only other copy of them, so without this sheet they are
 * unreachable below 900px — the app would have no way to change theme or log
 * out on a phone.
 *
 * Per the resolved open question this is an overlay, not a route: no history
 * entry, so the back button still means "previous page" rather than "close the
 * sheet".
 */
export function MoreSheet({ open, onClose }: Props) {
  const { logout } = useAuth()
  const { leagues, selectedLeague, select } = useLeague()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()
  const panelRef = useRef<HTMLDivElement>(null)
  // Whatever had focus when the sheet opened — the More button in practice.
  // Captured rather than passed as a ref so the sheet owns its own restoration.
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  // Held in a ref so the effect below can depend on `open` alone. Depending on
  // `onClose` would re-run the whole open sequence — refocusing the first row
  // and re-capturing the restore target — on every parent render, since App
  // passes a fresh closure each time.
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    if (!open) return

    restoreFocusRef.current = document.activeElement as HTMLElement | null
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()

    // The page behind the sheet must not scroll under it. Restored on close
    // rather than cleared, so a future overlay that sets its own value is not
    // stomped on.
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    /**
     * Bound on `document`, not on the panel via `onKeyDown`.
     *
     * The panel-level version looked equivalent and was not: clicking any
     * non-focusable part of the sheet (the handle, the padding between rows)
     * moves focus to `<body>`, so the keydown never reached the panel and both
     * Esc and the focus trap silently stopped working. Listening on the document
     * makes them independent of where focus happens to sit.
     */
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return

      // Focus trap: a modal whose Tab order escapes into the page behind it
      // leaves keyboard users tabbing through content they cannot see.
      const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      const outside = !panelRef.current?.contains(active)
      if (outside) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
      } else if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      restoreFocusRef.current?.focus()
    }
  }, [open])

  if (!open) return null

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      {/* The backdrop closes the sheet; the panel must not, so its clicks stop
       * here rather than bubbling up to the backdrop handler. */}
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="More destinations"
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden />

        {/* The league selector also lives only in the sidebar, which the mobile
         * shell hides — without this copy, every stat page on a phone is stuck
         * on whichever league was last selected on a desktop. */}
        <div className="sheet-league">
          <label htmlFor="sheet-league-select">League</label>
          {leagues.length > 0 ? (
            <select
              id="sheet-league-select"
              value={selectedLeague?.espn_league_id ?? ''}
              onChange={(e) => select(Number(e.target.value))}
            >
              {leagues.map((l) => (
                <option key={l.id} value={l.espn_league_id}>
                  {l.display_name}
                </option>
              ))}
            </select>
          ) : (
            <NavLink to="/leagues" className="add-league-link">
              + Add a league
            </NavLink>
          )}
        </div>

        <nav className="sheet-nav" aria-label="More">
          {OVERFLOW_DESTINATIONS.map((d) => (
            <NavLink key={d.path} to={d.path} className="sheet-item">
              {d.label}
            </NavLink>
          ))}
        </nav>

        <div className="sheet-footer">
          <button type="button" className="sheet-item sheet-action" onClick={toggle}>
            <span>{theme === 'light' ? 'Dark mode' : 'Light mode'}</span>
            <span className="theme-icon" aria-hidden>
              {theme === 'light' ? '🌙' : '☀️'}
            </span>
          </button>
          <button type="button" className="sheet-item sheet-action sheet-logout" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
