import { describe, expect, it } from "vitest";
import { computeStatisticConsensus } from "../../stats/consensus";
import { NormalizedStatistic, StatisticsQuery } from "../../stats/types";

const BASE_QUERY: StatisticsQuery = {
  queryType: "match_statistic",
  statisticType: "yellow_cards",
  entities: {
    match: {
      homeTeam: "Arsenal",
      awayTeam: "Chelsea",
      date: new Date("2024-11-05T20:00:00Z")
    }
  },
  aggregation: "total",
  period: "full_time",
  eventEndTime: new Date("2024-11-05T20:00:00Z"),
  canResolveNow: true,
  rawText: "Total yellow cards in Arsenal vs Chelsea"
};

describe("computeStatisticConsensus", () => {
  it("identifies consensus when three sources agree", () => {
    const normalized: NormalizedStatistic[] = [
      buildStat("OFFICIAL_LEAGUE_API", 4, 1),
      buildStat("OPTA_STATS", 4, 1),
      buildStat("API_FOOTBALL", 4, 2),
      buildStat("FLASHSCORE", 3, 2)
    ];

    const consensus = computeStatisticConsensus(normalized, BASE_QUERY);
    expect(consensus).not.toBeNull();
    expect(consensus?.agreed).toBe(true);
    expect(consensus?.agreedValue).toBe(4);
    expect(consensus?.agreementCount).toBeGreaterThanOrEqual(3);
    expect(consensus?.outliers).toHaveLength(1);
  });

  it("fails consensus when insufficient agreement", () => {
    const normalized: NormalizedStatistic[] = [
      buildStat("OFFICIAL_LEAGUE_API", 5, 1),
      buildStat("OPTA_STATS", 4, 1),
      buildStat("API_FOOTBALL", 4, 2)
    ];

    const consensus = computeStatisticConsensus(normalized, BASE_QUERY);
    expect(consensus).not.toBeNull();
    expect(consensus?.agreed).toBe(false);
  });
});

function buildStat(source: string, value: number, tier: number): NormalizedStatistic {
  return {
    type: "yellow_cards",
    team: undefined,
    player: undefined,
    match: {
      homeTeam: "Arsenal",
      awayTeam: "Chelsea",
      date: new Date("2024-11-05T20:00:00Z").toISOString()
    },
    value,
    unit: "count",
    period: "full_time",
    aggregation: "total",
    sources: [
      {
        source,
        tier,
        weight: tier === 1 ? 0.45 : 0.3,
        rawValue: value,
        parsedValue: value,
        timestamp: new Date(),
        metadata: {}
      }
    ]
  } satisfies NormalizedStatistic;
}
