// All fetches use credentials:'include' so the session cookie is sent.
const baseFetch = (input: RequestInfo, init: RequestInit = {}) =>
  fetch(input, { ...init, credentials: 'include' })

async function jsonFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const r = await baseFetch(url, init)
  if (!r.ok) {
    const body = await r.json().catch(() => ({}))
    const message = body.detail ?? `HTTP ${r.status}`
    const err = new Error(message) as Error & { status: number }
    err.status = r.status
    throw err
  }
  return r.json()
}

// --------------------------------------------------------------------- //
// Auth
// --------------------------------------------------------------------- //

export type AuthUser = { id: number; username: string }

export async function fetchAuthMe(): Promise<AuthUser> {
  return jsonFetch<AuthUser>('/api/auth/me')
}

export async function login(username: string, password: string): Promise<AuthUser> {
  return jsonFetch<AuthUser>('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
}

export async function logout(): Promise<void> {
  await jsonFetch('/api/auth/logout', { method: 'POST' })
}

// --------------------------------------------------------------------- //
// League management (per-user)
// --------------------------------------------------------------------- //

export type LeagueSummary = {
  id: number
  espn_league_id: number
  display_name: string
}

export type LeagueInfo = {
  espn_league_id: number
  display_name: string
  years: number[]
}

export async function fetchMyLeagues(): Promise<LeagueSummary[]> {
  return jsonFetch<LeagueSummary[]>('/api/me/leagues')
}

export async function createLeague(payload: {
  espn_league_id: number
  display_name: string
  espn_s2?: string
  swid?: string
}): Promise<LeagueSummary> {
  return jsonFetch<LeagueSummary>('/api/me/leagues', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export async function deleteLeague(id: number): Promise<void> {
  await jsonFetch(`/api/me/leagues/${id}`, { method: 'DELETE' })
}

export async function fetchLeagueInfo(espnLeagueId: number): Promise<LeagueInfo> {
  return jsonFetch<LeagueInfo>(`/api/leagues/${espnLeagueId}/info`)
}

// --------------------------------------------------------------------- //
// ESPN data — all scoped to a user-owned ESPN league_id
// --------------------------------------------------------------------- //

export type Owner = { id: string; first_name: string; last_name: string }

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

export async function fetchTeams(
  leagueId: number,
  year: number,
  refresh = false,
): Promise<SeasonTeams> {
  const url = `/api/leagues/${leagueId}/seasons/${year}/teams${refresh ? '?refresh=true' : ''}`
  return jsonFetch<SeasonTeams>(url)
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

export async function fetchAggregate(
  leagueId: number,
  refresh = false,
): Promise<LeagueAggregate> {
  const url = `/api/leagues/${leagueId}/aggregate${refresh ? '?refresh=true' : ''}`
  return jsonFetch<LeagueAggregate>(url)
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
  return jsonFetch<SeasonPlayoffs>(url)
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
  return jsonFetch<LeagueOwnerHistory>(url)
}

export type RoundLabel =
  | 'regular'
  | 'playoff'
  | 'semifinal'
  | 'championship'
  | 'consolation'

export type ScoreboardMatchup = {
  week: number
  is_playoff: boolean
  round_label: RoundLabel
  is_bye: boolean
  team_a_id: number
  team_a_name: string
  team_a_owner: string
  team_a_score: number
  team_b_id: number
  team_b_name: string
  team_b_owner: string
  team_b_score: number
  winner_id: number | null
}

export type SeasonScoreboard = {
  league_id: number
  year: number
  weeks: number[]
  matchups: ScoreboardMatchup[]
}

export async function fetchScoreboard(
  leagueId: number,
  year: number,
  refresh = false,
): Promise<SeasonScoreboard> {
  const url = `/api/leagues/${leagueId}/seasons/${year}/scoreboard${refresh ? '?refresh=true' : ''}`
  return jsonFetch<SeasonScoreboard>(url)
}

export type BoxPlayer = {
  name: string
  player_id: number
  position: string
  slot_position: string
  pro_team: string
  points: number
  projected_points: number
}

export type BoxScoreTeam = {
  team_id: number
  team_name: string
  owner_name: string
  total_points: number
  projected_points: number
  lineup: BoxPlayer[]
}

export type BoxScoreMatchup = {
  week: number
  is_playoff: boolean
  matchup_type: string
  home: BoxScoreTeam | null
  away: BoxScoreTeam | null
}

export type WeekBoxScores = {
  league_id: number
  year: number
  week: number
  matchups: BoxScoreMatchup[]
}

export async function fetchBoxScores(
  leagueId: number,
  year: number,
  week: number,
  refresh = false,
): Promise<WeekBoxScores> {
  const url = `/api/leagues/${leagueId}/seasons/${year}/weeks/${week}/box_scores${refresh ? '?refresh=true' : ''}`
  return jsonFetch<WeekBoxScores>(url)
}

export type HeadToHeadMatchup = {
  year: number
  week: number
  is_playoff: boolean
  round_label: RoundLabel
  owner_a_team_id: number
  owner_b_team_id: number
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
  return jsonFetch<HeadToHeadStats>(`/api/leagues/${leagueId}/head_to_head?${params}`)
}
