import type { ReactNode } from 'react'
import type { TabIcon as TabIconName } from './navDestinations'

/**
 * The phone tab icons: small inline SVGs, stroked in the current text colour
 * so the active tab's accent applies to icon and label alike. Decorative —
 * the tab's label carries the name.
 */
const PATHS: Record<TabIconName | 'more', ReactNode> = {
  // A ranked list: rows getting shorter down the table.
  standings: (
    <>
      <path d="M8 6h12M8 12h9M8 18h6" />
      <path d="M4 6h.01M4 12h.01M4 18h.01" />
    </>
  ),
  // A scoreboard: two halves of a panel.
  scores: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M12 5v14M7 10v4M16 10h2v4h-2" />
    </>
  ),
  // A podium.
  rankings: <path d="M3 20h18M4 20v-6h5v6M9.5 20V8h5v12M15 20v-9h5v9" />,
  // Two arrows meeting.
  h2h: <path d="M4 8h12M12 4l4 4-4 4M20 16H8M12 12l-4 4 4 4" />,
  // A person.
  team: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-6 8-6s8 2 8 6" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.25" />
      <circle cx="12" cy="12" r="1.25" />
      <circle cx="19" cy="12" r="1.25" />
    </>
  ),
}

export function TabIcon({ name }: { name: TabIconName | 'more' }) {
  return (
    <svg
      className="tab-bar-icon"
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}
