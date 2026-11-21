import { spawnSync, execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const npmCli = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
if (!existsSync(npmCli)) throw new Error("Cannot locate npm. Install Node.js with npm, then retry.");
const report = {
  startedAt: new Date().toISOString(),
  sourceRevision: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
  verified: false, checks: [],
};
for (const [name, args] of [
  ["install", ["ci", "--no-audit", "--no-fund"]],
  ["unit", ["test"]],
  ["rules-integration", ["run", "test:ui"]],
  ["publisher-checks", ["run", "test:publish"]],
  ["lint", ["run", "lint"]],
  ["build", ["run", "build"]],
]) {
  console.log("\nRunning " + name + "...");
  const outcome = spawnSync(process.execPath, [npmCli, ...args], { cwd: root, stdio: "inherit" });
  report.checks.push({ name, exitCode: outcome.status, finishedAt: new Date().toISOString() });
  writeFileSync(join(root, "dev2-validation.json"), JSON.stringify(report, null, 2) + "\n");
  if (outcome.status !== 0 || outcome.error) {
    console.error("Stopped at " + name + ". Review the error above.");
    process.exit(outcome.status || 1);
  }
}
report.verified = true;
report.finishedAt = new Date().toISOString();
writeFileSync(join(root, "dev2-validation.json"), JSON.stringify(report, null, 2) + "\n");
console.log("\nAll checks passed. Feature changes are ready for review and commit.");
