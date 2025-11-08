import {
  NormalizedStatistic,
  StatisticConsensus,
  StatisticSource,
  StatisticsConfidenceFactors,
  StatisticsValidationSummary
} from "./types";

export interface ConfidenceComputationResult {
  score: number;
  factors: StatisticsConfidenceFactors;
}

export function computeConfidenceScore(
  consensus: StatisticConsensus | null,
  normalized: NormalizedStatistic[],
  validation: StatisticsValidationSummary | null
): ConfidenceComputationResult {
  const sources = gatherSources(normalized);
  const officialStatsProviderAgreement = consensus && consensus.statsProviderCount > 0 ? 1 : 0;
  const officialLeagueAPIAgreement = consensus && consensus.tier1Count > 0 ? 1 : 0;

  const agreementDenominator = Math.max(3, sources.length);
  const totalSourceAgreement = consensus ? Math.min(1, consensus.agreementCount / agreementDenominator) : 0;
  const bettingMarketAlignment = consensus?.bettingMarketAlignment ? 1 : 0;
  const varianceThreshold = consensus?.unit === "percentage" ? 4 : 1;
  const normalizedVariance = consensus ? consensus.variance / varianceThreshold : 0;
  const lowVariance = consensus ? clamp01(1 - Math.min(1, normalizedVariance)) : 0;
  const dataFreshnessScore = computeFreshnessScore(sources);

  let score =
    officialStatsProviderAgreement * 0.4 +
    officialLeagueAPIAgreement * 0.25 +
    totalSourceAgreement * 0.15 +
    bettingMarketAlignment * 0.1 +
    lowVariance * 0.05 +
    dataFreshnessScore * 0.05;

  const adjustments: StatisticsConfidenceFactors["adjustments"] = [];

  if (consensus && consensus.variance > 2) {
    score *= 0.8;
    adjustments.push({ reason: "High variance", multiplier: 0.8 });
  }

  if (consensus && consensus.outliers.length > 1) {
    score *= 0.9;
    adjustments.push({ reason: "Multiple outliers", multiplier: 0.9 });
  }

  if (validation?.warnings?.some((warning) => warning.startsWith("Unusual value"))) {
    score *= 0.95;
    adjustments.push({ reason: "Unusual statistic value", multiplier: 0.95 });
  }

  score = clamp01(score);

  return {
    score,
    factors: {
      officialStatsProviderAgreement,
      officialLeagueAPIAgreement,
      totalSourceAgreement,
      bettingMarketAlignment,
      lowVariance,
      dataFreshnessScore,
      adjustments
    }
  } satisfies ConfidenceComputationResult;
}

function computeFreshnessScore(sources: StatisticSource[]): number {
  if (sources.length === 0) {
    return 0;
  }
  const now = Date.now();
  const ages = sources
    .map((source) => source.timestamp)
    .filter((timestamp): timestamp is Date => timestamp instanceof Date)
    .map((timestamp) => (now - timestamp.getTime()) / (1000 * 60));

  if (ages.length === 0) {
    return 0.5;
  }

  const averageAgeMinutes = ages.reduce((sum, age) => sum + age, 0) / ages.length;
  if (averageAgeMinutes <= 15) {
    return 1;
  }
  if (averageAgeMinutes <= 60) {
    return 0.8;
  }
  if (averageAgeMinutes <= 180) {
    return 0.6;
  }
  if (averageAgeMinutes <= 720) {
    return 0.4;
  }
  return 0.2;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function gatherSources(normalized: NormalizedStatistic[]): StatisticSource[] {
  return normalized.flatMap((stat) => stat.sources);
}
