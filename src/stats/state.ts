import {
  StatisticsResolutionState,
  StatisticsQuery,
  StatisticProviderResponse,
  NormalizedStatistic,
  StatisticsValidationSummary,
  StatisticConsensus
} from "./types";

export function createInitialStatisticsState(query: StatisticsQuery): StatisticsResolutionState {
  return {
    query,
    providerResponses: [],
    rawStatistics: [],
    normalizedStatistics: [],
    validation: null,
    consensus: null,
    confidence: null,
    resolutionText: null,
    errors: [],
    warnings: []
  } satisfies StatisticsResolutionState;
}

export function appendProviderResponse(
  state: StatisticsResolutionState,
  response: StatisticProviderResponse
): StatisticsResolutionState {
  return {
    ...state,
    providerResponses: [...state.providerResponses, response]
  };
}

export function appendRawStatistic(
  state: StatisticsResolutionState,
  raw: { provider: string; tier: number; data: unknown }
): StatisticsResolutionState {
  return {
    ...state,
    rawStatistics: [...state.rawStatistics, raw]
  };
}

export function setNormalizedStatistics(
  state: StatisticsResolutionState,
  normalized: NormalizedStatistic[]
): StatisticsResolutionState {
  return {
    ...state,
    normalizedStatistics: normalized
  };
}

export function setValidation(
  state: StatisticsResolutionState,
  validation: StatisticsValidationSummary
): StatisticsResolutionState {
  return {
    ...state,
    validation
  };
}

export function setConsensus(
  state: StatisticsResolutionState,
  consensus: StatisticConsensus | null
): StatisticsResolutionState {
  return {
    ...state,
    consensus
  };
}

export function setConfidence(
  state: StatisticsResolutionState,
  confidence: number
): StatisticsResolutionState {
  return {
    ...state,
    confidence
  };
}

export function addWarning(state: StatisticsResolutionState, warning: string): StatisticsResolutionState {
  return {
    ...state,
    warnings: [...state.warnings, warning]
  };
}

export function addError(state: StatisticsResolutionState, error: string): StatisticsResolutionState {
  return {
    ...state,
    errors: [...state.errors, error]
  };
}

export function finalizeResolutionText(state: StatisticsResolutionState, text: string): StatisticsResolutionState {
  return {
    ...state,
    resolutionText: text
  };
}
