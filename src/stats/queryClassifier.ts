import { extractQueryMetadata, QueryMetadata } from "../utils";
import {
  StatisticAggregation,
  StatisticPeriod,
  StatisticType,
  StatisticsQuery,
  StatisticQueryType
} from "./types";

const STATISTIC_SYNONYMS: Array<{ type: StatisticType; synonyms: string[] }> = [
  { type: "yellow_cards", synonyms: ["yellow card", "booking", "caution"] },
  { type: "red_cards", synonyms: ["red card", "sent off"] },
  { type: "total_cards", synonyms: ["total cards", "cards overall", "over cards"] },
  { type: "corners", synonyms: ["corner", "corner kick"] },
  { type: "shots_on_target", synonyms: ["shots on target", "shot on goal", "shot on frame"] },
  { type: "shots_total", synonyms: ["shot", "shots total", "shots overall"] },
  { type: "fouls", synonyms: ["foul", "fouls committed", "personal fouls"] },
  { type: "possession", synonyms: ["possession", "ball possession"] },
  { type: "passes", synonyms: ["passes", "pass completed"] },
  { type: "pass_accuracy", synonyms: ["pass accuracy", "passing accuracy"] },
  { type: "key_passes", synonyms: ["key pass"] },
  { type: "saves", synonyms: ["save", "goalkeeper save"] },
  { type: "tackles", synonyms: ["tackle"] },
  { type: "free_kicks", synonyms: ["free kick"] },
  { type: "penalties_awarded", synonyms: ["penalties awarded", "penalty won"] },
  { type: "penalties_scored", synonyms: ["penalties scored", "penalty scored"] },
  { type: "technical_fouls", synonyms: ["technical foul"] },
  { type: "flagrant_fouls", synonyms: ["flagrant foul"] },
  { type: "turnovers", synonyms: ["turnover"] },
  { type: "rebounds_offensive", synonyms: ["offensive rebound"] },
  { type: "rebounds_defensive", synonyms: ["defensive rebound"] },
  { type: "rebounds_total", synonyms: ["total rebounds", "rebound"] },
  { type: "blocks", synonyms: ["block", "blocked shot"] },
  { type: "steals", synonyms: ["steal"] },
  { type: "three_pointers_made", synonyms: ["three pointer made", "3pt made"] },
  { type: "three_pointers_attempted", synonyms: ["three pointer attempted", "3pt attempted"] },
  { type: "free_throws_made", synonyms: ["free throw made"] },
  { type: "free_throws_attempted", synonyms: ["free throw attempted"] },
  { type: "minutes_played", synonyms: ["minutes played", "playing time"] },
  { type: "penalties", synonyms: ["penalties", "penalty"] },
  { type: "penalty_yards", synonyms: ["penalty yards"] },
  { type: "interceptions", synonyms: ["interception", "interceptions"] },
  { type: "fumbles", synonyms: ["fumble"] },
  { type: "sacks", synonyms: ["sack"] },
  { type: "time_of_possession", synonyms: ["time of possession"] },
  { type: "third_down_conversions", synonyms: ["third down conversion"] },
  { type: "red_zone_efficiency", synonyms: ["red zone", "red-zone efficiency"] },
  { type: "goals", synonyms: ["goal", "goals scored"] },
  { type: "assists", synonyms: ["assist", "assists"] }
];

const THRESHOLD_KEYWORDS: Array<{ pattern: RegExp; comparator: StatisticsQuery["comparator"] }> = [
  { pattern: /over\s+(\d+(?:\.\d+)?)/i, comparator: ">" },
  { pattern: /under\s+(\d+(?:\.\d+)?)/i, comparator: "<" },
  { pattern: /more than\s+(\d+(?:\.\d+)?)/i, comparator: ">" },
  { pattern: /less than\s+(\d+(?:\.\d+)?)/i, comparator: "<" },
  { pattern: /at least\s+(\d+(?:\.\d+)?)/i, comparator: ">=" },
  { pattern: /at most\s+(\d+(?:\.\d+)?)/i, comparator: "<=" },
  { pattern: /(\d+(?:\.\d+)?)\+\s+(?:line|cards|corners)/i, comparator: ">=" },
  { pattern: /(?:>=|≥)\s*(\d+(?:\.\d+)?)/, comparator: ">=" },
  { pattern: /(?:<=|≤)\s*(\d+(?:\.\d+)?)/, comparator: "<=" }
];

const TEAM_IN_QUERY_REGEX = /(\b[A-Z][\w'&-]+(?:\s+[A-Z][\w'&-]+){0,2})/g;

function inferStatisticType(lower: string): StatisticType | null {
  for (const entry of STATISTIC_SYNONYMS) {
    if (entry.synonyms.some((syn) => lower.includes(syn))) {
      return entry.type;
    }
  }
  if (/shots\s+on\s+goal/i.test(lower)) {
    return "shots_on_target";
  }
  if (/total\s+cards/i.test(lower)) {
    return "total_cards";
  }
  return null;
}

function determineAggregation(lower: string): StatisticAggregation {
  if (/per\s+team/i.test(lower)) return "per_team";
  if (/per\s+player|each\s+player/i.test(lower)) return "per_player";
  if (/average|avg|mean/i.test(lower)) return "average";
  if (/difference|margin/i.test(lower)) return "difference";
  return "total";
}

function inferPeriod(lower: string): StatisticPeriod {
  if (/first\s+half|1st\s+half/i.test(lower)) return "first_half";
  if (/second\s+half|2nd\s+half/i.test(lower)) return "second_half";
  if (/extra\s+time|after\s+extra/i.test(lower)) return "extra_time";
  if (/overtime|OT\b/i.test(lower)) return "overtime";
  if (/quarter/i.test(lower)) return "quarter";
  return "full_time";
}

function extractMatchEntities(query: string, metadata: QueryMetadata): {
  homeTeam?: string;
  awayTeam?: string;
} {
  const lowered = query.toLowerCase();
  const delimiterRegex = /\b(?:vs\.?|versus|against)\b/i;
  const delimiterMatch = delimiterRegex.exec(lowered);
  if (delimiterMatch?.index !== undefined) {
    const delimiterIndex = delimiterMatch.index;
    const before = query.slice(0, delimiterIndex).trim();
    const after = query.slice(delimiterIndex + delimiterMatch[0].length).trim();
    const homeTeam = before.split(/\b(on|at)\b/i)[0]?.trim();
    const awayTeam = after.split(/\b(on|at|\?|$)/i)[0]?.trim();
    if (homeTeam && awayTeam) {
      return { homeTeam, awayTeam };
    }
  }

  if (metadata.teams.length >= 2) {
    return { homeTeam: metadata.teams[0], awayTeam: metadata.teams[1] };
  }

  const capitalized = Array.from(query.matchAll(TEAM_IN_QUERY_REGEX))
    .map((match) => match[1])
    .filter((team) => team.length > 2);
  if (capitalized.length >= 2) {
    return { homeTeam: capitalized[0], awayTeam: capitalized[1] };
  }

  return {};
}

function extractPlayerCandidate(query: string): string | undefined {
  const didMatch = /did\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+){0,2})/i.exec(query);
  if (didMatch) {
    return didMatch[1].trim();
  }
  const byMatch = /(?:by|from|for)\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+){0,2})/i.exec(query);
  if (byMatch) {
    return byMatch[1].trim();
  }
  return undefined;
}

function determineQueryType(statType: StatisticType, entities: StatisticsQuery["entities"], lower: string): StatisticQueryType {
  if (/over\s|under\s|more than|less than|at least|at most|\d+\.5|\d+\+/.test(lower)) {
    return "threshold";
  }
  if (entities.player) {
    return "player_statistic";
  }
  if (entities.team && !entities.match?.homeTeam && !entities.match?.awayTeam) {
    return "team_aggregate";
  }
  if (statType === "total_cards") {
    return "team_aggregate";
  }
  return "match_statistic";
}

function extractTeamFromQuery(query: string, existing: string | undefined): string | undefined {
  if (existing) return existing;
  const match = /(?:team|for)\s+([A-Z][\w'-]+(?:\s+[A-Z][\w'-]+){0,2})/i.exec(query);
  if (match) {
    return match[1].trim();
  }
  return undefined;
}

function resolveThreshold(lower: string): { comparator: StatisticsQuery["comparator"]; threshold: number } | null {
  for (const entry of THRESHOLD_KEYWORDS) {
    const match = entry.pattern.exec(lower);
    if (match) {
      const value = Number.parseFloat(match[1]);
      if (!Number.isNaN(value)) {
        return { comparator: entry.comparator ?? "=", threshold: value };
      }
    }
  }
  return null;
}

export function classifyStatisticsQuery(rawQuery: string, metadata?: QueryMetadata): StatisticsQuery | null {
  const normalizedMeta = metadata ?? extractQueryMetadata(rawQuery);
  const lower = rawQuery.toLowerCase();

  const statisticType = inferStatisticType(lower);
  if (!statisticType) {
    return null;
  }

  const matchEntities = extractMatchEntities(rawQuery, normalizedMeta);
  const player = extractPlayerCandidate(rawQuery);
  const team = extractTeamFromQuery(rawQuery, normalizedMeta.teams[0]);

  const aggregation = determineAggregation(lower);
  const period = inferPeriod(lower);

  const thresholdInfo = resolveThreshold(lower);

  const eventDate = normalizedMeta.date ? new Date(`${normalizedMeta.date}T23:59:59Z`) : undefined;
  const now = new Date();
  const fifteenMinutes = 15 * 60 * 1000;
  const canResolveNow = eventDate ? now.getTime() - eventDate.getTime() >= fifteenMinutes : false;

  const queryType = determineQueryType(statisticType, { match: matchEntities, player, team }, lower);

  return {
    queryType,
    statisticType,
    entities: {
      match: {
        homeTeam: matchEntities.homeTeam,
        awayTeam: matchEntities.awayTeam,
        date: eventDate,
        competition: normalizedMeta.sport ?? undefined
      },
      team,
      player,
      competition: normalizedMeta.sport ?? undefined
    },
    aggregation,
    period,
    threshold: thresholdInfo?.threshold,
    comparator: thresholdInfo?.comparator ?? undefined,
    eventEndTime: eventDate,
    canResolveNow,
    rawText: rawQuery
  } satisfies StatisticsQuery;
}
