import { useLeague } from '../contexts/LeagueContext'

/**
 * Your owner id in the selected league (the team you marked as yours on the
 * Leagues page), or null when none is set. Pages highlight it; with null they
 * look exactly as they would without it.
 */
export function useYourTeam(): string | null {
  const { selectedLeague } = useLeague()
  return selectedLeague?.favorite_owner_id ?? null
}

/** Whether an owner id is yours. Never true without a team set. */
export function isYours(yourTeam: string | null, ownerId: string | null | undefined): boolean {
  return !!yourTeam && ownerId === yourTeam
}
