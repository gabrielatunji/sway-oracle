import { NormalizedStatistic, StatisticConsensus, StatisticSource, StatisticsQuery } from "./types";

const STATS_PROVIDER_NAMES = new Set(["OPTA_STATS", "STATSBOMB", "SPORTSRADAR"]);

export function computeStatisticConsensus(
  normalized: NormalizedStatistic[],
  query: StatisticsQuery
): StatisticConsensus | null {
  const relevant = normalized.filter((stat) => matchesQuery(stat, query));
  if (relevant.length === 0) {
    return null;
  }

  const sources = flattenSources(relevant);
  const tolerance = relevant[0]?.unit === "percentage" ? 1 : 0;
  const values = relevant.map((stat) => stat.value);
  const { value: agreedValue, agreementCount } = findConsensusValue(values, tolerance);
  const variance = calculateVariance(values);
  const outliers = relevant
    .filter((stat) => Math.abs(stat.value - agreedValue) > tolerance)
    .map((stat) => ({ source: stat.sources[0]?.source ?? "unknown", value: stat.value }));

  const tier1Count = sources.filter((source) => source.tier === 1).length;
  const statsProviderCount = sources.filter((source) => STATS_PROVIDER_NAMES.has(source.source)).length;
  const officialSourcePresent = tier1Count > 0;
  const bettingMarketAlignment = sources.some((source) => /BETTING|ODDS|SETTLEMENT/i.test(source.source));

  const agreed = agreementCount >= 3 && statsProviderCount >= 1 && variance <= (relevant[0]?.unit === "percentage" ? 4 : 1);

  return {
    statisticType: query.statisticType,
    agreed,
    agreedValue: Number.isFinite(agreedValue) ? agreedValue : null,
    unit: relevant[0]?.unit ?? "count",
    agreementCount,
    variance,
    outliers,
    tier1Count,
    statsProviderCount,
    officialSourcePresent,
    bettingMarketAlignment,
    supportingSources: sources
  } satisfies StatisticConsensus;
}

function matchesQuery(stat: NormalizedStatistic, query: StatisticsQuery): boolean {
  if (stat.type !== query.statisticType) {
    return false;
  }
  if (query.entities.team && stat.team && stat.team !== query.entities.team) {
    return false;
  }
  if (query.entities.player && stat.player && stat.player !== query.entities.player) {
    return false;
  }
  return true;
}

function flattenSources(stats: NormalizedStatistic[]): StatisticSource[] {
  return stats.flatMap((stat) => stat.sources);
}

function findConsensusValue(values: number[], tolerance: number): { value: number; agreementCount: number } {
  if (values.length === 0) {
    return { value: Number.NaN, agreementCount: 0 };
  }
  let bestValue = values[0];
  let bestCount = 1;
  for (const value of values) {
    const count = values.filter((candidate) => Math.abs(candidate - value) <= tolerance).length;
    if (count > bestCount || (count === bestCount && value < bestValue)) {
      bestCount = count;
      bestValue = value;
    }
  }
  return { value: bestValue, agreementCount: bestCount };
}

function calculateVariance(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const squaredDiff = values.map((value) => (value - mean) ** 2);
  return squaredDiff.reduce((sum, value) => sum + value, 0) / values.length;
}
