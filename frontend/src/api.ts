export type Owner = {
  id: string
  first_name: string
  last_name: string
}

export type Team = {
  team_id: number
  team_name: string
  abbrev: string
  owners: Owner[]
  wins: number
  losses: number
  ties: number
  points_for: number
  points_against: number
  final_standing: number
  standing: number
  scores: number[]
}

export type SeasonTeams = {
  league_id: number
  year: number
  teams: Team[]
}

export async function fetchConfig(): Promise<{ league_id: number }> {
  const r = await fetch('/api/config')
  if (!r.ok) throw new Error('Failed to fetch config')
  return r.json()
}

export async function fetchTeams(
  leagueId: number,
  year: number,
  refresh = false,
): Promise<SeasonTeams> {
  const url = `/api/leagues/${leagueId}/seasons/${year}/teams${refresh ? '?refresh=true' : ''}`
  const r = await fetch(url)
  if (!r.ok) throw new Error(`Failed to fetch teams: ${r.status}`)
  return r.json()
}
