/**
 * A team's power rank, as a small chip beside its name. Assumed ranks (carried
 * over from another week because none were posted) get a dashed outline and
 * say so on hover, so they're never read as something the writer posted.
 */
export function PrBadge({
  rank,
  assumed = false,
  sourceWeek,
  className = '',
}: {
  rank: number
  assumed?: boolean
  sourceWeek?: number
  className?: string
}) {
  const title = assumed
    ? `Power rank #${rank}, carried over from Week ${sourceWeek ?? '?'}: no rankings were posted this week`
    : `Power rank #${rank}`
  return (
    <span className={`pr-badge${assumed ? ' assumed' : ''}${rank === 1 ? ' top' : ''} ${className}`} title={title}>
      #{rank}
      {assumed && <span className="pr-badge-mark" aria-hidden="true">*</span>}
    </span>
  )
}
