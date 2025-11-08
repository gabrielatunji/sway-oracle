import { z } from "zod";
import { DynamicStructuredTool } from "@langchain/core/tools";
import {
  fetchApiFootballStats,
  fetchBbcStats,
  fetchBettingAggregatorStats,
  fetchEspnStats,
  fetchFlashScoreStats,
  fetchFotmobStats,
  fetchGoogleNewsStats,
  fetchNewsApiStats,
  fetchOfficialMatchStats,
  fetchOfficialTeamStats,
  fetchOptaStats,
  fetchSofascoreStats,
  fetchSportsOddsSettlement,
  fetchSportsRadarStats,
  fetchStatsBombStats,
  fetchTransfermarktStats,
  fetchTwitterStats,
  fetchUnderstatStats,
  fetchWhoScoredStats,
  StatisticsFetchParams
} from "./providers";
import { STATISTIC_TYPES, StatisticProviderResponse, StatisticsQuery } from "./types";

const StatisticTypeEnum = z.enum(STATISTIC_TYPES);

const StatisticsToolSchema = z.object({
  statisticType: StatisticTypeEnum,
  matchId: z.string().optional(),
  homeTeam: z.string().optional(),
  awayTeam: z.string().optional(),
  date: z.string().optional(),
  competition: z.string().optional(),
  team: z.string().optional(),
  player: z.string().optional(),
  period: z.string().optional()
});

type ToolInput = z.infer<typeof StatisticsToolSchema>;

type StatisticsFetcher = (input: ToolInput) => Promise<StatisticProviderResponse | null>;

type ToolFactoryOptions = {
  name: string;
  description: string;
  fetcher: StatisticsFetcher;
};

function toFetchParams(input: ToolInput): StatisticsFetchParams {
  return {
    statisticType: input.statisticType,
    match: {
      matchId: input.matchId,
      homeTeam: input.homeTeam,
      awayTeam: input.awayTeam,
      date: input.date ? new Date(input.date) : undefined,
      competition: input.competition
    },
    team: input.team,
    player: input.player,
    period: input.period
  } satisfies StatisticsFetchParams;
}

function createStatisticsTool({ name, description, fetcher }: ToolFactoryOptions) {
  return new DynamicStructuredTool({
    name,
    description,
    schema: StatisticsToolSchema,
    func: async (input: ToolInput) => {
      const params = toFetchParams(input);
      const result = await fetcher(params);
      if (!result) {
        return { provider: name, skipped: true, reason: "Provider not configured in environment." };
      }
      return result;
    }
  });
}

export const FetchOfficialMatchStatsTool = createStatisticsTool({
  name: "fetch_official_match_stats",
  description: "Query official league or competition APIs for comprehensive match statistics.",
  fetcher: fetchOfficialMatchStats
});

export const FetchOptaStatsTool = createStatisticsTool({
  name: "fetch_opta_stats",
  description: "Query Opta Stats for industry-leading detailed match statistics.",
  fetcher: fetchOptaStats
});

export const FetchStatsBombTool = createStatisticsTool({
  name: "fetch_statsbomb_stats",
  description: "Retrieve advanced statistics from StatsBomb.",
  fetcher: fetchStatsBombStats
});

export const FetchSportsRadarTool = createStatisticsTool({
  name: "fetch_sportsradar_stats",
  description: "Retrieve comprehensive match statistics from SportsRadar.",
  fetcher: fetchSportsRadarStats
});

export const FetchOddsSettlementTool = createStatisticsTool({
  name: "check_stats_market_settlement",
  description: "Check statistics-based betting market settlements for validation.",
  fetcher: fetchSportsOddsSettlement
});

export const FetchApiFootballTool = createStatisticsTool({
  name: "fetch_api_football_stats",
  description: "Retrieve detailed soccer statistics from API-FOOTBALL.",
  fetcher: fetchApiFootballStats
});

export const FetchFlashScoreTool = createStatisticsTool({
  name: "fetch_flashscore_stats",
  description: "Fetch real-time match statistics from FlashScore.",
  fetcher: fetchFlashScoreStats
});

export const FetchSofascoreTool = createStatisticsTool({
  name: "fetch_sofascore_stats",
  description: "Fetch comprehensive match statistics from Sofascore.",
  fetcher: fetchSofascoreStats
});

export const FetchFotmobTool = createStatisticsTool({
  name: "fetch_fotmob_stats",
  description: "Fetch detailed match statistics from FotMob.",
  fetcher: fetchFotmobStats
});

export const FetchOfficialTeamTool = createStatisticsTool({
  name: "fetch_official_team_stats",
  description: "Retrieve statistics from official team match reports.",
  fetcher: fetchOfficialTeamStats
});

export const FetchEspnTool = createStatisticsTool({
  name: "fetch_espn_stats",
  description: "Fetch ESPN match center statistics for cross-validation.",
  fetcher: fetchEspnStats
});

export const FetchBbcTool = createStatisticsTool({
  name: "fetch_bbc_stats",
  description: "Fetch BBC Sport match statistics for cross-validation.",
  fetcher: fetchBbcStats
});

export const FetchGoogleNewsTool = createStatisticsTool({
  name: "search_match_reports",
  description: "Search Google News for match reports that mention statistics.",
  fetcher: fetchGoogleNewsStats
});

export const FetchNewsApiTool = createStatisticsTool({
  name: "fetch_newsapi_stats",
  description: "Pull match reports with statistics mentions from NewsAPI.",
  fetcher: fetchNewsApiStats
});

export const FetchTwitterTool = createStatisticsTool({
  name: "fetch_twitter_stats",
  description: "Fetch official league or team statistics posts from X/Twitter.",
  fetcher: fetchTwitterStats
});

export const FetchBettingAggregatorTool = createStatisticsTool({
  name: "fetch_betting_aggregator_stats",
  description: "Retrieve statistics-based betting market settlements from aggregators.",
  fetcher: fetchBettingAggregatorStats
});

export const FetchUnderstatTool = createStatisticsTool({
  name: "fetch_understat_stats",
  description: "Fetch advanced soccer metrics from Understat.",
  fetcher: fetchUnderstatStats
});

export const FetchWhoScoredTool = createStatisticsTool({
  name: "fetch_whoscored_stats",
  description: "Fetch match statistics and player ratings from WhoScored.",
  fetcher: fetchWhoScoredStats
});

export const FetchTransfermarktTool = createStatisticsTool({
  name: "fetch_transfermarkt_stats",
  description: "Fetch archived match statistics from TransferMarkt.",
  fetcher: fetchTransfermarktStats
});

export const StatisticsTools = [
  FetchOfficialMatchStatsTool,
  FetchOptaStatsTool,
  FetchStatsBombTool,
  FetchSportsRadarTool,
  FetchOddsSettlementTool,
  FetchApiFootballTool,
  FetchFlashScoreTool,
  FetchSofascoreTool,
  FetchFotmobTool,
  FetchOfficialTeamTool,
  FetchEspnTool,
  FetchBbcTool,
  FetchGoogleNewsTool,
  FetchNewsApiTool,
  FetchTwitterTool,
  FetchBettingAggregatorTool,
  FetchUnderstatTool,
  FetchWhoScoredTool,
  FetchTransfermarktTool
];

export type StatisticsTool = (typeof StatisticsTools)[number];

export function buildToolInputsFromQuery(query: StatisticsQuery): ToolInput {
  return {
    statisticType: query.statisticType,
    matchId: query.entities.match?.matchId,
    homeTeam: query.entities.match?.homeTeam,
    awayTeam: query.entities.match?.awayTeam,
    date: query.entities.match?.date?.toISOString(),
    competition: query.entities.match?.competition,
    team: query.entities.team,
    player: query.entities.player,
    period: query.period
  } satisfies ToolInput;
}
