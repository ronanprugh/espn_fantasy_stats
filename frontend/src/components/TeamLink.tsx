import type { MouseEvent, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { headToHeadHref, teamHubHref, type TeamHubTab } from '../lib/links'

/* Real links, so the keyboard, screen readers and "open in new tab" all work.
 * They look like the surrounding text until hovered or focused (.team-link in
 * styles.css), which keeps the tables calm.
 *
 * Clicks stop here rather than bubbling: several of these sit inside rows that
 * open a box score on click, and a team name should open the team instead. */
const stop = (e: MouseEvent) => e.stopPropagation()

/** A team or owner name that opens that team's Team Hub. Without an owner id
 * (not resolved yet, or unknown) it renders as plain text. */
export function TeamLink({
  ownerId,
  year,
  tab,
  className,
  children,
}: {
  ownerId: string | null | undefined
  /** The season, when the context is a single season. */
  year?: number | null
  tab?: TeamHubTab
  className?: string
  children: ReactNode
}) {
  if (!ownerId) return <span className={className}>{children}</span>
  return (
    <Link
      to={teamHubHref(ownerId, { year, tab })}
      className={`team-link${className ? ` ${className}` : ''}`}
      onClick={stop}
    >
      {children}
    </Link>
  )
}

/** An opponent's name that opens Head to Head between the two owners. */
export function H2HLink({
  ownerId,
  opponentId,
  className,
  title,
  children,
}: {
  ownerId: string | null | undefined
  opponentId: string | null | undefined
  className?: string
  title?: string
  children: ReactNode
}) {
  if (!ownerId || !opponentId || ownerId === opponentId) return <span className={className}>{children}</span>
  return (
    <Link
      to={headToHeadHref(ownerId, opponentId)}
      className={`team-link${className ? ` ${className}` : ''}`}
      title={title}
      onClick={stop}
    >
      {children}
    </Link>
  )
}
