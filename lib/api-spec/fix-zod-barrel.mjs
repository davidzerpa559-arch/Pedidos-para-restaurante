import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const directory = path.dirname(fileURLToPath(import.meta.url));
const barrelPath = path.resolve(directory, "../api-zod/src/index.ts");
const barrel = await readFile(barrelPath, "utf8");
const filtered = barrel
  .split(/\r?\n/)
  .filter((line) => !line.includes("generated/types"))
  .join("\n");

if (filtered === barrel) {
  throw new Error("Expected the generated api-zod barrel to export generated/types");
}

await writeFile(barrelPath, filtered);
