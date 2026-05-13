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

export type PlayoffTeam = {
  team_id: number
  team_name: string
  owner_name: string
  seed: number
  final_standing: number
}

export type PlayoffMatchup = {
  week: number
  team_a_id: number
  team_b_id: number
  team_a_score: number
  team_b_score: number
  is_bye: boolean
  winner_id: number | null
}

export type SeasonPlayoffs = {
  league_id: number
  year: number
  playoff_team_count: number
  reg_season_count: number
  playoff_weeks: number[]
  teams: PlayoffTeam[]
  matchups: PlayoffMatchup[]
}

export async function fetchPlayoffs(
  leagueId: number,
  year: number,
  refresh = false,
): Promise<SeasonPlayoffs> {
  const url = `/api/leagues/${leagueId}/seasons/${year}/playoffs${refresh ? '?refresh=true' : ''}`
  const r = await fetch(url)
  if (!r.ok) throw new Error(`Failed to fetch playoffs: ${r.status}`)
  return r.json()
}

export type OwnerSeason = {
  year: number
  team_name: string
  seed: number
  final_standing: number
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

export type OwnerHistory = {
  owner_id: string
  owner_name: string
  current_team_name: string
  seasons: OwnerSeason[]
}

export type LeagueOwnerHistory = {
  league_id: number
  years: number[]
  owners: OwnerHistory[]
}

export async function fetchOwnerHistory(
  leagueId: number,
  refresh = false,
): Promise<LeagueOwnerHistory> {
  const url = `/api/leagues/${leagueId}/owner_history${refresh ? '?refresh=true' : ''}`
  const r = await fetch(url)
  if (!r.ok) throw new Error(`Failed to fetch owner history: ${r.status}`)
  return r.json()
}

export type HeadToHeadMatchup = {
  year: number
  week: number
  is_playoff: boolean
  owner_a_team_name: string
  owner_b_team_name: string
  owner_a_score: number
  owner_b_score: number
  winner_owner_id: string | null
}

export type HeadToHeadStats = {
  owner_a_id: string
  owner_b_id: string
  owner_a_name: string
  owner_b_name: string
  owner_a_team_name: string
  owner_b_team_name: string
  total_matchups: number
  owner_a_wins: number
  owner_b_wins: number
  ties: number
  owner_a_total_pf: number
  owner_b_total_pf: number
  owner_a_avg_pf: number
  owner_b_avg_pf: number
  playoff_matchups: number
  owner_a_playoff_wins: number
  owner_b_playoff_wins: number
  playoff_ties: number
  matchups: HeadToHeadMatchup[]
}

export async function fetchHeadToHead(
  leagueId: number,
  ownerA: string,
  ownerB: string,
): Promise<HeadToHeadStats> {
  const params = new URLSearchParams({ owner_a: ownerA, owner_b: ownerB })
  const r = await fetch(`/api/leagues/${leagueId}/head_to_head?${params}`)
  if (!r.ok) throw new Error(`Failed to fetch head-to-head: ${r.status}`)
  return r.json()
}
