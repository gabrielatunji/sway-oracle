import { z } from "zod";
import { extractQueryMetadata, QueryMetadata } from "../utils";

export const StructuredQuerySchema = z.object({
  sport: z.enum(["basketball", "soccer", "general"]),
  date: z.string().regex(/\d{4}-\d{2}-\d{2}/).nullable(),
  teams: z.array(z.string()).min(0).max(4),
  player: z.string().optional(),
  competition: z.string().optional(),
  matchday: z.union([z.string(), z.number()]).optional(),
  questionType: z.enum([
    "did_result_happen",
    "who_won",
    "player_award",
    "scoreline",
    "other"
  ])
});

export type StructuredQuery = z.infer<typeof StructuredQuerySchema>;

const PLAYER_HINTS = ["mvp", "player", "scorer", "assist", "award"];
const COMPETITION_HINTS = ["league", "competition", "tournament", "cup", "finals"];
const SCORE_HINTS = ["score", "scoreline", "final score", "points"];

export function parseQueryToStructuredRequest(query: string, meta?: QueryMetadata): StructuredQuery {
  const metadata = meta ?? extractQueryMetadata(query);
  let sport: StructuredQuery["sport"] = "general";
  if (metadata.sport === "basketball") sport = "basketball";
  if (metadata.sport === "soccer") sport = "soccer";

  const lower = query.toLowerCase();
  const teams = metadata.teams.slice(0, 2);
  const date = metadata.date ?? null;

  let player: string | undefined;
  let competition: string | undefined;
  let matchday: string | number | undefined;

  const playerHint = PLAYER_HINTS.find((hint) => lower.includes(hint));
  if (playerHint) {
    const playerRegex = /player\s*:?\s*([^,\d]+?)(?:\?|$)/i;
    const execMatch = playerRegex.exec(query);
    if (execMatch) {
      player = execMatch[1].trim();
    }
  }

  const competitionRegex = /(?:league|competition|tournament|cup)\s*:?\s*([^,]+?)(?:\?|$)/i;
  const competitionExec = competitionRegex.exec(query);
  if (competitionExec) {
    competition = competitionExec[1].trim();
  }

  const matchdayRegex = /matchday\s*(\d+)/i;
  const matchdayExec = matchdayRegex.exec(query);
  if (matchdayExec) {
    matchday = Number(matchdayExec[1]);
  }

  let questionType: StructuredQuery["questionType"] = "other";
  if (/did\s+.*(win|lose|draw|tie|happen)/i.test(lower)) {
    questionType = "did_result_happen";
  } else if (/who\s+won|winner|victor/.test(lower)) {
    questionType = "who_won";
  } else if (SCORE_HINTS.some((hint) => lower.includes(hint))) {
    questionType = "scoreline";
  } else if (/award|mvp|player\s+of\s+the\s+match|golden\s+boot|top\s+scorer/i.test(lower)) {
    questionType = "player_award";
  }

  const result = StructuredQuerySchema.safeParse({
    sport,
    date,
    teams,
    player,
    competition,
    matchday,
    questionType
  });

  if (!result.success) {
    throw new Error(`Failed to parse query structure: ${JSON.stringify(result.error.format())}`);
  }

  return result.data;
}
