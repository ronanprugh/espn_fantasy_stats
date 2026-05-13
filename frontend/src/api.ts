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
  playoff_wins: number
  playoff_losses: number
  points_for: number
  points_against: number
  avg_points_for: number
  avg_points_against: number
  avg_plus_minus: number
  final_standing: number
  standing: number
  scores: number[]
}

export type SeasonTeams = {
  league_id: number
  year: number
  teams: Team[]
}

export type Config = {
  league_id: number
  years: number[]
}

export type OwnerAggregate = {
  owner_id: string
  owner_name: string
  team_names: string[]
  seasons_played: number
  avg_finish: number
  wins: number
  losses: number
  ties: number
  playoff_wins: number
  playoff_losses: number
  points_for: number
  points_against: number
  avg_points_for: number
  avg_points_against: number
  avg_plus_minus: number
}

export type LeagueAggregate = {
  league_id: number
  start_year: number
  end_year: number
  years: number[]
  owners: OwnerAggregate[]
}

export async function fetchConfig(): Promise<Config> {
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

export async function fetchAggregate(
  leagueId: number,
  refresh = false,
): Promise<LeagueAggregate> {
  const url = `/api/leagues/${leagueId}/aggregate${refresh ? '?refresh=true' : ''}`
  const r = await fetch(url)
  if (!r.ok) throw new Error(`Failed to fetch aggregate: ${r.status}`)
  return r.json()
}
