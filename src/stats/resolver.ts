import { QueryMetadata } from "../utils";
import {
  StatisticsQuery,
  StatisticsResolutionResult,
  StatisticsResolutionEvidence,
  StatisticConsensus,
  StatisticsResolutionState
} from "./types";
import { createInitialStatisticsState } from "./state";
import { runStatisticsGraph } from "./graph";

export async function resolveStatisticsQuery(
  rawQuery: string,
  statsQuery: StatisticsQuery,
  metadata: QueryMetadata
): Promise<StatisticsResolutionResult> {
  const initialState = createInitialStatisticsState(statsQuery);
  const artifacts = await runStatisticsGraph(initialState);
  const consensus = artifacts.consensus;
  const confidence = artifacts.confidence ?? 0.15;

  const resolution = buildResolution(consensus, statsQuery);
  const reasoning = buildReasoning(consensus, statsQuery, artifacts.validation?.warnings ?? [], artifacts.errors);
  const sources = selectSources(consensus, artifacts.providers);

  const evidence: StatisticsResolutionEvidence = {
    metadata,
    data: {
      query: rawQuery,
      statistics: artifacts
    },
    errors: artifacts.errors
  } as StatisticsResolutionEvidence;

  return {
    resolution,
    confidence,
    reasoning,
    sources,
    evidence
  } satisfies StatisticsResolutionResult;
}

function buildResolution(consensus: StatisticConsensus | null, query: StatisticsQuery): string {
  const agreedValue = consensus?.agreedValue;
  if (agreedValue === null || agreedValue === undefined || Number.isNaN(agreedValue)) {
    return "insufficient_data";
  }

  if (query.queryType === "threshold" && query.threshold !== undefined && query.comparator) {
    const decision = evaluateThreshold(agreedValue, query.comparator, query.threshold);
    return decision ? "yes" : "no";
  }

  const unitSuffix = consensus?.unit === "percentage" ? "%" : "";
  return `${query.statisticType}:${agreedValue}${unitSuffix}`;
}

function evaluateThreshold(value: number, comparator: Required<StatisticsQuery>["comparator"], threshold: number): boolean {
  switch (comparator) {
    case ">":
      return value > threshold;
    case ">=":
      return value >= threshold;
    case "<":
      return value < threshold;
    case "<=":
      return value <= threshold;
    case "=":
      return value === threshold;
    default:
      return false;
  }
}

function buildReasoning(
  consensus: StatisticConsensus | null,
  query: StatisticsQuery,
  validationWarnings: string[],
  errors: string[]
): string {
  if (!consensus) {
    return "No consensus reached across statistics providers.";
  }

  const base = `Consensus value for ${query.statisticType} is ${consensus.agreedValue} based on ${consensus.agreementCount} sources.`;
  const tierInfo = ` Tier-1 sources: ${consensus.tier1Count}, stats providers: ${consensus.statsProviderCount}.`;
  const warningText = validationWarnings.length > 0 ? ` Warnings: ${validationWarnings.join("; ")}.` : "";
  const errorText = errors.length > 0 ? ` Data quality notes: ${errors.join("; ")}.` : "";
  return `${base}${tierInfo}${warningText}${errorText}`.trim();
}

function selectSources(consensus: StatisticConsensus | null, providers: StatisticsResolutionState["providerResponses"]): string[] {
  if (consensus) {
    return consensus.supportingSources.map((source) => source.source).slice(0, 8);
  }
  return providers.map((provider) => provider.provider).slice(0, 8);
}
