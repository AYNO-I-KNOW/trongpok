import { mkdtemp, mkdir, readFile, writeFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import example from "../../../data/products/_example.json";
import category from "../../../data/categories/blender.json";
import { POST } from "../../app/api/arena/route";
import { loadPacks, loadProducts } from "../catalog";
import { runLlmAgent } from "./llm";
import { requirementsFromText } from "../needs";
import type { ArenaResult } from "../types";
import { cacheHash, requestCacheKey, writeArenaCache } from "./cache";
import { runArenaRequest } from "./service";

vi.mock("./llm", () => ({ runLlmAgent: vi.fn(async () => { throw new Error("offline"); }) }));
vi.mock("../needs", async (original) => ({
  ...await original<typeof import("../needs")>(),
  requirementsFromText: vi.fn(async () => []),
}));
let root: string;
async function fixtureRoot() {
  root = await mkdtemp(join(tmpdir(), "arena-fixture-"));
  await mkdir(join(root, "data/categories"), { recursive: true });
  await mkdir(join(root, "data/products"), { recursive: true });
  await writeFile(join(root, "data/categories/blender.json"), JSON.stringify(category));
  await writeFile(join(root, "data/products", example.id + ".json"), JSON.stringify(example));
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("VERCEL", "");
}

async function replaceCachedResult(input: { category: string; answers: Record<string, string> }, result: ArenaResult, index: boolean) {
  const dataRoot = join(root, "data");
  const cacheRoot = join(dataRoot, "cache", "arena");
  const ref = join(cacheRoot, `${requestCacheKey(input, await loadPacks(dataRoot), await loadProducts(dataRoot))}.ref`);
  const target = (await readFile(ref, "utf8")).trim();
  await writeArenaCache(cacheRoot, target, result, true);
  if (!index) await rm(ref);
}
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  if (root) await rm(root, { recursive: true, force: true });
});
it("streams two fixture products and replays the persona request without model calls", async () => {
  vi.stubEnv("VERCEL", "");
  root = await mkdtemp(join(tmpdir(), "arena-fixture-"));
  await mkdir(join(root, "data/categories"), { recursive: true });
  await mkdir(join(root, "data/products"), { recursive: true });
  await writeFile(join(root, "data/categories/blender.json"), JSON.stringify(category));
  for (const product of [example, { ...example, id: "alternative", priceThb: 1200 }]) {
    await writeFile(join(root, "data/products", product.id + ".json"), JSON.stringify(product));
  }
  const persona = { category: "blender", needText: "เครื่องปั่น" };
  await writeFile(join(root, "data/personas.csv"), "persona_id,category,need_text\np1,blender,เครื่องปั่น\n");
  vi.spyOn(process, "cwd").mockReturnValue(root);
  vi.stubEnv("OPENAI_API_KEY", "test");
  vi.stubEnv("OPENAI_MODEL", "test-model");
  const request = () => new Request("http://localhost/api/arena", { method: "POST", body: JSON.stringify(persona) });
  const first = await POST(request());
  expect(first.headers.get("content-type")).toContain("text/event-stream");
  const frames = (await first.text()).trim().split("\n\n");
  const last = JSON.parse(frames.at(-1)!.split("\ndata: ")[1]);
  expect(last.ranked).toHaveLength(2);
  expect(last.mode).toBe("rules");
  expect(frames.some((frame) => frame.includes('"agent":"judge"'))).toBe(true);
  const calls = vi.mocked(runLlmAgent).mock.calls.length;
  expect(calls).toBeGreaterThan(0);
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("VERCEL", "1");
  const replay = await POST(request());
  const replayFrames = (await replay.text()).trim().split("\n\n");
  const cached = JSON.parse(replayFrames.at(-1)!.split("\ndata: ")[1]);
  expect(cached.mode).toBe("cache");
  expect(cached.ranked).toEqual(last.ranked);
  expect(replayFrames.slice(0, -1)).toEqual(frames.slice(0, -1));
  expect(cached.cachedMode).toBe("rules");
  expect(runLlmAgent).toHaveBeenCalledTimes(calls);
  expect(requirementsFromText).toHaveBeenCalledTimes(1);
});

it("streams accepted review ids and exact Skeptic quotations for the shop ice request", async () => {
  await fixtureRoot();
  vi.spyOn(process, "cwd").mockReturnValue(root);
  const response = await POST(new Request("http://localhost/api/arena", {
    method: "POST",
    body: JSON.stringify({
      category: "blender",
      needText: "เครื่องปั่นไว้ปั่นน้ำแข็งเปิดร้าน งบ 3,000 บาท",
      answers: { blenderUsage: "ice", iceCubes: "5", container: "mainJar" },
    }),
  }));
  const frames = (await response.text()).trim().split("\n\n");
  const events = frames.filter((frame) => frame.startsWith("event: agent\n")).map((frame) => JSON.parse(frame.split("\ndata: ")[1]));
  const result = JSON.parse(frames.at(-1)!.split("\ndata: ")[1]);
  expect(frames.at(-1)).toMatch(/^event: result\n/);
  expect(result.mode).toBe("rules");
  const data = events.find((event) => event.agent === "skeptic" && event.type === "objection");
  expect(data).toMatchObject({ productId: example.id, objections: expect.arrayContaining([
    expect.objectContaining({ reviewId: "r2", subjectId: "ice", quote: example.reviews[1].text }),
  ]) });
  expect(result.ranked[0].objections).toEqual(data.objections);
  expect(data.quote).toBe(data.objections[0].quote);
  expect(result.ranked[0].requirements).toEqual(expect.arrayContaining([
    expect.objectContaining({ requirementId: "ice-condition", status: "unknown", quotes: [] }),
    expect.objectContaining({ requirementId: "budget", status: "pass" }),
  ]));
});

it.each([true, false])("recomputes a cache with fabricated objection evidence, indexed: %s", async (index) => {
  await fixtureRoot();
  const options = { dataRoot: join(root, "data"), replayDelayMs: 0 };
  const input = { category: "blender", answers: { use: "ice" } };
  const first = await runArenaRequest(input, undefined, options);
  const row = first.ranked[0];
  const bogus = { ...row.objections[0], quote: "invented review quote" };
  expect(row.objections.length).toBeGreaterThan(0);
  await replaceCachedResult(input, {
    ...first,
    ranked: [{ ...row, objections: [bogus] }],
    events: first.events.map((event) => event.type === "objection"
      ? { ...event, quote: bogus.quote, objections: [bogus] } : event),
  }, index);
  const emit = vi.fn();
  const fresh = await runArenaRequest(input, emit, options);
  expect(fresh.mode).toBe("rules");
  expect(fresh.ranked).toEqual(first.ranked);
  expect(emit.mock.calls.flat()).toEqual(first.events);
});

it.each(["OPENAI_API_KEY", "OPENAI_MODEL"] as const)("does not replay a cached LLM result without %s", async (missing) => {
  await fixtureRoot();
  const options = { dataRoot: join(root, "data"), replayDelayMs: 0 };
  const input = { category: "blender", answers: { use: "ice" } };
  const first = await runArenaRequest(input, undefined, options);
  await replaceCachedResult(input, { ...first, mode: "llm" }, true);
  vi.stubEnv("OPENAI_API_KEY", "test");
  vi.stubEnv("OPENAI_MODEL", "test");
  vi.stubEnv(missing, "");
  expect((await runArenaRequest(input, undefined, options)).mode).toBe("rules");
});

it("recomputes a cached mixed run without a configured model", async () => {
  await fixtureRoot();
  const options = { dataRoot: join(root, "data"), replayDelayMs: 0 };
  const input = { category: "blender", answers: { use: "ice" } };
  const first = await runArenaRequest(input, undefined, options);
  const mixed = { ...first, modelContributed: true };
  await replaceCachedResult(input, mixed, true);
  expect((await runArenaRequest(input, undefined, options)).mode).toBe("rules");
});

it("does not reuse request cache keys from the previous scoring formula", async () => {
  expect(requestCacheKey({}, [], [])).not.toBe(cacheHash(["request", "parallel-requirement-arena-v7", {}, cacheHash([[], []])]));
});

it("evaluates a product linked by local id and keeps its cache distinct", async () => {
  const { runArenaRequest } = await import("./service");
  root = await mkdtemp(join(tmpdir(), "arena-linked-"));
  await mkdir(join(root, "categories"), { recursive: true });
  await mkdir(join(root, "products"), { recursive: true });
  await writeFile(join(root, "categories/blender.json"), JSON.stringify(category));
  await writeFile(join(root, "products", example.id + ".json"), JSON.stringify(example));
  vi.stubEnv("OPENAI_API_KEY", "");
  const options = { dataRoot: root, replayDelayMs: 0 };
  const input = { category: "blender", answers: {} };
  const first = await runArenaRequest(input, undefined, options);
  expect(first.events.some((event) => event.agent === "verifier")).toBe(false);
  const linked = await runArenaRequest({ ...input, linkedProductId: example.id }, undefined, options);
  expect(linked.mode).toBe("rules");
  expect(linked.events.filter((event) => event.type === "start").map((event) => event.agent)).toEqual(["fit", "value", "skeptic", "judge"]);
  expect(linked.ranked.some((item) => item.productId === example.id)).toBe(true);
  expect((await runArenaRequest({ ...input, linkedProductId: example.id }, undefined, options)).mode).toBe("cache");
  await expect(runArenaRequest({ ...input, linkedProductId: "missing" }, undefined, options)).rejects.toThrow("Unknown linked");
  await expect(runArenaRequest({ category: "other", linkedProductId: example.id }, undefined, options)).rejects.toThrow("category mismatch");
});

it("reads linked persona cache with the same request key used by evaluation", async () => {
  const { runArenaRequest } = await import("./service");
  const { parsePersonas, personaRequest } = await import("../personas");
  const { loadPacks, loadProducts } = await import("../catalog");
  const { readRequestCache, requestCacheKey } = await import("./cache");
  root = await mkdtemp(join(tmpdir(), "persona-readback-"));
  await mkdir(join(root, "categories"), { recursive: true });
  await mkdir(join(root, "products"), { recursive: true });
  await writeFile(join(root, "categories/blender.json"), JSON.stringify(category));
  await writeFile(join(root, "products", example.id + ".json"), JSON.stringify(example));
  const csv = "persona_id,category,need_text,link_product_id,answers,labeler_a_top3,labeler_b_top3,human_top3,must_notes\n" +
    "b1,blender,ice," + example.id + ",use=ice;budget=3000,,,,\n";
  const request = personaRequest(parsePersonas(csv)[0]);
  vi.stubEnv("OPENAI_API_KEY", "");
  const result = await runArenaRequest(request, undefined, { dataRoot: root, replayDelayMs: 0, strictCache: true });
  const packs = await loadPacks(root);
  const products = await loadProducts(root);
  expect(await readRequestCache(join(root, "cache/arena"), requestCacheKey(request, packs, products))).toEqual(result);
});

it("streams a completed result when the cache directory cannot be created", async () => {
  await fixtureRoot();
  const warnings = vi.spyOn(console, "warn").mockImplementation(() => {});
  await writeFile(join(root, "data/cache"), "blocked");
  vi.spyOn(process, "cwd").mockReturnValue(root);
  const response = await POST(new Request("http://localhost/api/arena", {
    method: "POST",
    body: JSON.stringify({ category: "blender", answers: { blenderUsage: "ice" } }),
  }));
  const frames = (await response.text()).trim().split("\n\n");
  expect(frames.at(-1)).toMatch(/^event: result\n/);
  expect(JSON.parse(frames.at(-1)!.split("\ndata: ")[1])).toMatchObject({
    mode: "rules",
    ranked: [{ productId: example.id }],
  });
  expect(frames.some((frame) => frame.startsWith("event: error"))).toBe(false);
  expect(warnings).toHaveBeenCalledWith({ event: "arena_cache_write_failed", code: "ENOTDIR" });
});

it("returns a result on Vercel without writing to the bundled data directory", async () => {
  await fixtureRoot();
  vi.stubEnv("VERCEL", "1");
  const result = await runArenaRequest({ category: "blender", answers: {} }, undefined, {
    dataRoot: join(root, "data"),
  });
  expect(result.mode).toBe("rules");
  expect(result.ranked.map((product) => product.productId)).toEqual([example.id]);
  await expect(stat(join(root, "data/cache"))).rejects.toMatchObject({ code: "ENOENT" });
});

it("reports cache persistence errors when precomputing with strict cache enabled", async () => {
  await fixtureRoot();
  vi.stubEnv("VERCEL", "1");
  const blocked = join(root, "blocked");
  await writeFile(blocked, "blocked");
  await expect(runArenaRequest({ category: "blender", answers: {} }, undefined, {
    dataRoot: join(root, "data"),
    cacheRoot: join(blocked, "cache"),
    strictCache: true,
  })).rejects.toMatchObject({ code: "ENOTDIR" });
});
