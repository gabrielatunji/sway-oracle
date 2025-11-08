import {
  NormalizedStatistic,
  StatisticProviderResponse,
  StatisticSource,
  StatisticType,
  StatisticsQuery,
  StatisticAggregation,
  StatisticPeriod,
  StatisticUnit
} from "./types";
import { inferUnit } from "./providers";

interface RawStatisticCandidate {
  type: StatisticType;
  value: number | null;
  raw: unknown;
  team?: string;
  player?: string;
  unit?: StatisticUnit;
  period?: StatisticPeriod;
  aggregation?: StatisticAggregation;
}

interface CandidateContext {
  provider: StatisticProviderResponse;
  query: StatisticsQuery;
}

const ALIAS_LOOKUP: Array<{ type: StatisticType; patterns: RegExp[] }> = [
  { type: "yellow_cards", patterns: [/yellow\s+cards?/, /bookings?/, /cautions?/] },
  { type: "red_cards", patterns: [/red\s+cards?/, /sent\s+off/, /dismissals?/ ] },
  { type: "total_cards", patterns: [/total\s+cards/, /cards?\s+overall/, /cards?\s+total/] },
  { type: "corners", patterns: [/corners?/, /corner\s+kicks?/] },
  { type: "shots_on_target", patterns: [/shots?\s+on\s+target/, /shots?\s+on\s+goal/, /shots?\s+on\s+frame/] },
  { type: "shots_total", patterns: [/shots?/, /att(?:empts?|empted)/] },
  { type: "fouls", patterns: [/fouls?/, /personal\s+fouls?/, /committed/] },
  { type: "possession", patterns: [/possession/, /ball\s+possession/] },
  { type: "passes", patterns: [/passes?/, /total\s+passes?/] },
  { type: "pass_accuracy", patterns: [/pass\s+accuracy/, /passing\s+accuracy/] },
  { type: "key_passes", patterns: [/key\s+passes?/] },
  { type: "saves", patterns: [/saves?/, /goalie\s+saves?/] },
  { type: "tackles", patterns: [/tackles?/, /tackled?/] },
  { type: "interceptions", patterns: [/interceptions?/] },
  { type: "free_kicks", patterns: [/free\s+kicks?/] },
  { type: "penalties_awarded", patterns: [/penalt(?:y|ies)\s+awarded/, /penalty\s+won/] },
  { type: "penalties_scored", patterns: [/penalt(?:y|ies)\s+scored/, /penalty\s+converted/] },
  { type: "technical_fouls", patterns: [/technical\s+fouls?/] },
  { type: "flagrant_fouls", patterns: [/flagrant\s+fouls?/] },
  { type: "turnovers", patterns: [/turnovers?/] },
  { type: "rebounds_offensive", patterns: [/offensive\s+rebounds?/] },
  { type: "rebounds_defensive", patterns: [/defensive\s+rebounds?/] },
  { type: "rebounds_total", patterns: [/total\s+rebounds?/, /rebounds?/ ] },
  { type: "blocks", patterns: [/blocks?/, /blocked\s+shots?/] },
  { type: "steals", patterns: [/steals?/] },
  { type: "three_pointers_made", patterns: [/(?:3|three)\s*pt\s+made/, /three\s+pointers?\s+made/] },
  { type: "three_pointers_attempted", patterns: [/(?:3|three)\s*pt\s+attempted/, /three\s+pointers?\s+attempted/] },
  { type: "free_throws_made", patterns: [/free\s+throws?\s+made/] },
  { type: "free_throws_attempted", patterns: [/free\s+throws?\s+attempted/] },
  { type: "minutes_played", patterns: [/minutes?\s+played/, /min\.?\s+played/] },
  { type: "penalties", patterns: [/penalt(?:y|ies)/] },
  { type: "penalty_yards", patterns: [/penalty\s+yards?/] },
  { type: "fumbles", patterns: [/fumbles?/] },
  { type: "sacks", patterns: [/sacks?/] },
  { type: "time_of_possession", patterns: [/time\s+of\s+possession/] },
  { type: "third_down_conversions", patterns: [/third\s+down\s+conversions?/] },
  { type: "red_zone_efficiency", patterns: [/red\s+zone\s+efficiency/, /red\s+zone\s+%/] },
  { type: "goals", patterns: [/goals?/] },
  { type: "assists", patterns: [/assists?/ ] }
];

export function deriveNormalizedStatistics(
  responses: StatisticProviderResponse[],
  query: StatisticsQuery
): NormalizedStatistic[] {
  const normalized: NormalizedStatistic[] = [];

  for (const response of responses) {
    if (!response) continue;
    const context: CandidateContext = { provider: response, query };
    const candidates = extractCandidates(response.payload, context);
    for (const candidate of candidates) {
      if (candidate.value === null || Number.isNaN(candidate.value)) {
        continue;
      }
      normalized.push(toNormalizedStatistic(candidate, context));
    }
  }

  return normalized;
}

function toNormalizedStatistic(candidate: RawStatisticCandidate, context: CandidateContext): NormalizedStatistic {
  const { provider, query } = context;
  const match = query.entities.match;
  const unit = candidate.unit ?? inferUnit(candidate.type);
  const aggregation = candidate.aggregation ?? query.aggregation ?? "total";
  const period = candidate.period ?? query.period ?? "full_time";

  const source: StatisticSource = {
    source: provider.provider,
    tier: provider.tier,
    weight: provider.weight,
    rawValue: candidate.raw as string | number | null,
    parsedValue: candidate.value ?? undefined,
    timestamp: provider.collectedAt,
    metadata: provider.meta
  };

  return {
    type: candidate.type,
    team: candidate.team ?? query.entities.team,
    player: candidate.player ?? query.entities.player,
    match: match
      ? {
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          date: match.date?.toISOString(),
          competition: match.competition,
          matchId: match.matchId
        }
      : undefined,
    value: candidate.value ?? 0,
    unit,
    period,
    aggregation,
    sources: [source]
  } satisfies NormalizedStatistic;
}

function extractCandidates(payload: unknown, context: CandidateContext): RawStatisticCandidate[] {
  if (payload === null || payload === undefined) return [];

  if (Array.isArray(payload)) {
    return payload.flatMap((item) => extractCandidates(item, context));
  }

  if (typeof payload === "number") {
    return [buildCandidateFromPrimitive(payload, context.query.statisticType, payload)];
  }

  if (typeof payload === "string") {
    const value = extractNumberFromText(payload);
    return value === null
      ? []
      : [buildCandidateFromPrimitive(value, context.query.statisticType, payload)];
  }

  if (typeof payload === "object") {
    return extractFromObject(payload as Record<string, unknown>, context);
  }

  return [];
}

function extractFromObject(value: Record<string, unknown>, context: CandidateContext): RawStatisticCandidate[] {
  return [
    ...extractFromKnownArrays(value, context),
    ...extractFromEmbeddedText(value, context),
    ...extractFromValueField(value, context),
    ...extractFromPrimitivePairs(value, context),
    ...extractFromNestedObjects(value, context)
  ];
}

function extractFromKnownArrays(value: Record<string, unknown>, context: CandidateContext): RawStatisticCandidate[] {
  const arrays = [value.statistics, value.data, value.items];
  return arrays
    .filter((array): array is unknown[] => Array.isArray(array))
    .flatMap((array) => array.flatMap((item) => extractCandidates(item, context)));
}

function extractFromEmbeddedText(value: Record<string, unknown>, context: CandidateContext): RawStatisticCandidate[] {
  if (typeof value.text !== "string") {
    return [];
  }
  const textValue = extractNumberFromText(value.text);
  return textValue === null
    ? []
    : [buildCandidateFromPrimitive(textValue, context.query.statisticType, value.text)];
}

function extractFromValueField(value: Record<string, unknown>, context: CandidateContext): RawStatisticCandidate[] {
  if (typeof value.value !== "number" && typeof value.value !== "string") {
    return [];
  }
  const type = resolveTypeFromObject(value, context.query.statisticType);
  const parsed = parseNumber(value.value);
  return [buildCandidateFromPrimitive(parsed, type, value.value, value)];
}

function extractFromPrimitivePairs(value: Record<string, unknown>, context: CandidateContext): RawStatisticCandidate[] {
  const candidates: RawStatisticCandidate[] = [];
  for (const [key, inner] of Object.entries(value)) {
    if (inner === null || typeof inner === "object") {
      continue;
    }
    const candidateType = inferTypeFromKey(key, context.query.statisticType);
    if (!candidateType) {
      continue;
    }
    const parsed = parseNumber(inner);
    candidates.push(buildCandidateFromPrimitive(parsed, candidateType, inner));
  }
  return candidates;
}

function extractFromNestedObjects(value: Record<string, unknown>, context: CandidateContext): RawStatisticCandidate[] {
  const nestedValues = Object.values(value).filter((inner): inner is Record<string, unknown> => Boolean(inner) && typeof inner === "object");
  return nestedValues.flatMap((inner) => extractCandidates(inner, context));
}

function buildCandidateFromPrimitive(
  numericValue: number | null,
  type: StatisticType,
  raw: unknown,
  context?: Record<string, unknown>
): RawStatisticCandidate {
  const candidate: RawStatisticCandidate = {
    type,
    value: numericValue,
    raw
  };

  if (context) {
    const team = inferTeamFromContext(context);
    const player = inferPlayerFromContext(context);
    if (team) candidate.team = team;
    if (player) candidate.player = player;
    if (typeof context.period === "string") {
      candidate.period = normalizePeriod(String(context.period));
    }
  }

  return candidate;
}

function inferTeamFromContext(context: Record<string, unknown>): string | undefined {
  const candidates = [context.team, context.teamName, context.club, context.side];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return undefined;
}

function inferPlayerFromContext(context: Record<string, unknown>): string | undefined {
  const candidates = [context.player, context.playerName, context.name, context.athlete];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }
  return undefined;
}

function inferTypeFromKey(key: string, fallback: StatisticType): StatisticType | null {
  const normalizedKey = key.replaceAll(/[_-]/g, " ").toLowerCase();
  if (normalizedKey.includes(fallback.replaceAll("_", " "))) {
    return fallback;
  }
  for (const alias of ALIAS_LOOKUP) {
    if (alias.patterns.some((pattern) => pattern.test(normalizedKey))) {
      return alias.type;
    }
  }
  return null;
}

function resolveTypeFromObject(value: Record<string, unknown>, fallback: StatisticType): StatisticType {
  const nameFields = [value.type, value.statType, value.label, value.name];
  for (const field of nameFields) {
    if (typeof field === "string") {
      const inferred = inferTypeFromKey(field, fallback);
      if (inferred) {
        return inferred;
      }
    }
  }
  return fallback;
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const sanitized = value.replaceAll(/[^0-9.,-]/g, "").replaceAll(",", "");
    if (sanitized.length === 0) {
      return null;
    }
    const parsed = Number.parseFloat(sanitized);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function extractNumberFromText(text: string): number | null {
  const match = /(-?\d+(?:\.\d+)?)/.exec(text);
  if (!match) {
    return null;
  }
  const parsed = Number.parseFloat(match[1]);
  return Number.isNaN(parsed) ? null : parsed;
}

function normalizePeriod(input: string): StatisticPeriod {
  const lower = input.toLowerCase();
  if (lower.includes("first")) return "first_half";
  if (lower.includes("second")) return "second_half";
  if (lower.includes("extra")) return "extra_time";
  if (lower.includes("overtime") || lower.includes("ot")) return "overtime";
  if (lower.includes("quarter")) return "quarter";
  return "full_time";
}
