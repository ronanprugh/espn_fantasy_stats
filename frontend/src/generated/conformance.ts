/**
 * Compile-time check that the hand-written response types in api.ts agree
 * with the backend's schema (schema.gen.ts, generated from the OpenAPI
 * document by `npm run gen:api`).
 *
 * api.ts keeps its own types: they carry documentation and narrower types
 * the frontend relies on (`'regular' | 'playoff' | …` where the schema says
 * `string`), and they may mark a field optional on purpose: the frontend
 * (Vercel) and backend (Render) deploy separately, so for a few minutes a
 * new frontend can talk to an old backend. So each api.ts type must fit the
 * schema with every field treated as optional, and name no field the
 * backend doesn't have: a field renamed or removed on the backend, or whose
 * type changed, fails `tsc` (and CI) until api.ts follows. A new backend
 * field the frontend doesn't use yet is fine.
 *
 * Maintained by hand: when api.ts gains a response type, add its check here.
 */
import type * as api from '../api'
import type { components } from './schema.gen'

type S = components['schemas']

/** G with every field, at every depth, optional. */
type DeepPartial<T> = T extends readonly (infer U)[]
  ? DeepPartial<U>[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T

/** H fits G (fields optional), and every field H names is one G has. */
type Conforms<H, G> = [H] extends [DeepPartial<G>] ? ([Exclude<keyof H, keyof G>] extends [never] ? true : false) : false
type Assert<T extends true> = T

export type CheckAllSeasons = Assert<Conforms<api.AllSeasons, S['AllSeasons']>>
export type CheckBoxPlayer = Assert<Conforms<api.BoxPlayer, S['BoxPlayer']>>
export type CheckBoxScoreMatchup = Assert<Conforms<api.BoxScoreMatchup, S['BoxScoreMatchup']>>
export type CheckBoxScoreTeam = Assert<Conforms<api.BoxScoreTeam, S['BoxScoreTeam']>>
export type CheckCloseGameRecord = Assert<Conforms<api.CloseGameRecord, S['CloseGameRecord']>>
export type CheckCloseGames = Assert<Conforms<api.CloseGames, S['CloseGames']>>
export type CheckHeadToHeadMatchup = Assert<Conforms<api.HeadToHeadMatchup, S['HeadToHeadMatchup']>>
export type CheckHeadToHeadStats = Assert<Conforms<api.HeadToHeadStats, S['HeadToHeadStats']>>
export type CheckLeagueAggregate = Assert<Conforms<api.LeagueAggregate, S['LeagueAggregate']>>
export type CheckLeagueInfo = Assert<Conforms<api.LeagueInfo, S['LeagueInfo']>>
export type CheckLeagueOwnerHistory = Assert<Conforms<api.LeagueOwnerHistory, S['LeagueOwnerHistory']>>
export type CheckLeaguePositionalAggregate = Assert<Conforms<api.LeaguePositionalAggregate, S['LeaguePositionalAggregate']>>
export type CheckLeagueSummary = Assert<Conforms<api.LeagueSummary, S['LeagueSummary']>>
export type CheckMove = Assert<Conforms<api.Move, S['Move']>>
export type CheckOwner = Assert<Conforms<api.Owner, S['Owner']>>
export type CheckOwnerAggregate = Assert<Conforms<api.OwnerAggregate, S['OwnerAggregate']>>
export type CheckOwnerHistory = Assert<Conforms<api.OwnerHistory, S['OwnerHistory']>>
// The pr_* fields are the frontend's own: Trends fills them in from the
// power rankings (see OwnerSeason in api.ts).
export type CheckOwnerSeason = Assert<
  Conforms<Omit<api.OwnerSeason, 'pr_avg' | 'pr_preseason' | 'pr_final' | 'pr_weeks_at_1'>, S['OwnerSeason']>
>
export type CheckPlayoffMatchup = Assert<Conforms<api.PlayoffMatchup, S['PlayoffMatchup']>>
export type CheckPlayoffTeam = Assert<Conforms<api.PlayoffTeam, S['PlayoffTeam']>>
export type CheckPositionAggregate = Assert<Conforms<api.PositionAggregate, S['PositionAggregate']>>
export type CheckPositionOwnerAggregate = Assert<Conforms<api.PositionOwnerAggregate, S['PositionOwnerAggregate']>>
export type CheckPositionTeamStats = Assert<Conforms<api.PositionTeamStats, S['PositionTeamStats']>>
export type CheckPowerRankingEntry = Assert<Conforms<api.PowerRankingEntry, S['PowerRankingEntry']>>
export type CheckPowerRankingPostSummary = Assert<Conforms<api.PowerRankingPostSummary, S['PowerRankingPostSummary']>>
export type CheckPowerRankingSeason = Assert<Conforms<api.PowerRankingSeason, S['PowerRankingSeason']>>
export type CheckPowerRankingTeam = Assert<Conforms<api.PowerRankingTeam, S['PowerRankingTeam']>>
export type CheckPowerRankingWeek = Assert<Conforms<api.PowerRankingWeek, S['PowerRankingWeek']>>
export type CheckPowerRankings = Assert<Conforms<api.PowerRankings, S['PowerRankings']>>
export type CheckRecordEntry = Assert<Conforms<api.RecordEntry, S['RecordEntry']>>
export type CheckRivalry = Assert<Conforms<api.Rivalry, S['Rivalry']>>
export type CheckRivalryLastMeeting = Assert<Conforms<api.RivalryLastMeeting, S['RivalryLastMeeting']>>
export type CheckRivalrySummary = Assert<Conforms<api.RivalrySummary, S['RivalrySummary']>>
export type CheckRosterPlayer = Assert<Conforms<api.RosterPlayer, S['RosterPlayer']>>
export type CheckRosterSnapshot = Assert<Conforms<api.RosterSnapshot, S['RosterSnapshot']>>
export type CheckScoreboardMatchup = Assert<Conforms<api.ScoreboardMatchup, S['ScoreboardMatchup']>>
export type CheckSeasonMoves = Assert<Conforms<api.SeasonMoves, S['SeasonMoves']>>
export type CheckSeasonPlayoffs = Assert<Conforms<api.SeasonPlayoffs, S['SeasonPlayoffs']>>
export type CheckSeasonPositionStats = Assert<Conforms<api.SeasonPositionStats, S['SeasonPositionStats']>>
export type CheckSeasonPositionalStats = Assert<Conforms<api.SeasonPositionalStats, S['SeasonPositionalStats']>>
export type CheckSeasonRosters = Assert<Conforms<api.SeasonRosters, S['SeasonRosters']>>
export type CheckSeasonScoreboard = Assert<Conforms<api.SeasonScoreboard, S['SeasonScoreboard']>>
export type CheckSeasonTeams = Assert<Conforms<api.SeasonTeams, S['SeasonTeams']>>
export type CheckSeasonTrades = Assert<Conforms<api.SeasonTrades, S['SeasonTrades']>>
export type CheckTeam = Assert<Conforms<api.Team, S['Team']>>
export type CheckTeamHub = Assert<Conforms<api.TeamHub, S['TeamHub']>>
export type CheckTeamHubAccolades = Assert<Conforms<api.TeamHubAccolades, S['TeamHubAccolades']>>
export type CheckTeamHubGame = Assert<Conforms<api.TeamHubGame, S['TeamHubGame']>>
export type CheckTeamHubLastMatchup = Assert<Conforms<api.TeamHubLastMatchup, S['TeamHubLastMatchup']>>
export type CheckTeamHubPlayer = Assert<Conforms<api.TeamHubPlayer, S['TeamHubPlayer']>>
export type CheckTeamHubRecords = Assert<Conforms<api.TeamHubRecords, S['TeamHubRecords']>>
export type CheckTrade = Assert<Conforms<api.Trade, S['Trade']>>
export type CheckTradePlayer = Assert<Conforms<api.TradePlayer, S['TradePlayer']>>
export type CheckTradeSide = Assert<Conforms<api.TradeSide, S['TradeSide']>>
export type CheckWeekBoxScores = Assert<Conforms<api.WeekBoxScores, S['WeekBoxScores']>>
