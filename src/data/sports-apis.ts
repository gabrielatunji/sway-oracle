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

export interface FootballScoresDataParams {
	date: string;
	team?: string;
	homeTeam?: string;
	awayTeam?: string;
}

export async function fetchFootballScoresData(params: FootballScoresDataParams): Promise<ProviderEvidence> {
	const apiKey = process.env.FOOTBALL_DATA_API_KEY;
	if (!apiKey) {
		throw new Error("FOOTBALL_DATA_API_KEY is not configured");
	}

	const trimmedTeams = [params.team, params.homeTeam, params.awayTeam]
		.map((value) => (typeof value === "string" ? value.trim() : ""))
		.filter((value) => value.length > 0);

	if (trimmedTeams.length === 0) {
		throw new Error("At least one team name must be provided to fetch football scores");
	}

	const searchParams = new URLSearchParams();
	searchParams.append("date", params.date);
	searchParams.append("team", trimmedTeams[0]);

	const soccerBase = "https://v3.football.api-sports.io/fixtures";
	const soccerQuery = `${soccerBase}?${searchParams.toString()}`;
	const config: AxiosRequestConfig = {
		headers: {
			"x-apisports-key": apiKey
		}
	};

	const evidence = await wrapFetch("API_SPORTS_SOCCER", soccerQuery, config, DEFAULT_RETRY);
	const payload = evidence.payload as { response?: unknown };
	const fixtures = Array.isArray(payload.response) ? payload.response : [];

	const normalize = (text: unknown): string => (typeof text === "string" ? text.trim().toLowerCase() : "");
	const primaryNormalized = normalize(trimmedTeams[0]);
	const requestedOpponents = trimmedTeams.slice(1).map((teamName) => normalize(teamName));

	const matchedFixture = fixtures.find((fixture) => {
		if (!fixture || typeof fixture !== "object") {
			return false;
		}
		const record = fixture as Record<string, unknown>;
		const teams = record.teams as Record<string, unknown> | undefined;
		const home = normalize((teams?.home as Record<string, unknown> | undefined)?.name);
		const away = normalize((teams?.away as Record<string, unknown> | undefined)?.name);
		const includesPrimary = home === primaryNormalized || away === primaryNormalized;
		if (!includesPrimary) {
			return false;
		}
		if (requestedOpponents.length === 0) {
			return true;
		}
		return requestedOpponents.some((opponent) => opponent === home || opponent === away);
	});

	if (!matchedFixture) {
		return evidence;
	}

	const teams = (matchedFixture as Record<string, unknown>).teams as Record<string, unknown> | undefined;
	const score = (matchedFixture as Record<string, unknown>).score as Record<string, unknown> | undefined;
	const fullTime = (score?.fulltime as Record<string, unknown>) ?? {};

	const homeName = (teams?.home as Record<string, unknown> | undefined)?.name ?? null;
	const awayName = (teams?.away as Record<string, unknown> | undefined)?.name ?? null;
	const homeScore = typeof fullTime.home === "number" ? fullTime.home : null;
	const awayScore = typeof fullTime.away === "number" ? fullTime.away : null;

	let winner: string | null = null;
	if (typeof homeScore === "number" && typeof awayScore === "number") {
		if (homeScore > awayScore) {
			winner = typeof homeName === "string" ? homeName : null;
		} else if (awayScore > homeScore) {
			winner = typeof awayName === "string" ? awayName : null;
		} else {
			winner = "draw";
		}
	}

	return {
		...evidence,
		payload: {
			fixture: matchedFixture,
			finalScore: {
				home: homeScore,
				away: awayScore
			},
			winner,
			providerPayload: evidence.payload
		}
	};
}
