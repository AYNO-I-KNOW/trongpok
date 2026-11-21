import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import example from "../../../data/products/_example.json";
import category from "../../../data/categories/blender.json";
import { POST } from "../../app/api/arena/route";
import { runLlmAgent } from "./llm";
import { requirementsFromText } from "../needs";
import { RequirementSchema } from "../types";

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
  expect(replayFrames.filter((frame) => frame.startsWith("event: agent"))).toEqual(frames.filter((frame) => frame.startsWith("event: agent")));
  expect(replayFrames[0]).toBe('event: mode\ndata: {"mode":"cache"}');
  expect(runLlmAgent).toHaveBeenCalledTimes(calls);
  expect(requirementsFromText).toHaveBeenCalledTimes(1);
});

it("does not reuse request cache keys from the previous scoring formula", async () => {
  const { cacheHash, requestCacheKey } = await import("./cache");
  expect(requestCacheKey({}, [], [])).not.toBe(cacheHash(["request", {}, cacheHash([[], []])]));
});

it("preserves reviewed edits and separates their cache", async () => {
  const { runArenaRequest } = await import("./service");
  root = await mkdtemp(join(tmpdir(), "arena-reviewed-"));
  await mkdir(join(root, "categories"), { recursive: true });
  await mkdir(join(root, "products"), { recursive: true });
  await writeFile(join(root, "categories/blender.json"), JSON.stringify(category));
  await writeFile(join(root, "products", example.id + ".json"), JSON.stringify(example));
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("OPENAI_MODEL", "");
  const ice = RequirementSchema.parse(category.questions[0].options.find((option) => option.requirement?.id === "ice")!.requirement);
  const reviewed = [{ ...ice, kind: "nice" as const }];
  const input = { category: "blender", answers: { use: ["ice"], budget: [3000] }, requirements: reviewed };
  const modes: string[] = [];
  const options = { dataRoot: root, replayDelayMs: 0, onMode: (mode: string) => modes.push(mode) };
  const first = await runArenaRequest(input, undefined, options);
  expect(first.requirements).toEqual(reviewed);
  expect(first.requirements.some((requirement) => requirement.kind === "budget")).toBe(false);
  const changed = await runArenaRequest({ ...input, requirements: [{ ...ice, kind: "must" }] }, undefined, options);
  expect(changed.mode).toBe("rules");
  expect(changed.requirements[0].kind).toBe("must");
  modes.length = 0;
  const replay = await runArenaRequest(input, undefined, options);
  expect(replay.mode).toBe("cache");
  expect(replay.requirements).toEqual(reviewed);
  expect(modes).toEqual(["cache"]);
});

it("rejects duplicate ids and missing budget amounts", async () => {
  const need = { id: "ice", text: "น้ำแข็ง", kind: "must" };
  for (const requirements of [[need, need], [{ ...need, kind: "budget" }], []]) {
    const response = await POST(new Request("http://localhost/api/arena", {
      method: "POST", body: JSON.stringify({ category: "blender", requirements }),
    }));
    expect(response.status).toBe(400);
  }
});

it("stops cancelled requests before catalog access", async () => {
  const { runArenaRequest } = await import("./service");
  const controller = new AbortController();
  controller.abort();
  await expect(runArenaRequest({ category: "blender" }, undefined, { signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
});
