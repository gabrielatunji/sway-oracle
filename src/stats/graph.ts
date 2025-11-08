import pLimit from "p-limit";
import { StateGraph } from "@langchain/langgraph";
import {
  StatisticsResolutionState,
  StatisticsQuery,
  StatisticProviderResponse,
  StatisticsResolutionArtifacts
} from "./types";
import { StatisticsTools, buildToolInputsFromQuery } from "./tools";
import { deriveNormalizedStatistics } from "./normalization";
import { summarizeValidation } from "./validation";
import { computeStatisticConsensus } from "./consensus";
import { computeConfidenceScore } from "./confidence";

const limit = pLimit(4);

type GraphChannels = {
  state: StatisticsResolutionState;
};

export function buildStatisticsGraph(): StateGraph<GraphChannels> {
  const builder = new StateGraph<GraphChannels>({
    channels: {
      state: {
        default: () => ({} as StatisticsResolutionState)
      }
    }
  }) as unknown as StateGraph<GraphChannels> & {
    addNode: (...args: any[]) => ReturnType<StateGraph<GraphChannels>["addNode"]>;
    addEdge: (...args: any[]) => ReturnType<StateGraph<GraphChannels>["addEdge"]>;
  };

  builder.addNode("fetch_providers", async ({ state }: { state: StatisticsResolutionState }) => {
    const query = state.query;
    const toolInput = buildToolInputsFromQuery(query);
    const tools = selectTools(query);

    const results = await Promise.all(
      tools.map((tool) =>
        limit(async () => {
          try {
            const response = await tool.invoke(toolInput as never);
            if (response && typeof response === "object" && "skipped" in response) {
              return { warning: `${tool.name} skipped: ${(response as { reason?: string }).reason ?? "not configured"}` };
            }
            return { response: response as StatisticProviderResponse };
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return { error: `${tool.name} failed: ${message}` };
          }
        })
      )
    );

    const providerResponses = results
      .map((result) => result.response)
      .filter(isStatisticProviderResponse);
    const errors = results
      .map((result) => result.error)
      .filter((value): value is string => typeof value === "string");
    const warnings = results
      .map((result) => result.warning)
      .filter((value): value is string => typeof value === "string");

    return {
      state: {
        ...state,
        providerResponses: [...state.providerResponses, ...providerResponses],
        warnings: [...state.warnings, ...warnings],
        errors: [...state.errors, ...errors]
      }
    } satisfies GraphChannels;
  });

  builder.addNode("normalize", ({ state }: { state: StatisticsResolutionState }) => {
    const normalized = deriveNormalizedStatistics(state.providerResponses, state.query);
    return {
      state: {
        ...state,
        normalizedStatistics: normalized
      }
    } satisfies GraphChannels;
  });

  builder.addNode("validate", ({ state }: { state: StatisticsResolutionState }) => {
    const validation = summarizeValidation(state.normalizedStatistics);
    return {
      state: {
        ...state,
        validation
      }
    } satisfies GraphChannels;
  });

  builder.addNode("consensus", ({ state }: { state: StatisticsResolutionState }) => {
    const consensus = computeStatisticConsensus(state.normalizedStatistics, state.query);
    return {
      state: {
        ...state,
        consensus
      }
    } satisfies GraphChannels;
  });

  builder.addNode("confidence", ({ state }: { state: StatisticsResolutionState }) => {
    const { score } = computeConfidenceScore(state.consensus, state.normalizedStatistics, state.validation);
    return {
      state: {
        ...state,
        confidence: score
      }
    } satisfies GraphChannels;
  });

  builder.addEdge("__start__", "fetch_providers");
  builder.addEdge("fetch_providers", "normalize");
  builder.addEdge("normalize", "validate");
  builder.addEdge("validate", "consensus");
  builder.addEdge("consensus", "confidence");
  builder.addEdge("confidence", "__end__");

  return builder;
}

export async function runStatisticsGraph(initialState: StatisticsResolutionState): Promise<StatisticsResolutionArtifacts> {
  const graph = buildStatisticsGraph();
  const app = graph.compile();
  const result = await app.invoke({ state: initialState });
  const finalState = result.state;

  return {
    providers: finalState.providerResponses,
    normalizedStatistics: finalState.normalizedStatistics,
    validation: finalState.validation,
    consensus: finalState.consensus,
    confidence: finalState.confidence,
    errors: finalState.errors,
    warnings: finalState.warnings
  } satisfies StatisticsResolutionArtifacts;
}

function selectTools(query: StatisticsQuery) {
  const baseTools = compactTools([
    StatisticsTools[0],
    StatisticsTools[1],
    StatisticsTools[2],
    StatisticsTools[3],
    StatisticsTools[4]
  ]);

  const sportSpecific: Array<(typeof StatisticsTools)[number]> = [];

  const competition = query.entities.match?.competition?.toLowerCase();
  if (
    competition?.includes("soccer") ||
    competition?.includes("football") ||
    query.statisticType.includes("goal") ||
    query.statisticType.includes("corner")
  ) {
    sportSpecific.push(
      ...compactTools([
        StatisticsTools[5],
        StatisticsTools[6],
        StatisticsTools[7],
        StatisticsTools[8],
        StatisticsTools[15],
        StatisticsTools[16],
        StatisticsTools[17]
      ])
    );
  }

  const generalTools = compactTools([
    StatisticsTools[9],
    StatisticsTools[10],
    StatisticsTools[11],
    StatisticsTools[12],
    StatisticsTools[13],
    StatisticsTools[14],
    StatisticsTools[18]
  ]);

  return [...baseTools, ...sportSpecific, ...generalTools];
}

function isStatisticProviderResponse(value: unknown): value is StatisticProviderResponse {
  if (!value || typeof value !== "object") {
    return false;
  }
  return "provider" in value && "payload" in value;
}

function compactTools(tools: Array<(typeof StatisticsTools)[number] | undefined>): Array<(typeof StatisticsTools)[number]> {
  return tools.filter((tool): tool is (typeof StatisticsTools)[number] => tool !== undefined);
}
