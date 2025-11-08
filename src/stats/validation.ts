import { NormalizedStatistic, StatisticType, StatisticsValidationSummary, StatisticValidationResult } from "./types";

interface RangeRule {
  min: number;
  max: number;
  typical: [number, number];
}

const RANGE_RULES: Partial<Record<StatisticType, RangeRule>> = {
  yellow_cards: { min: 0, max: 15, typical: [0, 8] },
  red_cards: { min: 0, max: 4, typical: [0, 1] },
  total_cards: { min: 0, max: 20, typical: [2, 12] },
  corners: { min: 0, max: 30, typical: [3, 12] },
  shots_on_target: { min: 0, max: 40, typical: [2, 15] },
  shots_total: { min: 0, max: 60, typical: [5, 30] },
  fouls: { min: 0, max: 40, typical: [8, 20] },
  possession: { min: 0, max: 100, typical: [30, 70] },
  goals: { min: 0, max: 15, typical: [0, 5] },
  assists: { min: 0, max: 15, typical: [0, 5] },
  saves: { min: 0, max: 30, typical: [0, 15] },
  tackles: { min: 0, max: 30, typical: [0, 20] },
  interceptions: { min: 0, max: 25, typical: [0, 15] },
  passes: { min: 0, max: 1200, typical: [200, 900] },
  pass_accuracy: { min: 0, max: 100, typical: [60, 95] },
  rebounds_total: { min: 0, max: 120, typical: [60, 100] },
  rebounds_offensive: { min: 0, max: 60, typical: [10, 35] },
  rebounds_defensive: { min: 0, max: 60, typical: [30, 70] },
  turnovers: { min: 0, max: 40, typical: [5, 20] },
  three_pointers_made: { min: 0, max: 35, typical: [5, 20] },
  three_pointers_attempted: { min: 0, max: 70, typical: [10, 45] },
  free_throws_made: { min: 0, max: 60, typical: [10, 35] },
  free_throws_attempted: { min: 0, max: 80, typical: [15, 45] },
  minutes_played: { min: 0, max: 300, typical: [80, 180] },
  penalties: { min: 0, max: 25, typical: [0, 10] },
  penalty_yards: { min: 0, max: 300, typical: [20, 120] },
  sacks: { min: 0, max: 20, typical: [0, 10] },
  time_of_possession: { min: 0, max: 100, typical: [35, 65] },
  third_down_conversions: { min: 0, max: 25, typical: [3, 15] },
  red_zone_efficiency: { min: 0, max: 100, typical: [30, 80] }
};

const LOGICAL_RULES: Array<(stats: NormalizedStatistic[]) => string | null> = [
  (stats) => {
    const shotsOnTarget = findValue(stats, "shots_on_target");
    const shotsTotal = findValue(stats, "shots_total");
    if (shotsOnTarget !== null && shotsTotal !== null && shotsOnTarget > shotsTotal) {
      return "shots_on_target cannot exceed shots_total";
    }
    return null;
  },
  (stats) => {
    const goals = findValue(stats, "goals");
    const shotsOnTarget = findValue(stats, "shots_on_target");
    if (goals !== null && shotsOnTarget !== null && goals > shotsOnTarget) {
      return "goals cannot exceed shots_on_target";
    }
    return null;
  },
  (stats) => {
    const yellow = findValue(stats, "yellow_cards");
    const red = findValue(stats, "red_cards");
    const total = findValue(stats, "total_cards");
    if (total !== null && yellow !== null && red !== null && yellow + red !== total) {
      return "yellow_cards + red_cards should equal total_cards";
    }
    return null;
  },
  (stats) => {
    const possession = stats.filter((stat) => stat.type === "possession");
    if (possession.length === 2) {
      const sum = possession.reduce((acc, stat) => acc + stat.value, 0);
      if (Math.abs(sum - 100) > 2) {
        return "Team possession values should sum to approximately 100";
      }
    }
    return null;
  }
];

function findValue(stats: NormalizedStatistic[], type: StatisticType): number | null {
  const entry = stats.find((stat) => stat.type === type);
  return entry ? entry.value : null;
}

export function validateStatistic(stat: NormalizedStatistic): StatisticValidationResult {
  const rules = RANGE_RULES[stat.type];
  if (!rules) {
    return { valid: true, warnings: ["No validation rules defined for this statistic"] };
  }

  if (stat.value < rules.min || stat.value > rules.max) {
    return {
      valid: false,
      reason: `Value ${stat.value} outside valid range [${rules.min}, ${rules.max}]`,
      warnings: []
    };
  }

  const warnings: string[] = [];
  if (stat.value < rules.typical[0] || stat.value > rules.typical[1]) {
    warnings.push(
      `Unusual value ${stat.value} for ${stat.type} (typical range ${rules.typical[0]}-${rules.typical[1]})`
    );
  }

  return { valid: true, warnings };
}

export function summarizeValidation(stats: NormalizedStatistic[]): StatisticsValidationSummary {
  const results = stats.map((stat) => ({ stat, result: validateStatistic(stat) }));
  const invalidSources = results
    .filter(({ result }) => !result.valid)
    .map(({ stat }) => (stat.sources[0]?.source ?? "unknown"));

  const warnings = results.flatMap(({ result }) => result.warnings);

  const logicalWarnings = LOGICAL_RULES.map((rule) => rule(stats)).filter((message): message is string => message !== null);

  return {
    withinRange: invalidSources.length === 0,
    logicallyConsistent: logicalWarnings.length === 0,
    warnings: [...warnings, ...logicalWarnings],
    invalidSources
  } satisfies StatisticsValidationSummary;
}
