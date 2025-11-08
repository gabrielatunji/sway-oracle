import pLimit from "p-limit";
import { ChatOpenAI } from "@langchain/openai";
import {
  AgentTools,
  ApiSportsSoccerTool,
  TheOddsScoresTool,
  SerpApiTool
} from "./tools";
import { buildSystemPrompt } from "../llm/prompt";
import { StructuredQuery } from "../parsers/query-schema";

export interface DeepAgentArtifact {
  tool: string;
  input: unknown;
  output?: unknown;
  error?: string;
  startedAt: string;
  finishedAt: string;
}

interface RunDeepAgentResult {
  artifacts: DeepAgentArtifact[];
  summary: string;
}

const limit = pLimit(3);

export async function runDeepAgent(structuredQuery: StructuredQuery, hints?: Record<string, unknown>): Promise<RunDeepAgentResult> {
  const systemPrompt = buildSystemPrompt();

  const model = new ChatOpenAI({
    modelName: "gpt-4o-mini",
    temperature: 0.2,
    maxTokens: 512
  });

  const team = structuredQuery.teams?.[0];

  const serpQuery = (() => {
    if (typeof hints?.originalQuery === "string" && hints.originalQuery.trim().length > 0) {
      return hints.originalQuery;
    }

    const nonEmptyTeams = (structuredQuery.teams ?? []).map((team) => team.trim()).filter((team) => team.length > 0);
    if (nonEmptyTeams.length >= 2) {
      const base = `${nonEmptyTeams[0]} vs ${nonEmptyTeams[1]}`;
      return structuredQuery.date ? `${base} ${structuredQuery.date}` : base;
    }

    if (nonEmptyTeams.length === 1) {
      return structuredQuery.date ? `${nonEmptyTeams[0]} ${structuredQuery.date}` : nonEmptyTeams[0];
    }

    if (structuredQuery.player) {
      return structuredQuery.date ? `${structuredQuery.player} ${structuredQuery.date}` : structuredQuery.player;
    }

    if (structuredQuery.competition) {
      return structuredQuery.competition;
    }

    return undefined;
  })();

  const candidateInputs: Array<{ tool: typeof AgentTools[number]; input: unknown }> = [];

  if (serpQuery) {
    candidateInputs.push({ tool: SerpApiTool, input: { query: serpQuery, engine: "google_news", numResults: 6 } });
  }

  if (team || structuredQuery.date) {
    candidateInputs.push(
      { tool: ApiSportsSoccerTool, input: { team, date: structuredQuery.date ?? undefined } }
    );
  }

  if (structuredQuery.date) {
    candidateInputs.push({ tool: TheOddsScoresTool, input: { date: structuredQuery.date } });
  }

  let selectedInputs = candidateInputs;
  try {
    const planningResponse = await model.invoke([
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `Structured query: ${JSON.stringify(structuredQuery)}. Available tools: ${candidateInputs
          .map((entry) => entry.tool.name)
          .join(", ")}. Return the most relevant tool names as a comma separated list.`
      }
    ]);

    const content = planningResponse.content;
    const rawContent = Array.isArray(content)
      ? content.map((chunk: unknown) => (typeof chunk === "string" ? chunk : "")).join(" ")
      : String(content ?? "");

    const extracted = rawContent.match(/[A-Za-z_]+/g);
    if (extracted && extracted.length > 0) {
      const names = new Set(extracted);
      const filtered = candidateInputs.filter((entry) => names.has(entry.tool.name));
      if (filtered.length > 0) {
        selectedInputs = filtered;
      }
    }
  } catch (error) {
    console.warn("Tool planning failed", error);
  }

  const tasks = selectedInputs.map(({ tool, input }) =>
    limit(async () => {
      const startedAt = new Date().toISOString();
      try {
        // Tools accept heterogeneous structured payloads verified at construction time.
        const output = await tool.invoke(input as never);
        return {
          tool: tool.name,
          input,
          output,
          startedAt,
          finishedAt: new Date().toISOString()
        } satisfies DeepAgentArtifact;
      } catch (error) {
        return {
          tool: tool.name,
          input,
          error: error instanceof Error ? error.message : String(error),
          startedAt,
          finishedAt: new Date().toISOString()
        } satisfies DeepAgentArtifact;
      }
    })
  );

  const artifacts = await Promise.all(tasks);
  const summary = `Queried ${artifacts.length} tools for corroborating evidence.`;
  return { artifacts, summary };
}
