import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// File loading does not import Prisma or require DATABASE_URL.
export function loadCanonicalSeed(root = resolve(process.cwd(), "data/seeds")): unknown {
  const read = (name: string): unknown => JSON.parse(readFileSync(resolve(root, name), "utf8"));
  const quests = readdirSync(resolve(root, "quests"))
    .filter((name) => name.endsWith(".json")).sort()
    .flatMap((name) => {
      const rows = read(`quests/${name}`);
      if (!Array.isArray(rows)) throw new Error(`quests/${name} must contain an array`);
      return rows;
    });
  return { skills: read("skills.json"), varietyTags: read("variety-tags.json"), families: read("quest-families.json"), quests };
}
