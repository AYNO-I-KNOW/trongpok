import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import example from "../../../data/products/_example.json";
import category from "../../../data/categories/blender.json";
import { POST } from "../../app/api/arena/route";
import { runLlmAgent } from "./llm";
import { requirementsFromText } from "../needs";

vi.mock("./llm", () => ({ runLlmAgent: vi.fn(async () => { throw new Error("offline"); }) }));
vi.mock("../needs", async (original) => ({
  ...await original<typeof import("../needs")>(),
  requirementsFromText: vi.fn(async () => []),
}));
let root: string;
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  if (root) await rm(root, { recursive: true, force: true });
});
it("streams two fixture products and replays the persona request without model calls", async () => {
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
  const replay = await POST(request());
  const replayFrames = (await replay.text()).trim().split("\n\n");
  const cached = JSON.parse(replayFrames.at(-1)!.split("\ndata: ")[1]);
  expect(cached.mode).toBe("cache");
  expect(cached.ranked).toEqual(last.ranked);
  expect(replayFrames.slice(0, -1)).toEqual(frames.slice(0, -1));
  expect(runLlmAgent).toHaveBeenCalledTimes(calls);
  expect(requirementsFromText).toHaveBeenCalledTimes(1);
});

it("does not reuse request cache keys from the previous scoring formula", async () => {
  const { cacheHash, requestCacheKey } = await import("./cache");
  expect(requestCacheKey({}, [], [])).not.toBe(cacheHash(["request", {}, cacheHash([[], []])]));
});
