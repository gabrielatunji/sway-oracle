import { describe, expect, it } from "vitest";
import { deriveNormalizedStatistics } from "../../stats/normalization";
import { StatisticProviderResponse, StatisticsQuery } from "../../stats/types";

const QUERY: StatisticsQuery = {
  queryType: "match_statistic",
  statisticType: "shots_on_target",
  entities: {
    match: {
      homeTeam: "England",
      awayTeam: "France",
      date: new Date("2024-07-10T20:00:00Z")
    }
  },
  aggregation: "total",
  period: "full_time",
  rawText: "Total shots on target by both teams in England vs France",
  eventEndTime: new Date("2024-07-10T20:00:00Z"),
  canResolveNow: true
};

describe("deriveNormalizedStatistics", () => {
  it("extracts statistics from structured provider payloads", () => {
    const provider: StatisticProviderResponse = {
      provider: "OPTA_STATS",
      tier: 1,
      weight: 0.45,
      collectedAt: new Date(),
      payload: {
        statistics: [
          { type: "shots_on_target", value: 8 },
          { type: "shots_total", value: 18 }
        ]
      },
      meta: {}
    };

    const normalized = deriveNormalizedStatistics([provider], QUERY);
    const stat = normalized.find((entry) => entry.type === "shots_on_target");
    expect(stat).toBeDefined();
    expect(stat?.value).toBe(8);
    expect(stat?.sources[0]?.source).toBe("OPTA_STATS");
  });

  it("parses textual payloads when extracting statistics", () => {
    const provider: StatisticProviderResponse = {
      provider: "NEWS_API",
      tier: 3,
      weight: 0.25,
      collectedAt: new Date(),
      payload: {
        text: "The match ended with 8 shots on target shared equally."
      },
      meta: {}
    };

    const normalized = deriveNormalizedStatistics([provider], QUERY);
    expect(normalized.some((entry) => entry.type === "shots_on_target" && entry.value === 8)).toBe(true);
  });
});
