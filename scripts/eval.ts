import { loadEnvConfig } from "@next/env";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { collectEvaluations } from "../src/lib/eval/runner";
import { buildReport } from "../src/lib/eval/metrics";

loadEnvConfig(process.cwd());

async function main() {
  const report = buildReport(await collectEvaluations());
  const root = join(process.cwd(), "data/cache");
  await mkdir(root, { recursive: true });
  const temporary = join(root, randomUUID() + ".tmp");
  await writeFile(temporary, JSON.stringify(report, null, 2));
  await rename(temporary, join(root, "eval-report.json"));
  console.log(JSON.stringify(report, null, 2));
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
