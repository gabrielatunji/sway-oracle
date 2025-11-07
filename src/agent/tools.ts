import { z } from "zod";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { fetchRssItems } from "../data/rss";
import {
  fetchTheSportsDb,
  fetchApiSportsSoccer,
  fetchApiSportsBasketball,
  fetchTheOddsScores
} from "../data/sports-apis";

const RssInputSchema = z.object({
  feeds: z.array(z.string()).optional(),
  limitPerFeed: z.number().int().min(1).max(20).optional()
});

export const RssTool = new DynamicStructuredTool({
  name: "rss_tool",
  description: "Fetch recent sports headlines from RSS feeds to corroborate sports outcomes.",
  schema: RssInputSchema,
  func: async ({ feeds, limitPerFeed }: z.infer<typeof RssInputSchema>) => {
    return fetchRssItems(feeds, limitPerFeed ?? 10);
  }
});

const TheSportsDbInputSchema = z.object({
  team: z.string().optional(),
  date: z.string().regex(/\d{4}-\d{2}-\d{2}/).optional()
});
export const TheSportsDbTool = new DynamicStructuredTool({
  name: "thesportsdb_tool",
  description: "Query TheSportsDB for match results by team and/or date.",
  schema: TheSportsDbInputSchema,
  func: async ({ team, date }: z.infer<typeof TheSportsDbInputSchema>) => fetchTheSportsDb({ team, date })
});

const ApiSportsInputSchema = z.object({
  date: z.string().regex(/\d{4}-\d{2}-\d{2}/).optional(),
  team: z.string().optional()
});
export const ApiSportsSoccerTool = new DynamicStructuredTool({
  name: "apisports_soccer_tool",
  description: "Call API-Sports soccer endpoint for fixtures and results.",
  schema: ApiSportsInputSchema,
  func: async ({ date, team }: z.infer<typeof ApiSportsInputSchema>) => fetchApiSportsSoccer({ date, team })
});

export const ApiSportsBasketballTool = new DynamicStructuredTool({
  name: "apisports_basketball_tool",
  description: "Call API-Sports basketball endpoint for game results.",
  schema: ApiSportsInputSchema,
  func: async ({ date, team }: z.infer<typeof ApiSportsInputSchema>) => fetchApiSportsBasketball({ date, team })
});

const TheOddsInputSchema = z.object({
  date: z.string().regex(/\d{4}-\d{2}-\d{2}/).optional()
});
export const TheOddsScoresTool = new DynamicStructuredTool({
  name: "theodds_scores_tool",
  description: "Query The Odds API for NBA scores.",
  schema: TheOddsInputSchema,
  func: async ({ date }: z.infer<typeof TheOddsInputSchema>) => fetchTheOddsScores({ date })
});

export const AgentTools = [
  RssTool,
  TheSportsDbTool,
  ApiSportsSoccerTool,
  ApiSportsBasketballTool,
  TheOddsScoresTool
];
