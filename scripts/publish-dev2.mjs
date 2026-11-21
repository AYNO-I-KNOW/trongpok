import { spawnSync, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const branch = "codex/dev2-integration";
const root = fileURLToPath(new URL("..", import.meta.url));
const splitPaths = (text) => text.split("\0").filter(Boolean);
const permittedPath = (path) => /^(src\/|scripts\/|docs\/|public\/|data\/)/.test(path) || [
  ".github/workflows/ci.yml", ".gitignore", ".env.example", "package.json", "package-lock.json", "tsconfig.json",
  "next.config.ts", "eslint.config.mjs", "README.md", "AGENTS.md", "Run-Tongpok.cmd", "Finish-Tongpok.cmd",
].includes(path);

function git(args, capture = false) {
  if (capture) return execFileSync("git", args, { cwd: root, encoding: "utf8" });
  const result = spawnSync("git", args, { cwd: root, stdio: "inherit" });
  if (result.error || result.status !== 0) throw new Error(`git ${args[0]} failed. ${result.error?.message ?? "Check the error above."}`);
  return "";
}

function fingerprint() {
  const paths = splitPaths(git(["ls-files", "--cached", "--others", "--exclude-standard", "-z"], true));
  const hash = createHash("sha256");
  for (const path of [...new Set(paths)].filter((path) => !path.startsWith("data/cache/")).sort()) {
    const fullPath = join(root, path);
    hash.update(path + "\0");
    hash.update(existsSync(fullPath) ? readFileSync(fullPath) : "<deleted>");
    hash.update("\0");
  }
  return hash.digest("hex");
}

export function publishDev2(deps) {
  if (deps.git(["branch", "--show-current"], true).trim() !== branch) throw new Error(`Open branch ${branch} before running this script.`);
  const origin = deps.git(["remote", "get-url", "origin"], true).trim();
  if (origin !== "https://github.com/AYNO-I-KNOW/trongpok.git" && origin !== "https://github.com/AYNO-I-KNOW/trongpok") throw new Error("Unexpected origin repository. Nothing was published.");
  if (deps.git(["ls-files", "--unmerged"], true).trim()) throw new Error("Resolve merge conflicts before continuing.");
  const head = deps.git(["rev-parse", "HEAD"], true).trim();
  const paths = [...new Set([
    ...splitPaths(deps.git(["diff", "--name-only", "HEAD", "-z"], true)),
    ...splitPaths(deps.git(["ls-files", "--others", "--exclude-standard", "-z"], true)),
  ])];
  const unexpected = paths.filter((path) => !permittedPath(path));
  if (unexpected.length) throw new Error("Review these unexpected files first: " + unexpected.join(", "));
  const before = deps.fingerprint();
  deps.git(["fetch", "origin"]);
  deps.verify();
  if (deps.fingerprint() !== before || deps.git(["rev-parse", "HEAD"], true).trim() !== head || deps.git(["branch", "--show-current"], true).trim() !== branch) {
    throw new Error("Source files, branch or HEAD changed during verification. Rerun checks before publishing.");
  }
  if (paths.length) {
    deps.git(["--literal-pathspecs", "add", "--all", "--", ...paths]);
    deps.git(["commit", "-m", "feat(s07,s08,s09,s11): integrate comparison UI and fit API"]);
  }
  deps.git(["push", "--set-upstream", "origin", branch]);
  return deps.git(["rev-parse", "HEAD"], true).trim();
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const sha = publishDev2({ git, fingerprint, verify() {
      const result = spawnSync(process.execPath, [join(root, "scripts", "verify-dev2.mjs")], { cwd: root, stdio: "inherit" });
      if (result.error || result.status !== 0) throw new Error("Verification failed. No feature commit or push was performed.");
    } });
    console.log(`\nPublished ${branch} at ${sha}`);
    console.log(`https://github.com/AYNO-I-KNOW/trongpok/tree/${branch}`);
  } catch (error) {
    console.error("\nStopped: " + error.message);
    process.exitCode = 1;
  }
}
