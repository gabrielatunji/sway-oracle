import { AxiosRequestConfig } from "axios";
import { fetchJson, RetryOptions, CircuitBreakerOptions } from "../utils";

export interface ProviderEvidence {
  provider: string;
  url: string;
  ts: string;
  payload: unknown;
}

const DEFAULT_RETRY: RetryOptions = {
  retries: 2,
  initialDelayMs: 300,
  factor: 2
};

const DEFAULT_BREAKER: CircuitBreakerOptions = {
  failureThreshold: 3,
  cooldownMs: 15_000
};

async function wrapFetch(
  provider: string,
  url: string,
  config?: AxiosRequestConfig,
  retry?: RetryOptions
): Promise<ProviderEvidence> {
  const data = await fetchJson(url, config, retry ?? DEFAULT_RETRY, DEFAULT_BREAKER);
  return {
    provider,
    url,
    ts: new Date().toISOString(),
    payload: data
  };
}

export async function fetchTheSportsDb(params: { date?: string; team?: string }): Promise<ProviderEvidence> {
  const apiKey = process.env.THESPORTSDB_KEY;
  if (!apiKey) {
    throw new Error("THESPORTSDB_KEY is not configured");
  }
  const searchParams = new URLSearchParams();
  if (params.date) searchParams.append("d", params.date);
  if (params.team) searchParams.append("t", params.team);
  const baseUrl = `https://www.thesportsdb.com/api/v1/json/${apiKey}/eventsday.php`;
  const query = searchParams.toString();
  const url = query ? `${baseUrl}?${query}` : baseUrl;
  return wrapFetch("THESPORTSDB", url, undefined, DEFAULT_RETRY);
}

export async function fetchApiSportsSoccer(params: { date?: string; team?: string }): Promise<ProviderEvidence> {
  const apiKey = process.env.APISPORTS_KEY;
  if (!apiKey) {
    throw new Error("APISPORTS_KEY is not configured");
  }
  const searchParams = new URLSearchParams();
  if (params.date) searchParams.append("date", params.date);
  if (params.team) searchParams.append("team", params.team);
  const soccerBase = "https://v3.football.api-sports.io/fixtures";
  const soccerQuery = searchParams.toString();
  const url = soccerQuery ? `${soccerBase}?${soccerQuery}` : soccerBase;
  const config: AxiosRequestConfig = {
    headers: {
      "x-apisports-key": apiKey
    }
  };
  return wrapFetch("API_SPORTS_SOCCER", url, config, DEFAULT_RETRY);
}

export async function fetchApiSportsBasketball(params: { date?: string; team?: string }): Promise<ProviderEvidence> {
  const apiKey = process.env.APISPORTS_KEY;
  if (!apiKey) {
    throw new Error("APISPORTS_KEY is not configured");
  }
  const searchParams = new URLSearchParams();
  if (params.date) searchParams.append("date", params.date);
  if (params.team) searchParams.append("team", params.team);
  const basketballBase = "https://v1.basketball.api-sports.io/games";
  const basketballQuery = searchParams.toString();
  const url = basketballQuery ? `${basketballBase}?${basketballQuery}` : basketballBase;
  const config: AxiosRequestConfig = {
    headers: {
      "x-apisports-key": apiKey
    }
  };
  return wrapFetch("API_SPORTS_BASKETBALL", url, config, DEFAULT_RETRY);
}

export async function fetchTheOddsScores(params: { date?: string }): Promise<ProviderEvidence> {
  const apiKey = process.env.THEODDS_API_KEY;
  if (!apiKey) {
    throw new Error("THEODDS_API_KEY is not configured");
  }
  const searchParams = new URLSearchParams();
  searchParams.append("apiKey", apiKey);
  if (params.date) searchParams.append("date", params.date);
  const url = `https://api.the-odds-api.com/v4/sports/basketball_nba/scores?${searchParams.toString()}`;
  return wrapFetch("THE_ODDS_API", url, undefined, DEFAULT_RETRY);
}
