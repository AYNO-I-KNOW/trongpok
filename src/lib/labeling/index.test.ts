import { beforeEach, expect, it, vi } from "vitest";
import fixture from "../../../data/products/_example.json";
import { ProductSchema } from "../types";
import { labelWithRules } from "./rules";
import { labelProduct } from "./index";
import { labelWithLlm } from "./llm";

vi.mock("./llm", () => ({ labelWithLlm: vi.fn() }));
const product = ProductSchema.parse(fixture);
const subjects = [{ id: "ice", text: "ปั่นน้ำแข็งได้ต่อเนื่องโดยมอเตอร์ไม่ไหม้", kind: "must" as const }];
beforeEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it("finds contradictory ice reviews and logistics", () => {
  const labels = labelWithRules(product, subjects);
  expect(labels.find((label) => label.reviewId === "r2")?.stance).toBe("contradict");
  expect(labels.find((label) => label.reviewId === "r3")?.stance).toBe("contradict");
  expect(labels.find((label) => label.reviewId === "r4")?.target).toBe("logistics");
});
it("falls back on model failure", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test");
  vi.stubEnv("OPENAI_MODEL", "failure-model");
  vi.mocked(labelWithLlm).mockRejectedValue(new Error("offline"));
  expect((await labelProduct(product, subjects)).mode).toBe("rules");
});
it("uses cached labels without a second model call", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test");
  vi.stubEnv("OPENAI_MODEL", "cache-model");
  vi.mocked(labelWithLlm).mockResolvedValue(labelWithRules(product, subjects));
  expect((await labelProduct(product, subjects)).mode).toBe("llm");
  expect((await labelProduct(product, subjects)).mode).toBe("cache");
  expect(labelWithLlm).toHaveBeenCalledTimes(1);
});
it("recognizes desired absence without confusing unrelated blending", () => {
  const quiet = { id: "quiet", text: "เสียงไม่ดัง", kind: "nice" as const };
  const custom = { ...product, reviews: [
    { ...product.reviews[0], id: "safe", text: "ปั่นน้ำแข็งมอเตอร์ไม่ไหม้" },
    { ...product.reviews[0], id: "quiet", text: "เสียงไม่ดัง" },
  ] };
  expect(labelWithRules(custom, subjects).find((label) => label.reviewId === "safe")?.stance).toBe("confirm");
  expect(labelWithRules(custom, [quiet]).find((label) => label.reviewId === "quiet")?.stance).toBe("confirm");
  expect(labelWithRules(product, subjects).find((label) => label.reviewId === "r1")?.stance).toBe("none");
});
it("rejects alien pairs even when the output count matches", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test");
  vi.stubEnv("OPENAI_MODEL", "alien-model");
  const labels = labelWithRules(product, subjects);
  labels[0] = { ...labels[0], reviewId: "alien" };
  vi.mocked(labelWithLlm).mockResolvedValue(labels);
  expect((await labelProduct(product, subjects)).mode).toBe("rules");
  expect((await labelProduct(product, subjects)).mode).toBe("rules");
  expect(labelWithLlm).toHaveBeenCalledTimes(2);
});
