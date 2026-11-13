import { NavLink } from 'react-router-dom'
import { useLeague } from '../contexts/LeagueContext'
import { useNavDestinations } from '../hooks/useNavDestinations'
import { TabIcon } from './TabIcons'

type Props = {
  onMoreClick: () => void
  moreOpen: boolean
}

/**
 * The mobile navigation surface: This Week · Standings · Scores · My Team,
 * plus a More trigger (see tabLayout).
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
  const { tabs } = useNavDestinations()
  const { selectedLeague } = useLeague()
  // My Team opens Team Hub on your team. With none set, Team Hub opens on its
  // picker, which asks which team is yours.
  const myTeam = selectedLeague?.favorite_owner_id
  const href = (path: string) =>
    path === '/team_hub' && myTeam ? `/team_hub?team=${encodeURIComponent(myTeam)}` : path

  return (
    <nav className="tab-bar" aria-label="Primary">
      {tabs.map((d) => (
        <NavLink
          key={d.path}
          to={href(d.path)}
          end={d.path === '/'}
          className="tab-bar-item"
          aria-label={d.tab?.ariaLabel}
          title={d.label}
        >
          <TabIcon name={d.tab!.icon} />
          <span className="tab-bar-label">{d.tab!.label}</span>
        </NavLink>
      ))}
      <button
        type="button"
        className={`tab-bar-item tab-bar-more${moreOpen ? ' active' : ''}`}
        onClick={onMoreClick}
        aria-expanded={moreOpen}
        aria-haspopup="dialog"
      >
        <TabIcon name="more" />
        <span className="tab-bar-label">More</span>
      </button>
    </nav>
  )
}
