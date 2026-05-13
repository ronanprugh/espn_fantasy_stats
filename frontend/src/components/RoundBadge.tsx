import type { RoundLabel } from '../api'

const TEXT: Record<RoundLabel, string> = {
  regular: 'Regular',
  playoff: 'Playoff',
  semifinal: 'Semifinal',
  championship: 'Championship',
  consolation: 'Consolation',
}

export function RoundBadge({
  round,
  hideRegular = false,
}: {
  round: RoundLabel
  hideRegular?: boolean
}) {
  if (round === 'regular' && hideRegular) return null
  return <span className={`round-badge round-${round}`}>{TEXT[round]}</span>
}
