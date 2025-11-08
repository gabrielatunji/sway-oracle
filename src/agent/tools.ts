import { z } from "zod";
import { DynamicStructuredTool } from "@langchain/core/tools";
import {
  fetchApiSportsSoccer,
  fetchTheOddsScores
} from "../data/sports-apis";
import { searchSerpApi } from "../data/serp";

const ApiSportsInputSchema = z.object({
  date: z.string().regex(/\d{4}-\d{2}-\d{2}/).optional(),
  team: z.string().optional(),
  homeTeam: z.string().optional(),
  awayTeam: z.string().optional()
});
export const ApiSportsSoccerTool = new DynamicStructuredTool({
  name: "apisports_soccer_tool",
  description: "Call API-Sports soccer endpoint for fixtures and results.",
  schema: ApiSportsInputSchema,
  func: async ({ date, team, homeTeam, awayTeam }: z.infer<typeof ApiSportsInputSchema>) =>
    fetchApiSportsSoccer({ date, team, homeTeam, awayTeam })
});

const SerpApiInputSchema = z.object({
  query: z.string().min(3),
  engine: z.enum(["google", "google_news"]).optional(),
  numResults: z.number().int().min(1).max(20).optional()
});

export const SerpApiTool = new DynamicStructuredTool({
  name: "serp_api_tool",
  description: "Fetch Google search or news results via SerpAPI for corroborating evidence.",
  schema: SerpApiInputSchema,
  func: async ({ query, engine, numResults }: z.infer<typeof SerpApiInputSchema>) =>
    searchSerpApi({ query, engine, numResults })
});

export const AgentTools = [
  ApiSportsSoccerTool,
  TheOddsScoresTool,
  SerpApiTool
];
