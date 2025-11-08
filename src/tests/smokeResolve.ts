import "dotenv/config";

const REQUIRED_API_KEYS = [
  "OPENAI_API_KEY",
  "APISPORTS_KEY",
  "THEODDS_API_KEY",
  "SERPAPI_KEY",
  "OFFICIAL_STATS_API_KEY",
  "OPTA_STATS_API_KEY",
  "STATSBOMB_API_KEY",
  "SPORTSRADAR_API_KEY",
  "GOOGLE_NEWS_API_KEY",
  "NEWS_API_KEY",
  "X_TWITTER_BEARER"
] as const;

const REQUIRED_ENDPOINT_ENV = [
  "OFFICIAL_STATS_BASE_URL",
  "OPTA_STATS_BASE_URL",
  "STATSBOMB_BASE_URL",
  "SPORTSRADAR_BASE_URL",
  "APIFOOTBALL_STATS_BASE_URL",
  "FLASHSCORE_BASE_URL",
  "SOFASCORE_BASE_URL",
  "FOTMOB_BASE_URL",
  "TEAM_REPORTS_BASE_URL",
  "ESPN_API_BASE_URL",
  "BBC_SPORT_API_BASE_URL",
  "GOOGLE_NEWS_API_BASE_URL",
  "NEWS_API_BASE_URL",
  "X_TWITTER_API_BASE_URL",
  "BETTING_AGGREGATOR_BASE_URL",
  "UNDERSTAT_BASE_URL",
  "WHOSCORED_BASE_URL",
  "TRANSFERMARKT_BASE_URL"
] as const;

type ResolutionResultLike = {
  resolution: string;
  confidence: number;
  sources: string[];
  evidence?: {
    data?: {
      agentArtifacts?: Array<Record<string, unknown>>;
      statistics?: {
        providers?: Array<Record<string, unknown>>;
        normalizedStatistics?: Array<Record<string, unknown>>;
        validation?: Record<string, unknown> | null;
        consensus?: Record<string, unknown> | null;
        confidence?: number | null;
        errors?: string[];
        warnings?: string[];
      };
    };
  };
};

const QUERIES: string[] = [
  "What was the score of the Denver Broncos vs Las Vegas Raiders game on November 6, 2025?",
  "How many yellow cards did Manchester United receive against Liverpool on 2024-11-07?",
  "Total corners recorded in Arsenal vs Chelsea on 2024-11-05",
  "Did the Real Madrid vs Barcelona match on 2024-10-26 finish with more than 8 total cards?",
  "Did Chicago Bears receiver Rome Odunze respond to his father's social media comments on November 6, 2025?",
  "Did Florida center Olivier Rioux make his college basketball debut on November 6, 2025?",
  "Did boxing champion Claressa Shields sign an $8 million promotional contract in November 2025?"
];

function preview(value: unknown, max = 400): string {
  try {
    const json = JSON.stringify(
      value,
      (_key, inner) => {
        if (typeof inner === "string" && inner.length > 200) {
          return `${inner.slice(0, 200)}…`;
        }
        return inner;
      },
      2
    );
    return json.length > max ? `${json.slice(0, max)}…` : json;
  } catch {
    return String(value);
  }
}

function missingEnvVars(keys: readonly string[]): string[] {
  return keys.filter((key) => {
    const value = process.env[key];
    return !value || value.trim().length === 0;
  });
}

function extractAgentArtifacts(evidence: ResolutionResultLike["evidence"]): Array<Record<string, unknown>> {
  const data = evidence?.data;
  return Array.isArray(data?.agentArtifacts) ? data.agentArtifacts : [];
}

function extractStatisticsArtifacts(evidence: ResolutionResultLike["evidence"]): Record<string, unknown> | null {
  const stats = evidence?.data?.statistics;
  if (!stats) {
    return null;
  }

  return {
    providers: stats.providers ?? [],
    consensus: stats.consensus ?? null,
    validation: stats.validation ?? null,
    confidence: stats.confidence ?? null,
    warnings: stats.warnings ?? [],
    errors: stats.errors ?? []
  };
}

function logArtifacts(artifacts: Array<Record<string, unknown>>): void {
  if (artifacts.length === 0) {
    console.log("  Tool calls: <none recorded>");
    return;
  }

  console.log("  Tool calls:");
  for (const artifact of artifacts) {
    const tool = typeof artifact.tool === "string" ? artifact.tool : "<unknown>";
    const error = typeof artifact.error === "string" ? artifact.error : null;
    const output = artifact.output ?? artifact.error ?? null;
    console.log(`    - ${tool}`);
    if (artifact.input !== undefined) {
      console.log("      input:", preview(artifact.input));
    }
    if (error) {
      console.log("      error:", error);
    } else if (output !== null) {
      console.log("      output:", preview(output));
    }
  }
}

function logSuccess(result: ResolutionResultLike, startedAt: number): void {
  const elapsed = ((Date.now() - startedAt) * 0.001).toFixed(1);
  console.log("  Resolution:", result.resolution);
  console.log("  Confidence:", result.confidence.toFixed(2));
  console.log("  Sources:", result.sources.slice(0, 3).join(", ") || "<none>");
  logArtifacts(extractAgentArtifacts(result.evidence));
  const statistics = extractStatisticsArtifacts(result.evidence);
  if (statistics) {
    console.log("  Statistics consensus:", preview(statistics.consensus));
    console.log("  Statistics confidence:", statistics.confidence ?? "<unknown>");
    const providerCount = Array.isArray(statistics.providers) ? statistics.providers.length : 0;
    console.log("  Statistics providers:", providerCount);
    const statWarnings = Array.isArray(statistics.warnings) ? statistics.warnings : [];
    const statErrors = Array.isArray(statistics.errors) ? statistics.errors : [];
    if (statWarnings.length > 0) {
      console.log("  Statistics warnings:", statWarnings.join(" | "));
    }
    if (statErrors.length > 0) {
      console.log("  Statistics errors:", statErrors.join(" | "));
    }
  }
  console.log("  Responded in", elapsed, "seconds\n");
}

function logFailure(error: unknown, startedAt: number): void {
  const elapsed = ((Date.now() - startedAt) * 0.001).toFixed(1);
  console.error("  Failed after", elapsed, "seconds:");
  console.error("  ", error instanceof Error ? error.message : String(error));
  if (process.env.DEBUG === "true" && error instanceof Error && error.stack) {
    console.error(error.stack);
  }
  console.log();
}

async function processQuery(resolveQueryFn: (query: string) => Promise<ResolutionResultLike>, query: string): Promise<void> {
  console.log("Query:", query);
  const startedAt = Date.now();
  try {
    const result = await resolveQueryFn(query);
    logSuccess(result, startedAt);
  } catch (error) {
    logFailure(error, startedAt);
  }
}

async function main(): Promise<void> {
  const missingApiKeys = missingEnvVars(REQUIRED_API_KEYS);
  const missingEndpoints = missingEnvVars(REQUIRED_ENDPOINT_ENV);

  if (missingApiKeys.length > 0 || missingEndpoints.length > 0) {
    if (missingApiKeys.length > 0) {
      console.error("Missing required API keys:", missingApiKeys.join(", "));
    }
    if (missingEndpoints.length > 0) {
      console.error("Missing required statistics endpoint configuration:", missingEndpoints.join(", "));
    }
    console.error("Ensure your .env mirrors .env.example before running this test.");
    process.exitCode = 1;
    return;
  }

  const dbModule = await import("../db");
  if (process.env.SMOKE_SKIP_DB_LOGGING !== "false") {
    Object.assign(dbModule, {
      logResolution: async (): Promise<void> => {}
    });
  }

  const { resolveQuery } = (await import("../resolver")) as { resolveQuery: (query: string) => Promise<ResolutionResultLike> };

  console.log("Running sports oracle smoke test with", QUERIES.length, "queries...\n");
  for (const query of QUERIES) {
    await processQuery(resolveQuery, query);
  }

  console.log("Smoke test complete.");
}

// eslint-disable-next-line unicorn/prefer-top-level-await
main().catch((error) => {
  console.error("Smoke test crashed:", error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
});
