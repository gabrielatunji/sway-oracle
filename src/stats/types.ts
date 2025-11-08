import { ProviderEvidence } from "../data/sports-apis";
import { EvidencePayload, ResolutionResult } from "../types";

export type StatisticUnit = "count" | "percentage" | "minutes" | "yards" | "other";
export type StatisticPeriod = "full_time" | "first_half" | "second_half" | "extra_time" | "overtime" | "quarter" | "other";

export const STATISTIC_TYPES = [
  "yellow_cards",
  "red_cards",
  "total_cards",
  "corners",
  "shots_on_target",
  "shots_total",
  "fouls",
  "possession",
  "passes",
  "pass_accuracy",
  "key_passes",
  "saves",
  "tackles",
  "interceptions",
  "free_kicks",
  "penalties_awarded",
  "penalties_scored",
  "technical_fouls",
  "flagrant_fouls",
  "turnovers",
  "rebounds_offensive",
  "rebounds_defensive",
  "rebounds_total",
  "blocks",
  "steals",
  "three_pointers_made",
  "three_pointers_attempted",
  "free_throws_made",
  "free_throws_attempted",
  "minutes_played",
  "penalties",
  "penalty_yards",
  "fumbles",
  "sacks",
  "time_of_possession",
  "third_down_conversions",
  "red_zone_efficiency",
  "goals",
  "assists",
  "other"
] as const;

export type StatisticType = (typeof STATISTIC_TYPES)[number];

export interface StatisticSource {
  source: string;
  tier: number;
  weight: number;
  rawValue: string | number | null;
  parsedValue?: number;
  timestamp: Date;
  metadata?: Record<string, unknown>;
  evidence?: ProviderEvidence | Record<string, unknown>;
}

export interface NormalizedStatistic {
  type: StatisticType;
  team?: string;
  player?: string;
  match?: {
    homeTeam?: string;
    awayTeam?: string;
    date?: string;
    competition?: string;
    matchId?: string;
  };
  value: number;
  unit: StatisticUnit;
  period: StatisticPeriod;
  aggregation: "total" | "per_team" | "per_player" | "average" | "difference" | "other";
  sources: StatisticSource[];
}

export type StatisticQueryType = "match_statistic" | "player_statistic" | "team_aggregate" | "threshold";
export type StatisticAggregation = "total" | "per_team" | "per_player" | "difference" | "average";

export interface StatisticsQuery {
  queryType: StatisticQueryType;
  statisticType: StatisticType;
  entities: {
    match?: {
      homeTeam?: string;
      awayTeam?: string;
      date?: Date;
      competition?: string;
      matchId?: string;
    };
    team?: string;
    player?: string;
    competition?: string;
  };
  aggregation?: StatisticAggregation;
  period?: StatisticPeriod;
  threshold?: number;
  comparator?: ">" | ">=" | "<" | "<=" | "=";
  eventEndTime?: Date;
  canResolveNow: boolean;
  rawText: string;
}

export interface StatisticConsensus {
  statisticType: StatisticType;
  agreed: boolean;
  agreedValue: number | null;
  unit: StatisticUnit;
  agreementCount: number;
  variance: number;
  outliers: Array<{ source: string; value: number }>;
  tier1Count: number;
  statsProviderCount: number;
  officialSourcePresent: boolean;
  bettingMarketAlignment: boolean;
  supportingSources: StatisticSource[];
}

export interface StatisticValidationResult {
  valid: boolean;
  warnings: string[];
  reason?: string;
}

export interface StatisticsValidationSummary {
  withinRange: boolean;
  logicallyConsistent: boolean;
  warnings: string[];
  invalidSources: string[];
}

export interface StatisticsConfidenceFactors {
  officialStatsProviderAgreement: number;
  officialLeagueAPIAgreement: number;
  totalSourceAgreement: number;
  bettingMarketAlignment: number;
  lowVariance: number;
  dataFreshnessScore: number;
  adjustments: Array<{ reason: string; multiplier: number }>;
}

export interface StatisticsConsensusOutput {
  consensus: StatisticConsensus;
  normalizedStatistics: NormalizedStatistic[];
  validation: StatisticsValidationSummary;
  confidence: number;
}

export interface StatisticProviderResponse {
  provider: string;
  tier: number;
  weight: number;
  collectedAt: Date;
  payload: unknown;
  meta?: Record<string, unknown>;
}

export interface StatisticsResolutionState {
  query: StatisticsQuery;
  providerResponses: StatisticProviderResponse[];
  rawStatistics: Array<{ provider: string; tier: number; data: unknown }>;
  normalizedStatistics: NormalizedStatistic[];
  validation: StatisticsValidationSummary | null;
  consensus: StatisticConsensus | null;
  confidence: number | null;
  resolutionText: string | null;
  errors: string[];
  warnings: string[];
}

export interface StatisticsResolutionArtifacts {
  providers: StatisticProviderResponse[];
  normalizedStatistics: NormalizedStatistic[];
  validation: StatisticsValidationSummary | null;
  consensus: StatisticConsensus | null;
  confidence: number | null;
  errors: string[];
  warnings: string[];
}

export interface StatisticsResolutionEvidence extends EvidencePayload {
  data: EvidencePayload["data"] & {
    statistics: StatisticsResolutionArtifacts;
  };
}

export interface StatisticsResolutionResult extends ResolutionResult {
  evidence: StatisticsResolutionEvidence;
}
