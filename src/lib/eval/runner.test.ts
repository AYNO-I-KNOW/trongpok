import { expect, it, vi, afterEach } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import example from "../../../data/products/_example.json";
import category from "../../../data/categories/blender.json";
import { runArenaRequest } from "../agents/service";
import { collectEvaluations } from "./runner";
import { plainLlm } from "./plain-llm";

vi.mock("./plain-llm", () => ({ plainLlm: vi.fn(async () => null) }));
afterEach(() => vi.unstubAllEnvs());

it("evaluates fixture caches and leaves unavailable model measurements empty", async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  const root = await mkdtemp(join(tmpdir(), "eval-fixture-"));
  try {
    await mkdir(join(root, "categories"));
    await mkdir(join(root, "products"));
    await writeFile(join(root, "categories/blender.json"), JSON.stringify(category));
    const products = [example, { ...example, id: "alternative", stars: 4, ratingCount: 5000 }];
    for (const product of products) await writeFile(join(root, "products", product.id + ".json"), JSON.stringify(product));
    await writeFile(join(root, "personas.csv"), "persona_id,category,need_text,answers,labeler_a_top3,labeler_b_top3,human_top3,must_notes\np1,blender,เครื่องปั่น,budget=3000,blender-smoothie-pro|alternative,blender-smoothie-pro|alternative,blender-smoothie-pro|alternative,\n");
    await expect(collectEvaluations(root)).rejects.toThrow("Missing arena cache");
    await runArenaRequest({ category: "blender", needText: "เครื่องปั่น", answers: { budget: ["3000"] } }, undefined, { dataRoot: root, replayDelayMs: 0, strictCache: true });
    const rows = await collectEvaluations(root);
    expect(rows).toHaveLength(1);
    expect(rows[0].rankings.stars).toEqual(["blender-smoothie-pro", "alternative"]);
    expect(rows[0].rankings.popular).toEqual(["alternative", "blender-smoothie-pro"]);
    expect(rows[0].rankings.ours).toHaveLength(2);
    expect(rows[0].rankings["ours-rules"]).toHaveLength(2);
    expect(rows[0].rankings["plain-llm"]).toBeNull();
    expect(plainLlm).toHaveBeenCalledTimes(1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
