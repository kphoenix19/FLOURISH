import { loadCanonicalSeed } from "../src/modules/quests/seed/load";
import { validateCanonicalSeed } from "../src/modules/quests/seed/validate";
import { seedReport } from "../src/modules/quests/seed/report";

try {
  console.log(seedReport(validateCanonicalSeed(loadCanonicalSeed()), process.argv.includes("--review")));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Seed validation failed");
  process.exitCode = 1;
}
