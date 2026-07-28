import { NavLink } from 'react-router-dom'
import { PRIMARY_DESTINATIONS } from './navDestinations'

type Props = {
  onMoreClick: () => void
  moreOpen: boolean
}

/**
 * The mobile navigation surface: four primary destinations plus a More trigger.
 *
 * Always rendered — visibility is CSS-only, `display: none` above the 900px
 * breakpoint. There is deliberately no `matchMedia` check or resize listener:
 * a JS breakpoint would have to agree with the stylesheet's, and the two would
 * eventually disagree.
 *
 * `NavLink` rather than `<a href>` so the router owns both BASE_PATH resolution
 * and the active state.
 */
export function BottomTabBar({ onMoreClick, moreOpen }: Props) {
  return (
    <nav className="tab-bar" aria-label="Primary">
      {PRIMARY_DESTINATIONS.map((d) => (
        // `end` on "/" only — the index route otherwise matches every path and
        // Season Stats would read as active on all four tabs.
        <NavLink key={d.path} to={d.path} end={d.path === '/'} className="tab-bar-item">
          {d.label}
        </NavLink>
      ))}
      <button
        type="button"
        className={`tab-bar-item tab-bar-more${moreOpen ? ' active' : ''}`}
        onClick={onMoreClick}
        aria-expanded={moreOpen}
        aria-haspopup="dialog"
      >
        More
      </button>
    </nav>
  )
}
