import { Fragment } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { useLeague } from '../contexts/LeagueContext'
import { useNavDestinations } from '../hooks/useNavDestinations'
import { NAV_GROUPS, SETTINGS_DESTINATIONS, destinationFor } from './navDestinations'
import { UserMenu } from './UserMenu'

type Props = {
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ collapsed, onToggle }: Props) {
  const { leagues, selectedLeague, select } = useLeague()
  const { destinations } = useNavDestinations()
  const { pathname } = useLocation()
  // Where you are, for the collapsed sidebar: "This Season · Standings".
  const current = destinationFor(pathname)
  const setting = SETTINGS_DESTINATIONS.find((d) => d.path === pathname)
  const here = current
    ? current.group
      ? `${current.group} · ${current.label}`
      : current.label
    : setting
      ? `Settings · ${setting.label}`
      : null

  return (
    <aside className="sidebar">
      <button
        className="sidebar-collapse-btn"
        onClick={onToggle}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? '›' : '‹'}
      </button>

      {/* Collapsed, the sidebar is a 36px strip: it shows where you are, read
       * bottom to top, and expands on click like the button above. */}
      {collapsed && here && (
        <button
          type="button"
          className="sidebar-collapsed-here"
          onClick={onToggle}
          aria-label={`Expand sidebar (${here})`}
          title="Expand sidebar"
        >
          {here}
        </button>
      )}

      <div className="sidebar-scrollable">
        <div className="brand">ESPN Fantasy Stats</div>

        <div className="sidebar-league">
          <label htmlFor="sidebar-league-select">League</label>
          {leagues.length > 0 ? (
            <select
              id="sidebar-league-select"
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

        {/* Rendered from NAV_DESTINATIONS rather than literal JSX so the
         * sidebar and the mobile tab bar cannot drift apart: a destination
         * added in one place appears in both. */}
        <nav className="sidebar-nav">
          {/* This Week sits above the groups. `end`, so it isn't marked as
            * current on every page under /. */}
          {destinations
            .filter((d) => d.group === null)
            .map((d) => (
              <NavLink key={d.path} to={d.path} end className="nav-top">
                {d.label}
              </NavLink>
            ))}
          {NAV_GROUPS.map((group) => (
            <Fragment key={group}>
              <div className="nav-section">{group}</div>
              {destinations
                .filter((d) => d.group === group)
                .map((d) => (
                  <NavLink key={d.path} to={d.path}>
                    {d.label}
                  </NavLink>
                ))}
            </Fragment>
          ))}
        </nav>
      </div>

      <div className="sidebar-footer">
        <UserMenu />
      </div>
    </aside>
  )
}
