import { loadEnvConfig } from "@next/env";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { collectEvaluations } from "../src/lib/eval/runner";
import { buildReport } from "../src/lib/eval/metrics";

async function main() {
  const args = process.argv.slice(2);
  const demo = args[0] === "--demo";
  if (args.length && (!demo || args.length !== 1)) throw new Error("Usage: npm run eval [-- --demo]");
  if (demo) {
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_MODEL;
  } else {
    loadEnvConfig(process.cwd());
  }
  const mode = demo ? "demo-rules" : "configured-cache";
  const report = buildReport(await collectEvaluations({ mode }), mode);
  const serialized = JSON.stringify(report, null, 2) + "\n";
  const root = join(process.cwd(), "data/cache");
  await mkdir(root, { recursive: true });
  const temporary = join(root, randomUUID() + ".tmp");
  await writeFile(temporary, serialized);
  await rename(temporary, join(root, "eval-report.json"));
  process.stdout.write(serialized);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
