import { describe, expect, it } from "vitest";
import { classifyStatisticsQuery } from "../../stats/queryClassifier";
import { extractQueryMetadata } from "../../utils";

describe("classifyStatisticsQuery", () => {
  it("detects yellow cards threshold query", () => {
    const query = "Did the match have over 8 total cards between Real Madrid and Barcelona?";
    const metadata = extractQueryMetadata(query);
    const result = classifyStatisticsQuery(query, metadata);
    expect(result).not.toBeNull();
    expect(result?.statisticType).toBe("total_cards");
    expect(result?.queryType).toBe("threshold");
    expect(result?.comparator).toBe(">");
    expect(result?.threshold).toBe(8);
  });

  it("extracts match teams from vs phrasing", () => {
    const query = "How many yellow cards did Manchester United vs Liverpool produce?";
    const metadata = extractQueryMetadata(query);
    const result = classifyStatisticsQuery(query, metadata);
    expect(result?.entities.match?.homeTeam).toContain("Manchester United");
    expect(result?.entities.match?.awayTeam).toContain("Liverpool");
  });

  it("returns null for non-statistical queries", () => {
    const query = "Who won the Super Bowl in 2024?";
    const metadata = extractQueryMetadata(query);
    const result = classifyStatisticsQuery(query, metadata);
    expect(result).toBeNull();
  });
});
