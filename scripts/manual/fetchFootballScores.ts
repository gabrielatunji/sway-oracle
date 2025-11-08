/* eslint-disable prefer-top-level-await */
import "ts-node/register/transpile-only";
import { fetchFootballScoresData } from "../../src/data/sports-apis";

async function main() {
  const [cliDate, teamArgRaw, opponentArgRaw] = process.argv.slice(2);
  const date = cliDate ?? process.env.FOOTBALL_DATE;
  const sanitizeArg = (value?: string) => {
    if (typeof value !== "string") {
      return undefined;
    }
    return value.replace(/^"+/, "").replace(/"+$/, "").trim();
  };

  const teamArg = sanitizeArg(teamArgRaw) ?? sanitizeArg(process.env.FOOTBALL_TEAM);
  const opponentArg = sanitizeArg(opponentArgRaw) ?? sanitizeArg(process.env.FOOTBALL_OPPONENT);

  if (!date || !teamArg) {
    console.error("Usage: ts-node scripts/manual/fetchFootballScores.ts <date> <team> [opponent]");
    process.exit(1);
  }

  const response = await fetchFootballScoresData({
    date,
    team: teamArg,
    awayTeam: opponentArg
  });

  console.log(JSON.stringify(response, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
