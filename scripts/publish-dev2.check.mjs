import { test } from "node:test";
import assert from "node:assert/strict";
import { publishDev2 } from "./publish-dev2.mjs";

function harness() {
  const calls = [];
  const deps = {
    git(args) {
      calls.push(args);
      if (args[0] === "branch") return "codex/dev2-integration\n";
      if (args[0] === "remote") return "https://github.com/AYNO-I-KNOW/trongpok.git\n";
      if (args[0] === "rev-parse") return "baseline\n";
      if (args[0] === "diff") return ".github/workflows/ci.yml\0src/app/page.tsx\0";
      return "";
    },
    fingerprint: () => "unchanged",
    verify: () => { calls.push(["verify"]); },
  };
  return { calls, deps };
}

test("a failed verification never stages, commits or pushes", () => {
  const { deps, calls } = harness();
  deps.verify = () => { throw new Error("build failed"); };
  assert.throws(() => publishDev2(deps), /build failed/);
  assert.ok(calls.every((args) => !args.includes("add") && !args.includes("commit") && !args.includes("push")));
});

test("source changes during checks stop publication", () => {
  const { deps, calls } = harness();
  let checks = 0;
  deps.fingerprint = () => ++checks === 1 ? "before" : "after";
  assert.throws(() => publishDev2(deps), /changed during verification/);
  assert.ok(calls.every((args) => !args.includes("commit") && !args.includes("push")));
});

test("successful checks stage only selected files and publish the work branch", () => {
  const { deps, calls } = harness();
  assert.equal(publishDev2(deps), "baseline");
  const verify = calls.findIndex((args) => args[0] === "verify");
  const commit = calls.findIndex((args) => args[0] === "commit");
  const push = calls.findIndex((args) => args[0] === "push");
  assert.ok(verify < commit && commit < push);
  assert.deepEqual(calls.find((args) => args.includes("add")), ["--literal-pathspecs", "add", "--all", "--", ".github/workflows/ci.yml", "src/app/page.tsx"]);
  assert.deepEqual(calls[push], ["push", "--set-upstream", "origin", "codex/dev2-integration"]);
});

test("unexpected files stop before fetch or verification", () => {
  const { deps, calls } = harness();
  const git = deps.git;
  deps.git = (args) => args[0] === "diff" ? ".npmrc\0" : git(args);
  assert.throws(() => publishDev2(deps), /unexpected files/);
  assert.ok(calls.every((args) => args[0] !== "fetch" && args[0] !== "verify" && args[0] !== "push"));
});
