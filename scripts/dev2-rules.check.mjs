import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

const root = fileURLToPath(new URL("..", import.meta.url));
const initialCwd = process.cwd();
const previousKey = process.env.OPENAI_API_KEY;
const previousModel = process.env.OPENAI_MODEL;
process.env.OPENAI_API_KEY = "";
process.env.OPENAI_MODEL = "";
register(new URL("./dev2-loader.mjs", import.meta.url), { data: { root } });

const { loadPacks, loadProducts } = await import("../src/lib/catalog/index.ts");
const { runArenaRequest } = await import("../src/lib/agents/service.ts");
const { ArenaResultSchema } = await import("../src/lib/types.ts");
const { consumeArena } = await import("../src/lib/ui/arena-response.ts");
const { POST: arenaPost } = await import("../src/app/api/arena/route.ts");
const { POST: fitPost } = await import("../src/app/api/fit/route.ts");
const dataRoot = join(root, "data");
const packs = await loadPacks(dataRoot);
const products = await loadProducts(dataRoot);
const scratch = await mkdtemp(join(tmpdir(), "trongpok-dev2-rules-"));
const selected = (pack) => [...new Map(pack.questions.flatMap((question) => {
  const requirement = question.options.find((option) => option.requirement)?.requirement;
  return requirement ? [[requirement.id, requirement]] : [];
})).values()];
const request = (body, endpoint = "arena") => new Request("http://localhost/api/" + endpoint, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

after(async () => {
  process.chdir(initialCwd);
  if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousKey;
  if (previousModel === undefined) delete process.env.OPENAI_MODEL;
  else process.env.OPENAI_MODEL = previousModel;
  const target = resolve(scratch);
  assert.ok(target.startsWith(resolve(tmpdir()) + sep));
  assert.ok(target.includes("trongpok-dev2-rules-"));
  await rm(target, { recursive: true, force: true });
});

for (const pack of packs) {
  test("rules Arena returns validated evidence for " + pack.id, async () => {
    const requirements = selected(pack);
    const events = [];
    const result = await runArenaRequest({ category: pack.id, requirements }, (event) => events.push(event), {
      dataRoot, cacheRoot: join(scratch, pack.id), replayDelayMs: 0,
    });
    assert.equal(result.mode, "rules");
    ArenaResultSchema.parse(result);
    assert.deepEqual(result.requirements, requirements);
    assert.ok(result.ranked.length > 0);
    for (const role of ["fit", "value", "skeptic", "judge"]) {
      assert.ok(events.some((event) => event.agent === role && event.type === "done"));
    }
    for (const ranked of result.ranked) {
      const product = products.find((item) => item.id === ranked.productId);
      assert.ok(product);
      assert.equal(product.category, pack.id);
      for (const label of [...ranked.objections, ...ranked.requirements.flatMap((item) => item.quotes)]) {
        assert.ok(product.reviews.some((review) => review.id === label.reviewId && !review.isTemplate && review.text.includes(label.quote)));
      }
    }
  });
}

test("reviewed priorities and deletions override the original answers", async () => {
  const pack = packs.find((item) => item.id === "blender");
  const requirement = selected(pack).find((item) => item.kind === "must");
  const answers = Object.fromEntries(pack.questions.map((question) => [question.id,
    [question.options.find((option) => option.requirement).label],
  ]));
  const reviewed = [{ ...requirement, kind: "nice" }];
  const result = await runArenaRequest({ category: pack.id, answers, requirements: reviewed }, undefined, {
    dataRoot, cacheRoot: join(scratch, "reviewed-contract"), replayDelayMs: 0,
  });
  ArenaResultSchema.parse(result);
  assert.deepEqual(result.requirements, reviewed);
  assert.equal(result.requirements.some((item) => item.kind === "budget"), false);
});

test("reviewed priorities survive cache replay and do not reuse a different selection", async (context) => {
  const pack = packs.find((item) => item.id === "blender");
  const requirement = selected(pack).find((item) => item.kind === "must");
  const input = { category: pack.id, requirements: [{ ...requirement, kind: "nice" }] };
  const options = { dataRoot, cacheRoot: join(scratch, "reviewed"), replayDelayMs: 0, strictCache: true };
  let first;
  try {
    first = await runArenaRequest(input, undefined, options);
  } catch (error) {
    if (["EPERM", "EACCES", "EROFS"].includes(error.code)) {
      context.skip("This environment denies atomic cache writes; verify persistence with npm test on a writable filesystem.");
      return;
    }
    throw error;
  }
  ArenaResultSchema.parse(first);
  assert.deepEqual(first.requirements, input.requirements);
  const changed = await runArenaRequest({ ...input, requirements: [{ ...requirement, kind: "must" }] }, undefined, options);
  assert.equal(changed.mode, "rules");
  assert.equal(changed.requirements[0].kind, "must");
  const modes = [];
  const replay = await runArenaRequest(input, undefined, { ...options, onMode: (mode) => modes.push(mode) });
  assert.equal(replay.mode, "cache");
  assert.deepEqual(replay.requirements, input.requirements);
  assert.deepEqual(modes, ["cache"]);
});

test("linked-product SSE and Fit JSON use the same real rules backend", async () => {
  const pack = packs.find((item) => item.id === "blender");
  const linked = { ...products.find((item) => item.category === pack.id), shopeeUrl: "https://shopee.co.th/product/100/100" };
  const peer = products.find((item) => item.category === pack.id && item.id !== linked.id);
  const fixture = join(scratch, "routes");
  await mkdir(join(fixture, "data", "categories"), { recursive: true });
  await mkdir(join(fixture, "data", "products"), { recursive: true });
  await writeFile(join(fixture, "data", "categories", pack.id + ".json"), JSON.stringify(pack));
  for (const product of [linked, peer]) {
    await writeFile(join(fixture, "data", "products", product.id + ".json"), JSON.stringify(product));
  }
  process.chdir(fixture);
  try {
    const input = { category: pack.id, requirements: selected(pack), link: linked.shopeeUrl };
    const events = [];
    const modes = [];
    const result = await consumeArena(await arenaPost(request(input)), (event) => events.push(event), undefined, (mode) => modes.push(mode));
    assert.equal(result.mode, "rules");
    assert.ok(modes.includes("rules"));
    assert.deepEqual(events.filter((event) => event.type === "start").map((event) => event.agent),
      ["fit", "value", "skeptic", "judge"]);
    assert.ok(result.ranked.some((item) => item.productId === linked.id));
    const cachedModes = [];
    const cached = await consumeArena(await arenaPost(request(input)), () => {}, undefined, (mode) => cachedModes.push(mode));
    assert.ok(["cache", "rules"].includes(cached.mode));
    assert.equal(cachedModes[0], cached.mode);
    assert.deepEqual(cached.ranked, result.ranked);
    const fit = await fitPost(request(input, "fit"));
    assert.equal(fit.status, 200);
    const answer = await fit.json();
    assert.deepEqual(answer.ranked, result.ranked);
    assert.equal(answer.events, undefined);
    assert.equal(answer.measuredFrom, "earlier buyers' reviews");
    assert.equal(answer.scoringDoc, "docs/scoring.md");
    const unknown = await fitPost(request({ ...input, link: "https://shopee.co.th/product/999999999/999999999" }, "fit"));
    assert.equal(unknown.status, 404);
    const invalid = await fitPost(request({ ...input, answers: { [pack.questions[0].id]: ["not-a-real-choice"] } }, "fit"));
    assert.equal(invalid.status, 422);
  } finally {
    process.chdir(initialCwd);
  }
});

test("Arena rejects ambiguous reviewed conditions before starting a stream", async () => {
  const item = { id: "ice", text: "ปั่นน้ำแข็ง", kind: "must" };
  for (const requirements of [[item, item], [{ ...item, kind: "budget" }], []]) {
    const response = await arenaPost(request({ category: "blender", requirements }));
    assert.equal(response.status, 400);
  }
});

test("cancelled requests stop before accessing a missing catalog", async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(runArenaRequest({ category: "blender" }, undefined, {
    signal: controller.signal, dataRoot: join(scratch, "missing"),
  }), { name: "AbortError" });
});
