import { AxiosRequestConfig } from "axios";
import { fetchJson, RetryOptions } from "../utils";
import { StatisticProviderResponse, StatisticType, StatisticUnit } from "./types";

export interface StatisticsFetchParams {
  statisticType: StatisticType;
  match?: {
    matchId?: string;
    homeTeam?: string;
    awayTeam?: string;
    date?: Date;
    competition?: string;
  };
  team?: string;
  player?: string;
  period?: string;
}

interface ProviderConfig {
  provider: string;
  tier: 1 | 2 | 3 | 4;
  baseUrlEnv: string;
  apiKeyEnv?: string;
  weight: number;
  retry?: RetryOptions;
  composeUrl: (baseUrl: string, params: StatisticsFetchParams) => string;
  buildHeaders?: (apiKey: string | undefined) => Record<string, string>;
}

const TIER_WEIGHTS: Record<number, number> = {
  1: 0.45,
  2: 0.3,
  3: 0.25,
  4: 0.15
};

const providerConfigs: Record<string, ProviderConfig> = {
  official_match_stats: {
    provider: "OFFICIAL_LEAGUE_API",
    tier: 1,
    baseUrlEnv: "OFFICIAL_STATS_BASE_URL",
    apiKeyEnv: "OFFICIAL_STATS_API_KEY",
    weight: TIER_WEIGHTS[1],
    composeUrl: buildDefaultPath("/match-stats")
  },
  opta_stats: {
    provider: "OPTA_STATS",
    tier: 1,
    baseUrlEnv: "OPTA_STATS_BASE_URL",
    apiKeyEnv: "OPTA_STATS_API_KEY",
    weight: TIER_WEIGHTS[1],
    composeUrl: buildDefaultPath("/fixtures/statistics")
  },
  statsbomb_stats: {
    provider: "STATSBOMB",
    tier: 1,
    baseUrlEnv: "STATSBOMB_BASE_URL",
    apiKeyEnv: "STATSBOMB_API_KEY",
    weight: TIER_WEIGHTS[1],
    composeUrl: buildDefaultPath("/matches/statistics")
  },
  sportsradar_stats: {
    provider: "SPORTSRADAR",
    tier: 1,
    baseUrlEnv: "SPORTSRADAR_BASE_URL",
    apiKeyEnv: "SPORTSRADAR_API_KEY",
    weight: TIER_WEIGHTS[1],
    composeUrl: buildDefaultPath("/statistics")
  },
  oddsapi_stats: {
    provider: "THE_ODDS_API",
    tier: 1,
    baseUrlEnv: "THEODDS_STATS_BASE_URL",
    apiKeyEnv: "THEODDS_API_KEY",
    weight: TIER_WEIGHTS[1],
    composeUrl: buildDefaultPath("/settlements"),
    retry: { retries: 3, initialDelayMs: 250 }
  },
  api_football_stats: {
    provider: "API_FOOTBALL",
    tier: 2,
    baseUrlEnv: "APIFOOTBALL_STATS_BASE_URL",
    apiKeyEnv: "APISPORTS_KEY",
    weight: TIER_WEIGHTS[2],
    composeUrl: buildDefaultPath("/fixtures/statistics"),
    buildHeaders: (apiKey) => ({ "x-apisports-key": apiKey ?? "" })
  },
  flashscore_stats: {
    provider: "FLASHSCORE",
    tier: 2,
    baseUrlEnv: "FLASHSCORE_BASE_URL",
    weight: TIER_WEIGHTS[2],
    composeUrl: buildDefaultPath("/match/statistics")
  },
  sofascore_stats: {
    provider: "SOFASCORE",
    tier: 2,
    baseUrlEnv: "SOFASCORE_BASE_URL",
    weight: TIER_WEIGHTS[2],
    composeUrl: buildDefaultPath("/match/statistics")
  },
  fotmob_stats: {
    provider: "FOTMOB",
    tier: 2,
    baseUrlEnv: "FOTMOB_BASE_URL",
    weight: TIER_WEIGHTS[2],
    composeUrl: buildDefaultPath("/match/statistics")
  },
  official_team_stats: {
    provider: "OFFICIAL_TEAM",
    tier: 2,
    baseUrlEnv: "TEAM_REPORTS_BASE_URL",
    weight: TIER_WEIGHTS[2],
    composeUrl: buildDefaultPath("/reports")
  },
  espn_stats: {
    provider: "ESPN",
    tier: 3,
    baseUrlEnv: "ESPN_API_BASE_URL",
    weight: TIER_WEIGHTS[3],
    composeUrl: buildDefaultPath("/matchcenter/statistics")
  },
  bbc_stats: {
    provider: "BBC",
    tier: 3,
    baseUrlEnv: "BBC_SPORT_API_BASE_URL",
    weight: TIER_WEIGHTS[3],
    composeUrl: buildDefaultPath("/sport/statistics")
  },
  google_news_stats: {
    provider: "GOOGLE_NEWS",
    tier: 3,
    baseUrlEnv: "GOOGLE_NEWS_API_BASE_URL",
    apiKeyEnv: "GOOGLE_NEWS_API_KEY",
    weight: TIER_WEIGHTS[3],
    composeUrl: buildDefaultPath("/search"),
    retry: { retries: 2, initialDelayMs: 500 }
  },
  newsapi_stats: {
    provider: "NEWS_API",
    tier: 3,
    baseUrlEnv: "NEWS_API_BASE_URL",
    apiKeyEnv: "NEWS_API_KEY",
    weight: TIER_WEIGHTS[3],
    composeUrl: buildDefaultPath("/everything")
  },
  twitter_stats: {
    provider: "TWITTER",
    tier: 3,
    baseUrlEnv: "X_TWITTER_API_BASE_URL",
    apiKeyEnv: "X_TWITTER_BEARER",
    weight: TIER_WEIGHTS[3],
    composeUrl: buildDefaultPath("/tweets")
  },
  betting_aggregator_stats: {
    provider: "BETTING_AGGREGATOR",
    tier: 4,
    baseUrlEnv: "BETTING_AGGREGATOR_BASE_URL",
    weight: TIER_WEIGHTS[4],
    composeUrl: buildDefaultPath("/settlements")
  },
  understat_stats: {
    provider: "UNDERSTAT",
    tier: 4,
    baseUrlEnv: "UNDERSTAT_BASE_URL",
    weight: TIER_WEIGHTS[4],
    composeUrl: buildDefaultPath("/match"),
    retry: { retries: 3, initialDelayMs: 400 }
  },
  whoscored_stats: {
    provider: "WHOSCORED",
    tier: 4,
    baseUrlEnv: "WHOSCORED_BASE_URL",
    weight: TIER_WEIGHTS[4],
    composeUrl: buildDefaultPath("/match-statistics")
  },
  transfermarkt_stats: {
    provider: "TRANSFERMARKT",
    tier: 4,
    baseUrlEnv: "TRANSFERMARKT_BASE_URL",
    weight: TIER_WEIGHTS[4],
    composeUrl: buildDefaultPath("/matches/statistics")
  }
};

function buildDefaultPath(defaultPath: string): (baseUrl: string, params: StatisticsFetchParams) => string {
  return (baseUrl, params) => {
    const trimmedBase = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
    const path = defaultPath.startsWith("/") ? defaultPath : `/${defaultPath}`;
    const query = buildQueryString(params);
    return query.length > 0 ? `${trimmedBase}${path}?${query}` : `${trimmedBase}${path}`;
  };
}

function buildQueryString(params: StatisticsFetchParams): string {
  const search = new URLSearchParams();
  search.append("statistic", params.statisticType);
  if (params.match?.matchId) search.append("matchId", params.match.matchId);
  if (params.match?.homeTeam) search.append("homeTeam", params.match.homeTeam);
  if (params.match?.awayTeam) search.append("awayTeam", params.match.awayTeam);
  if (params.match?.date) search.append("date", params.match.date.toISOString());
  if (params.match?.competition) search.append("competition", params.match.competition);
  if (params.team) search.append("team", params.team);
  if (params.player) search.append("player", params.player);
  if (params.period) search.append("period", params.period);
  return search.toString();
}

async function fetchProvider(key: keyof typeof providerConfigs, params: StatisticsFetchParams): Promise<StatisticProviderResponse | null> {
  const config = providerConfigs[key];
  const baseUrl = process.env[config.baseUrlEnv];
  if (!baseUrl) {
    return null;
  }

  const apiKey = config.apiKeyEnv ? process.env[config.apiKeyEnv] : undefined;
  const url = config.composeUrl(baseUrl, params);

  let headers: Record<string, string> | undefined;
  if (config.buildHeaders) {
    headers = config.buildHeaders(apiKey);
  } else if (apiKey) {
    headers = { Authorization: `Bearer ${apiKey}` };
  }

  const axiosConfig: AxiosRequestConfig = headers ? { headers } : {};

  const payload = await fetchJson(url, axiosConfig, config.retry);

  return {
    provider: config.provider,
    tier: config.tier,
    weight: config.weight,
    collectedAt: new Date(),
    payload,
    meta: {
      url,
      params
    }
  } satisfies StatisticProviderResponse;
}

export async function fetchOfficialMatchStats(params: StatisticsFetchParams): Promise<StatisticProviderResponse | null> {
  return fetchProvider("official_match_stats", params);
}

export async function fetchOptaStats(params: StatisticsFetchParams): Promise<StatisticProviderResponse | null> {
  return fetchProvider("opta_stats", params);
}

export async function fetchStatsBombStats(params: StatisticsFetchParams): Promise<StatisticProviderResponse | null> {
  return fetchProvider("statsbomb_stats", params);
}

export async function fetchSportsRadarStats(params: StatisticsFetchParams): Promise<StatisticProviderResponse | null> {
  return fetchProvider("sportsradar_stats", params);
}

export async function fetchSportsOddsSettlement(params: StatisticsFetchParams): Promise<StatisticProviderResponse | null> {
  return fetchProvider("oddsapi_stats", params);
}

export async function fetchApiFootballStats(params: StatisticsFetchParams): Promise<StatisticProviderResponse | null> {
  return fetchProvider("api_football_stats", params);
}

export async function fetchFlashScoreStats(params: StatisticsFetchParams): Promise<StatisticProviderResponse | null> {
  return fetchProvider("flashscore_stats", params);
}

export async function fetchSofascoreStats(params: StatisticsFetchParams): Promise<StatisticProviderResponse | null> {
  return fetchProvider("sofascore_stats", params);
}

export async function fetchFotmobStats(params: StatisticsFetchParams): Promise<StatisticProviderResponse | null> {
  return fetchProvider("fotmob_stats", params);
}

export async function fetchOfficialTeamStats(params: StatisticsFetchParams): Promise<StatisticProviderResponse | null> {
  return fetchProvider("official_team_stats", params);
}

export async function fetchEspnStats(params: StatisticsFetchParams): Promise<StatisticProviderResponse | null> {
  return fetchProvider("espn_stats", params);
}

export async function fetchBbcStats(params: StatisticsFetchParams): Promise<StatisticProviderResponse | null> {
  return fetchProvider("bbc_stats", params);
}

export async function fetchGoogleNewsStats(params: StatisticsFetchParams): Promise<StatisticProviderResponse | null> {
  return fetchProvider("google_news_stats", params);
}

export async function fetchNewsApiStats(params: StatisticsFetchParams): Promise<StatisticProviderResponse | null> {
  return fetchProvider("newsapi_stats", params);
}

export async function fetchTwitterStats(params: StatisticsFetchParams): Promise<StatisticProviderResponse | null> {
  return fetchProvider("twitter_stats", params);
}

export async function fetchBettingAggregatorStats(params: StatisticsFetchParams): Promise<StatisticProviderResponse | null> {
  return fetchProvider("betting_aggregator_stats", params);
}

export async function fetchUnderstatStats(params: StatisticsFetchParams): Promise<StatisticProviderResponse | null> {
  return fetchProvider("understat_stats", params);
}

export async function fetchWhoScoredStats(params: StatisticsFetchParams): Promise<StatisticProviderResponse | null> {
  return fetchProvider("whoscored_stats", params);
}

export async function fetchTransfermarktStats(params: StatisticsFetchParams): Promise<StatisticProviderResponse | null> {
  return fetchProvider("transfermarkt_stats", params);
}

export function inferUnit(type: StatisticType): StatisticUnit {
  switch (type) {
    case "possession":
    case "pass_accuracy":
    case "red_zone_efficiency":
    case "time_of_possession":
      return "percentage";
    case "minutes_played":
      return "minutes";
    case "penalty_yards":
      return "yards";
    default:
      return "count";
  }
}
