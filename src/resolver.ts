import { extractQueryMetadata } from "./utils";
import { parseQueryToStructuredRequest, StructuredQuery } from "./parsers/query-schema";
import { runDeepAgent, DeepAgentArtifact } from "./agent/deepAgent";
import { buildSystemPrompt, buildUserPrompt } from "./llm/prompt";
import { askModel } from "./llm/client";
import { logResolution } from "./db";
import { EvidencePayload, ResolutionResult } from "./types";

type EvidenceGroup = {
	key: string;
	facts: NormalizedFact[];
	providers: Set<string>;
	reliabilityAverage: number;
};

type AnalysisResult = {
	normalizedFacts: NormalizedFact[];
	groups: Map<string, EvidenceGroup>;
	acceptedGroup: EvidenceGroup | null;
	errors: string[];
};

type ResolutionDecision = {
	resolution: string;
	confidence: number;
	reasoning: string;
	sources: string[];
	modelSummary?: Record<string, unknown>;
	acceptedGroupKey?: string;
	finalFacts: NormalizedFact[];
	errors: string[];
};

type OutcomeExtraction = {
	winner?: string;
	homeTeam?: string;
	awayTeam?: string;
};

type NormalizedFact = {
	provider: string;
	canonicalKey: string;
	display: string;
	category: "result" | "scoreline" | "award" | "news" | "other";
	homeTeam?: string;
	awayTeam?: string;
	winner?: string;
	homeScore?: number;
	awayScore?: number;
	award?: string;
	player?: string;
	status?: string;
	endTimestamp?: string;
	sourceUrl?: string;
	reliability: number;
	raw: unknown;
};

const PROVIDER_RELIABILITY: Record<string, number> = {
	THESPORTSDB: 0.85,
	API_SPORTS_SOCCER: 0.95,
	API_SPORTS_BASKETBALL: 0.95,
	THE_ODDS_API: 0.9
};

const FINAL_STATUS_KEYWORDS = [
	"ft",
	"fulltime",
	"full time",
	"finished",
	"final",
	"completed",
	"after overtime",
	"aet",
	"ended",
	"finale"
];

const RESULT_WORDS = [
	"defeat",
	"defeats",
	"defeated",
	"beats",
	"beat",
	"tops",
	"top",
	"edges",
	"edged",
	"wins",
	"win",
	"past",
	"overcome",
	"overcomes"
];

const MAX_SOURCE_COUNT = 8;
const MIN_CORROBORATING_PROVIDERS = 3;

export async function resolveQuery(query: string): Promise<ResolutionResult> {
	const metadata = extractQueryMetadata(query);
	const structured = parseQueryToStructuredRequest(query, metadata);

	const agentOutput = await runDeepAgent(structured);
	const analysis = analyzeArtifacts(agentOutput.artifacts, structured);
	const decision = await decideResolution(query, structured, agentOutput.summary, analysis);

	const evidence = buildEvidencePayload(metadata, agentOutput.artifacts, agentOutput.summary, analysis, decision);
	const result: ResolutionResult = {
		resolution: decision.resolution,
		confidence: decision.confidence,
		reasoning: decision.reasoning,
		sources: decision.sources,
		evidence
	};

	await logResolution({ query, ...result });

	return result;
}

function analyzeArtifacts(artifacts: DeepAgentArtifact[], structured: StructuredQuery): AnalysisResult {
	const normalizedFacts = artifacts.flatMap((artifact) => normalizeArtifact(artifact, structured));
	const errors = collectErrors(artifacts);
	const groups = groupFacts(normalizedFacts);
	const acceptedGroup = selectAcceptedGroup(groups);

	return { normalizedFacts, groups, acceptedGroup, errors };
}

async function decideResolution(
	query: string,
	structured: StructuredQuery,
	agentSummary: string,
	analysis: AnalysisResult
): Promise<ResolutionDecision> {
	const baselineConfidence = 0.25;
	const decision: ResolutionDecision = {
		resolution: "insufficient_data",
		confidence: baselineConfidence,
		reasoning: "Insufficient corroboration from independent sources.",
		sources: [],
		finalFacts: [],
		errors: [...analysis.errors]
	};

	const group = analysis.acceptedGroup;
	if (!group) {
		return decision;
	}

	const finalFacts = filterFinalFacts(group.facts);
	decision.finalFacts = finalFacts;

	const providerCount = countDistinctProviders(finalFacts);
	if (providerCount < MIN_CORROBORATING_PROVIDERS) {
		decision.confidence = 0.3;
		decision.reasoning = "Fewer than three independent sources confirmed the outcome.";
		decision.acceptedGroupKey = group.key;
		return decision;
	}

	const winner = extractWinner(finalFacts);
	const resolution = deriveResolution(structured, finalFacts, winner);

	if (resolution === "insufficient_data") {
		decision.confidence = 0.3;
		decision.reasoning = "Unable to confirm a definitive outcome despite multiple sources.";
		decision.acceptedGroupKey = group.key;
		return decision;
	}

	const conflicts = countConflicts(analysis.groups, group.key);
	const avgReliability = averageReliability(finalFacts);
	const freshnessBonus = computeFreshnessBonus(finalFacts);
	const confidence = clampConfidence(
		computeConfidence(providerCount, conflicts, avgReliability) + freshnessBonus
	);
	const sources = gatherSources(finalFacts).slice(0, MAX_SOURCE_COUNT);
	const reasoning = buildDefaultReasoning(finalFacts, providerCount, winner, structured);

	const summary = await summarizeWithModel(query, structured, group.key, {
		resolution,
		confidence,
		providers: sources,
		winner,
		agentSummary
	});

	let modelSummary: Record<string, unknown> | undefined;
	let reasoningFinal = reasoning;
	let finalSources = sources;
	let finalConfidence = confidence;

	if (summary) {
		modelSummary = summary.modelSummary;
		if (summary.reasoning) {
			reasoningFinal = summary.reasoning;
		}
		if (summary.sources.length > 0) {
			const merged = new Set([...sources, ...summary.sources]);
			finalSources = Array.from(merged).slice(0, MAX_SOURCE_COUNT);
		}
		if (typeof summary.confidence === "number") {
			finalConfidence = clampConfidence((confidence + summary.confidence) / 2);
		}
		if (
			summary.resolution &&
			normalizeValue(summary.resolution) !== normalizeValue(resolution)
		) {
			decision.errors.push(
				"LLM resolution differed from deterministic resolution; deterministic result retained."
			);
		}
	}

	return {
		resolution,
		confidence: finalConfidence,
		reasoning: reasoningFinal,
		sources: finalSources,
		modelSummary,
		acceptedGroupKey: group.key,
		finalFacts,
		errors: decision.errors
	};
}

function buildEvidencePayload(
	metadata: ReturnType<typeof extractQueryMetadata>,
	artifacts: DeepAgentArtifact[],
	agentSummary: string,
	analysis: AnalysisResult,
	decision: ResolutionDecision
): EvidencePayload {
	const errors = [...new Set([...analysis.errors, ...decision.errors])];
	const groups = Array.from(analysis.groups.values()).map((group) => ({
		key: group.key,
		providers: Array.from(group.providers),
		reliabilityAverage: group.reliabilityAverage,
		sample: group.facts.slice(0, 3)
	}));

	return {
		metadata,
		data: {
			agentSummary,
			agentArtifacts: artifacts,
			normalizedFacts: analysis.normalizedFacts,
			groups,
			acceptedGroupKey: decision.acceptedGroupKey,
			modelSummary: decision.modelSummary
		},
		errors,
		modelOutputRaw: decision.modelSummary ? JSON.stringify(decision.modelSummary) : undefined
	};
}

function collectErrors(artifacts: DeepAgentArtifact[]): string[] {
	return artifacts
		.filter((artifact) => Boolean(artifact.error))
		.map((artifact) => `${artifact.tool}: ${artifact.error}`);
}

function normalizeArtifact(artifact: DeepAgentArtifact, structured: StructuredQuery): NormalizedFact[] {
	if (artifact.error || artifact.output === undefined || artifact.output === null) {
		return [];
	}

	if (artifact.tool === "rss_tool" && Array.isArray(artifact.output)) {
		return normalizeRssFacts(artifact.output, structured);
	}

	const output = artifact.output as Record<string, unknown>;
	const provider = typeof output.provider === "string" ? output.provider : artifact.tool.toUpperCase();

	switch (provider) {
		case "THESPORTSDB":
			return normalizeSportsDb(output, structured, artifact);
		case "API_SPORTS_SOCCER":
		case "API_SPORTS_BASKETBALL":
			return normalizeApiSports(output, structured, artifact, provider);
		case "THE_ODDS_API":
			return normalizeOdds(output, structured, artifact);
		default:
			return [];
	}
}

function normalizeSportsDb(
	output: Record<string, unknown>,
	structured: StructuredQuery,
	artifact: DeepAgentArtifact
): NormalizedFact[] {
	const events: unknown[] = [];
	if (Array.isArray(output.events)) {
		events.push(...output.events);
	}
	if (Array.isArray(output.results)) {
		events.push(...output.results);
	}

	return events
		.map((event) => {
			const record = event as Record<string, unknown>;
			const homeTeam = toOptionalString(record.strHomeTeam ?? record.homeTeam);
			const awayTeam = toOptionalString(record.strAwayTeam ?? record.awayTeam);
			if (!matchesStructuredTeams(structured, homeTeam, awayTeam)) {
				return null;
			}

			const date = toOptionalString(record.dateEvent ?? record.dateEventLocal);
			if (structured.date && date && !date.startsWith(structured.date)) {
				return null;
			}

			const homeScore = parseScore(record.intHomeScore ?? record.intHomeScoreFT);
			const awayScore = parseScore(record.intAwayScore ?? record.intAwayScoreFT);
			const status = toOptionalString(record.strStatus ?? record.strResult);
			const winner = determineWinner(
				homeTeam,
				awayTeam,
				homeScore,
				awayScore,
				toOptionalString(record.strResult)
			);
			const endTimestamp =
				toOptionalString(record.strTimestamp) ?? (date ? `${date}T00:00:00Z` : undefined);

			return buildFact({
				provider: "THESPORTSDB",
				structured,
				raw: record,
				homeTeam,
				awayTeam,
				homeScore,
				awayScore,
				winner,
				status,
				endTimestamp,
				sourceUrl: toOptionalString(output.url) ?? artifact.tool
			});
		})
		.filter(isNormalizedFact);
}

function normalizeApiSports(
	output: Record<string, unknown>,
	structured: StructuredQuery,
	artifact: DeepAgentArtifact,
	provider: string
): NormalizedFact[] {
	const response = Array.isArray(output.response) ? output.response : [];

	return response
		.map((item) => {
			const record = item as Record<string, unknown>;
			const teams = (record.teams ?? {}) as Record<string, unknown>;
			const fixture = (record.fixture ?? {}) as Record<string, unknown>;
			const scores = (record.scores ?? record.score ?? {}) as Record<string, unknown>;

			const homeTeam = toOptionalString((teams.home as Record<string, unknown> | undefined)?.name);
			const awayTeam = toOptionalString((teams.away as Record<string, unknown> | undefined)?.name);
			if (!matchesStructuredTeams(structured, homeTeam, awayTeam)) {
				return null;
			}

			const date = toOptionalString(fixture.date);
			if (structured.date && date && !date.startsWith(structured.date)) {
				return null;
			}

			const fixtureStatus = fixture.status as Record<string, unknown> | undefined;
			const status =
				toOptionalString(fixtureStatus?.short) ?? toOptionalString(fixtureStatus?.long);

			const fullTime = scores.fulltime as Record<string, unknown> | undefined;
			const finalScore = scores.final as Record<string, unknown> | undefined;
			const goals = record.goals as Record<string, unknown> | undefined;

			const homeScore = parseScore(fullTime?.home ?? finalScore?.home ?? goals?.home);
			const awayScore = parseScore(fullTime?.away ?? finalScore?.away ?? goals?.away);

			const homeWon = Boolean((teams.home as Record<string, unknown> | undefined)?.winner);
			const awayWon = Boolean((teams.away as Record<string, unknown> | undefined)?.winner);
			let winnerOverride: string | undefined;
			if (homeWon) {
				winnerOverride = homeTeam;
			} else if (awayWon) {
				winnerOverride = awayTeam;
			}

			const winner = determineWinner(homeTeam, awayTeam, homeScore, awayScore, winnerOverride);

			return buildFact({
				provider,
				structured,
				raw: record,
				homeTeam,
				awayTeam,
				homeScore,
				awayScore,
				winner,
				status,
				endTimestamp: date,
				sourceUrl: toOptionalString(output.url) ?? artifact.tool
			});
		})
		.filter(isNormalizedFact);
}

function normalizeOdds(
	output: Record<string, unknown> | unknown[] | unknown,
	structured: StructuredQuery,
	artifact: DeepAgentArtifact
): NormalizedFact[] {
	const entries: unknown[] = [];
	if (Array.isArray(output)) {
		entries.push(...output);
	} else if (output && typeof output === "object") {
		const candidate = (output as Record<string, unknown>).data;
		if (Array.isArray(candidate)) {
			entries.push(...candidate);
		}
	}

	return entries
		.map((entry) => {
			const record = entry as Record<string, unknown>;
			const homeTeam = toOptionalString(record.home_team ?? record.homeTeam);
			const awayTeam = toOptionalString(record.away_team ?? record.awayTeam);
			if (!matchesStructuredTeams(structured, homeTeam, awayTeam)) {
				return null;
			}

			const commence = toOptionalString(record.commence_time ?? record.commenceTime);
			if (structured.date && commence && !commence.startsWith(structured.date)) {
				return null;
			}

			const scoreMap = new Map<string, number>();
			if (Array.isArray(record.scores)) {
				for (const scoreItem of record.scores as Array<Record<string, unknown>>) {
					const name = toOptionalString(scoreItem.name);
					const scoreValue = parseScore(scoreItem.score);
					if (name && scoreValue !== undefined) {
						scoreMap.set(normalizeTeamName(name), scoreValue);
					}
				}
			}

			const homeScore = homeTeam ? scoreMap.get(normalizeTeamName(homeTeam)) : undefined;
			const awayScore = awayTeam ? scoreMap.get(normalizeTeamName(awayTeam)) : undefined;
			const winner = determineWinner(homeTeam, awayTeam, homeScore, awayScore);
			const status = record.completed === true ? "finished" : toOptionalString(record.status);

			return buildFact({
				provider: "THE_ODDS_API",
				structured,
				raw: record,
				homeTeam,
				awayTeam,
				homeScore,
				awayScore,
				winner,
				status,
				endTimestamp: commence,
				sourceUrl: toOptionalString((output as Record<string, unknown>).url) ?? artifact.tool
			});
		})
		.filter(isNormalizedFact);
}

function normalizeRssFacts(items: unknown[], structured: StructuredQuery): NormalizedFact[] {
	return items
		.map((item) => {
			if (!item || typeof item !== "object") {
				return null;
			}

			const record = item as Record<string, unknown>;
			const title = toOptionalString(record.title);
			if (!title) {
				return null;
			}

			const link = toOptionalString(record.link);
			const isoDate = toOptionalString(record.isoDate);
			const source = toOptionalString(record.source);

			const outcome = extractOutcomeFromTitle(title, structured.teams);
			const providerHost = source ? safeHostname(source) : "rss";

			return buildFact({
				provider: `rss:${providerHost}`,
				structured,
				raw: record,
				display: title,
				category: "news",
				winner: outcome?.winner,
				homeTeam: outcome?.homeTeam,
				awayTeam: outcome?.awayTeam,
				status: "reported",
				endTimestamp: isoDate,
				sourceUrl: link ?? source ?? providerHost,
				reliabilityOverride: 0.6
			});
		})
		.filter((fact) => fact?.canonicalKey && fact.canonicalKey !== "unknown")
		.filter(isNormalizedFact);
}

function buildFact(params: {
	provider: string;
	structured: StructuredQuery;
	raw: unknown;
	homeTeam?: string;
	awayTeam?: string;
	homeScore?: number;
	awayScore?: number;
	winner?: string;
	award?: string;
	player?: string;
	status?: string;
	endTimestamp?: string;
	sourceUrl?: string;
	display?: string;
	category?: NormalizedFact["category"];
	reliabilityOverride?: number;
}): NormalizedFact | null {
	const reliability = params.reliabilityOverride ?? getReliabilityScore(params.provider);
	const display =
		params.display ??
		buildDisplay(params.homeTeam, params.awayTeam, params.homeScore, params.awayScore, params.winner);
	const canonicalKey = buildCanonicalKey({
		structured: params.structured,
		winner: params.winner,
		homeTeam: params.homeTeam,
		awayTeam: params.awayTeam,
		homeScore: params.homeScore,
		awayScore: params.awayScore,
		award: params.award,
		player: params.player,
		endTimestamp: params.endTimestamp,
		category: params.category
	});

	if (canonicalKey === "unknown") {
		return null;
	}

	return {
		provider: params.provider,
		canonicalKey,
		display,
		category: params.category ?? (params.homeTeam && params.awayTeam ? "result" : "other"),
		homeTeam: params.homeTeam,
		awayTeam: params.awayTeam,
		winner: params.winner,
		homeScore: params.homeScore,
		awayScore: params.awayScore,
		award: params.award,
		player: params.player,
		status: params.status,
		endTimestamp: params.endTimestamp,
		sourceUrl: params.sourceUrl,
		reliability,
		raw: params.raw
	};
}

function buildDisplay(
	homeTeam?: string,
	awayTeam?: string,
	homeScore?: number,
	awayScore?: number,
	winner?: string
): string {
	if (homeTeam && awayTeam && homeScore !== undefined && awayScore !== undefined) {
		return `${homeTeam} ${homeScore}-${awayScore} ${awayTeam}`;
	}
	if (winner) {
		return `${winner} win`;
	}
	return "Result reported";
}

function buildCanonicalKey(params: {
	structured: StructuredQuery;
	winner?: string;
	homeTeam?: string;
	awayTeam?: string;
	homeScore?: number;
	awayScore?: number;
	award?: string;
	player?: string;
	endTimestamp?: string;
	category?: NormalizedFact["category"];
}): string {
	const datePart = params.structured.date ?? (params.endTimestamp ? params.endTimestamp.slice(0, 10) : "");
	const teamsKey = buildTeamsKey(params.structured, params.homeTeam, params.awayTeam);

	if (params.category === "award" && params.award && params.player) {
		return `award:${normalizeText(params.award)}:${normalizeText(params.player)}:${teamsKey}:${datePart}`;
	}

	if (params.winner) {
		return `winner:${normalizeTeamName(params.winner)}:${teamsKey}:${datePart}`;
	}

	if (
		params.homeTeam &&
		params.awayTeam &&
		params.homeScore !== undefined &&
		params.awayScore !== undefined
	) {
		return `score:${teamsKey}:${params.homeScore}-${params.awayScore}:${datePart}`;
	}

	return "unknown";
}

function buildTeamsKey(structured: StructuredQuery, homeTeam?: string, awayTeam?: string): string {
	const fallbackTeams = [homeTeam, awayTeam].filter(isDefinedString);
	const teams = structured.teams.length > 0 ? structured.teams : fallbackTeams;
	if (teams.length === 0) {
		return "unspecified";
	}

		return teams
			.map(normalizeTeamName)
			.filter((team: string) => team.length > 0)
			.sort()
			.join("|");
}

function normalizeTeamName(team?: string): string {
	if (!team) {
		return "";
	}

	return team
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((segment) => segment.length > 0)
		.join("");
}

function normalizeText(value: string): string {
	return value
		.toLowerCase()
		.split(/\s+/)
		.filter((segment) => segment.length > 0)
		.join("_");
}

function matchesStructuredTeams(structured: StructuredQuery, homeTeam?: string | null, awayTeam?: string | null): boolean {
		const normalizedTeams = structured.teams
			.map(normalizeTeamName)
			.filter((team: string) => team.length > 0);
	if (normalizedTeams.length === 0) {
		return true;
	}

	const eventTeams = [homeTeam, awayTeam].map((team) => normalizeTeamName(team ?? undefined));
	if (normalizedTeams.length === 1) {
		return eventTeams.includes(normalizedTeams[0]);
	}

	const eventSet = new Set(eventTeams);
		return normalizedTeams.every((team: string) => eventSet.has(team));
}

function determineWinner(
	homeTeam?: string | null,
	awayTeam?: string | null,
	homeScore?: number,
	awayScore?: number,
	winnerOverride?: string
): string | undefined {
	if (winnerOverride) {
		return winnerOverride;
	}

	if (homeScore === undefined || awayScore === undefined) {
		return undefined;
	}

	if (homeScore > awayScore) {
		return homeTeam ?? undefined;
	}

	if (awayScore > homeScore) {
		return awayTeam ?? undefined;
	}

	return "draw";
}

function parseScore(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}

	if (typeof value === "string") {
		const trimmed = value.trim();
		if (trimmed.length === 0) {
			return undefined;
		}

		const parsed = Number(trimmed);
		return Number.isFinite(parsed) ? parsed : undefined;
	}

	return undefined;
}

function toOptionalString(value: unknown): string | undefined {
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function safeHostname(url: string): string {
	if (typeof URL.canParse === "function" && URL.canParse(url)) {
		return new URL(url).hostname;
	}

	if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) {
		try {
			return new URL(url).hostname;
		} catch {
			return url;
		}
	}

	return url;
}

function getReliabilityScore(provider: string): number {
	if (provider.startsWith("rss:")) {
		return 0.55;
	}

	return PROVIDER_RELIABILITY[provider] ?? 0.5;
}

function groupFacts(facts: NormalizedFact[]): Map<string, EvidenceGroup> {
	const groups = new Map<string, EvidenceGroup>();

	for (const fact of facts) {
		if (!fact.canonicalKey) {
			continue;
		}

		const existing = groups.get(fact.canonicalKey);
		if (existing) {
			existing.facts.push(fact);
			existing.providers.add(fact.provider);
			continue;
		}

		groups.set(fact.canonicalKey, {
			key: fact.canonicalKey,
			facts: [fact],
			providers: new Set([fact.provider]),
			reliabilityAverage: fact.reliability
		});
	}

	for (const group of groups.values()) {
		group.reliabilityAverage = averageReliability(group.facts);
	}

	return groups;
}

function selectAcceptedGroup(groups: Map<string, EvidenceGroup>): EvidenceGroup | null {
	let best: EvidenceGroup | null = null;

	for (const group of groups.values()) {
		if (!best) {
			best = group;
			continue;
		}

		const providerDelta = group.providers.size - best.providers.size;
		if (providerDelta > 0) {
			best = group;
			continue;
		}

		if (providerDelta === 0 && group.reliabilityAverage > best.reliabilityAverage) {
			best = group;
		}
	}

	return best;
}

function filterFinalFacts(facts: NormalizedFact[]): NormalizedFact[] {
	const finals = facts.filter((fact) => fact.category === "news" || isFinalStatus(fact.status));
	return finals.length > 0 ? finals : facts;
}

function isFinalStatus(status?: string): boolean {
	if (!status) {
		return false;
	}

	const normalized = status.toLowerCase();
	return (
		FINAL_STATUS_KEYWORDS.includes(normalized) ||
		normalized.includes("final") ||
		normalized.includes("full") ||
		normalized.includes("completed")
	);
}

function extractWinner(facts: NormalizedFact[]): string | undefined {
	for (const fact of facts) {
		if (fact.winner && fact.winner !== "draw") {
			return fact.winner;
		}
	}

	return undefined;
}

function deriveResolution(structured: StructuredQuery, facts: NormalizedFact[], winner?: string): string {
	if (!winner && structured.questionType === "player_award") {
		const awardFact = facts.find((fact) => fact.category === "award" && fact.player);
		if (awardFact?.player) {
			return awardFact.player;
		}
	}

	if (!winner) {
		return "insufficient_data";
	}

	switch (structured.questionType) {
		case "did_result_happen": {
			const targetTeam = structured.teams[0];
			if (!targetTeam) {
				return "insufficient_data";
			}
			return normalizeValue(winner) === normalizeValue(targetTeam) ? "yes" : "no";
		}
		case "who_won":
			return winner;
		case "scoreline": {
			const fact = facts.find(
				(item) => item.homeScore !== undefined && item.awayScore !== undefined && item.homeTeam && item.awayTeam
			);
			if (fact) {
				return `${fact.homeTeam} ${fact.homeScore}-${fact.awayScore} ${fact.awayTeam}`;
			}
			break;
		}
		default:
			break;
	}

	return winner;
}

function computeConfidence(agreeingSources: number, conflicts: number, avgReliability: number): number {
	let base = 0.3;
	if (agreeingSources === 3) {
		base = 0.6;
	} else if (agreeingSources === 4) {
		base = 0.75;
	} else if (agreeingSources >= 5) {
		base = 0.9;
	}

	base -= Math.min(0.25, conflicts * 0.1);
	const reliabilityAdjustment = (avgReliability - 0.7) * 0.15;

	return base + reliabilityAdjustment;
}

function computeFreshnessBonus(facts: NormalizedFact[]): number {
	const now = Date.now();
	const horizon = 72 * 60 * 60 * 1000;
	const recent = facts.filter((fact) => {
		if (!fact.endTimestamp) {
			return false;
		}
		const ts = Date.parse(fact.endTimestamp);
		return Number.isFinite(ts) && now - ts < horizon;
	});

	if (recent.length === facts.length && facts.length > 0) {
		return 0.05;
	}

	if (recent.length >= Math.ceil(facts.length / 2)) {
		return 0.02;
	}

	return 0;
}

function clampConfidence(value: number): number {
	if (!Number.isFinite(value)) {
		return 0;
	}

	if (value < 0) {
		return 0;
	}

	if (value > 1) {
		return 1;
	}

	return value;
}

function buildDefaultReasoning(
	facts: NormalizedFact[],
	providerCount: number,
	winner: string | undefined,
	structured: StructuredQuery
): string {
	const providerList = Array.from(new Set(facts.map((fact) => fact.provider))).slice(0, 3);
	if (winner && structured.questionType === "did_result_happen") {
		const targetTeam = structured.teams[0];
		const outcome = normalizeValue(winner) === normalizeValue(targetTeam) ? "won" : "did not win";
		return `${targetTeam ?? "The team"} ${outcome}, corroborated by ${providerList.join(", ")}.`;
	}

	if (winner) {
		return `${winner} confirmed as winner by ${providerList.join(", ")}.`;
	}

	const fact = facts[0];
	if (fact?.homeTeam && fact?.awayTeam && fact.homeScore !== undefined && fact.awayScore !== undefined) {
		return `${fact.display} confirmed by ${providerList.join(", ")}.`;
	}

	return `Outcome corroborated by ${providerCount} independent sources: ${providerList.join(", ")}.`;
}

function extractOutcomeFromTitle(title: string, teams: string[]): OutcomeExtraction | null {
	const normalizedTeams = teams
		.map((team) => ({ original: team, normalized: normalizeTeamName(team) }))
		.filter((team) => team.normalized.length > 0);

	if (normalizedTeams.length === 0) {
		return null;
	}

	const lower = title.toLowerCase();
	const presentTeams = normalizedTeams.filter((team) => lower.includes(team.normalized));
	if (presentTeams.length < Math.min(2, normalizedTeams.length)) {
		return null;
	}

	for (const keyword of RESULT_WORDS) {
		const pattern = new RegExp(`([\\w\\s]+)\\s+${keyword}\\s+([\\w\\s]+)`, "i");
		const match = pattern.exec(title);
		if (!match) {
			continue;
		}

		const leading = match[1].trim().toLowerCase();
		const trailing = match[2].trim().toLowerCase();

		const winnerCandidate = normalizedTeams.find((team) => leading.includes(team.normalized));
		const loserCandidate = normalizedTeams.find((team) => trailing.includes(team.normalized));

		if (winnerCandidate) {
			return {
				winner: winnerCandidate.original,
				homeTeam: winnerCandidate.original,
				awayTeam: loserCandidate?.original
			};
		}
	}

	return null;
}

function averageReliability(facts: NormalizedFact[]): number {
	if (facts.length === 0) {
		return 0.5;
	}

	const total = facts.reduce((sum, fact) => sum + fact.reliability, 0);
	return total / facts.length;
}

function gatherSources(facts: NormalizedFact[]): string[] {
	const sources = facts
		.map((fact) => fact.sourceUrl ?? fact.provider)
		.filter(isDefinedString);
	return Array.from(new Set(sources));
}

function countDistinctProviders(facts: NormalizedFact[]): number {
	return new Set(facts.map((fact) => fact.provider)).size;
}

function countConflicts(groups: Map<string, EvidenceGroup>, acceptedKey: string): number {
	let conflicts = 0;
	for (const [key, group] of groups.entries()) {
		if (key === acceptedKey) {
			continue;
		}
		if (group.providers.size > 0) {
			conflicts += 1;
		}
	}
	return conflicts;
}

async function summarizeWithModel(
	query: string,
	structured: StructuredQuery,
	acceptedKey: string,
	context: {
		resolution: string;
		confidence: number;
		providers: string[];
		winner?: string;
		agentSummary: string;
	}
): Promise<{
	reasoning?: string;
	sources: string[];
	confidence?: number;
	modelSummary: Record<string, unknown>;
	resolution?: string;
} | null> {
	try {
		const digest = {
			query,
			structured,
			acceptedKey,
			agreeingProviders: context.providers,
			candidateResolution: context.resolution,
			candidateConfidence: context.confidence,
			winner: context.winner,
			agentSummary: context.agentSummary
		};

		const messages: Array<{ role: "system" | "user"; content: string }> = [
			{ role: "system", content: buildSystemPrompt() },
			{
				role: "user",
				content: buildUserPrompt(
					{
						...structured,
						candidateResolution: context.resolution,
						candidateConfidence: context.confidence,
						supportingProviders: context.providers
					},
					digest
				)
			}
		];

		const response = await askModel(messages, null);
		const modelSummary = typeof response === "object" && response !== null ? (response as Record<string, unknown>) : {};

		const reasoning = toOptionalString(modelSummary.reasoning);
		const sources = Array.isArray(modelSummary.sources)
			? modelSummary.sources.filter(isDefinedString)
			: [];
		const confidence = typeof modelSummary.confidence === "number" ? modelSummary.confidence : undefined;
		const resolution = toOptionalString(modelSummary.resolution);

		return {
			reasoning,
			sources,
			confidence,
			modelSummary,
			resolution
		};
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		console.error("LLM summarization failed", message);
		return null;
	}
}

function isDefinedString(value: unknown): value is string {
	return typeof value === "string" && value.length > 0;
}

function isNormalizedFact(fact: NormalizedFact | null): fact is NormalizedFact {
	return fact !== null && fact !== undefined;
}

function normalizeValue(value: string | undefined): string {
	return value ? normalizeTeamName(value) : "";
}
