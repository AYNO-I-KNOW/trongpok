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

it.each([
  ["เพิ่งได้รับ ใช้มา 3 เดือน", "unboxing"],
  ["ยังไม่ได้ลอง", "unboxing"],
  ["แกะกล่องแล้วสวย", "unboxing"],
  ["ใช้มา 13 วัน", "short"],
  ["ใช้มา 14 วัน", "long"],
  ["ใช้มา 1 สัปดาห์", "short"],
  ["ติดไป 2 อาทิตย์", "long"],
  ["ใช้มา 3 เดือน", "long"],
])("classifies usage from %s", async (text, usage) => {
  const { reviewUsage } = await import("./rules");
  expect(reviewUsage(text)).toBe(usage);
});
it("uses the remaining 25-character specificity boundary", async () => {
  const { reviewSpecific } = await import("./rules");
  expect(reviewSpecific("ดีมากค่ะครับแนะนำใช้ได้ผลส่งไว" + "ก".repeat(24))).toBe(false);
  expect(reviewSpecific("ดีมากค่ะ" + "ก".repeat(25))).toBe(true);
});
it.each(["ละลาย", "เยิ้ม", "เหม็น", "กลับมา"])("recognizes the complaint %s", (complaint) => {
  const custom = { ...product, reviews: [{ ...product.reviews[0], text: "น้ำแข็ง" + complaint }] };
  expect(labelWithRules(custom, subjects)[0].stance).toBe("contradict");
});
it("rejects labels missing usage and specificity", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test");
  vi.stubEnv("OPENAI_MODEL", "missing-metadata");
  const incomplete = labelWithRules(product, subjects).map(({ usage, specific, ...label }) => {
    expect(usage).toBeTruthy();
    expect(typeof specific).toBe("boolean");
    return label;
  });
  vi.mocked(labelWithLlm).mockResolvedValue(incomplete as Awaited<ReturnType<typeof labelWithLlm>>);
  expect((await labelProduct(product, subjects)).mode).toBe("rules");
});
it("allows appearance evidence on unboxing while keeping damaged packages logistical", () => {
  const appearance = [{ id: "looks", text: "รูปทรงสวย", source: "description", checkable: true }];
  const custom = { ...product, reviews: [
    { ...product.reviews[0], id: "looks", text: "แกะกล่องแล้วรูปทรงสวย" },
    { ...product.reviews[0], id: "box", text: "กล่องบุบ รูปทรงสวย" },
  ] };
  const labels = labelWithRules(custom, appearance);
  expect(labels[0]).toMatchObject({ stance: "confirm", target: "product", usage: "unboxing" });
  expect(labels[1].target).toBe("logistics");
});
it.each(["ไม่ละลาย", "ไม่เยิ้ม", "ไม่เหม็น", "ไม่กลับมา"])("treats desired absence %s as confirmation", (absence) => {
  const custom = { ...product, reviews: [{ ...product.reviews[0], text: "น้ำแข็ง" + absence }] };
  expect(labelWithRules(custom, subjects)[0].stance).toBe("confirm");
});
it.each(["สองสัปดาห์", "หนึ่งเดือน", "๒ สัปดาห์"])("reads Thai duration %s", async (duration) => {
  const { reviewUsage } = await import("./rules");
  expect(reviewUsage("ใช้มา " + duration)).toBe("long");
});

it.each([
  ["ใช้มาสิบสามวัน", "short"],
  ["ใช้มาสิบสองวันแล้ว", "short"],
  ["ใช้มาสิบสี่วันแล้ว", "long"],
  ["ใช้มายี่สิบเอ็ดวัน", "long"],
  ["ใช้มา 2 วัน รับประกัน 3 เดือน", "short"],
  ["ใช้มาสองวัน รับประกันสามเดือน", "short"],
  ["แบตใช้ได้ 14 วัน เพิ่งลองมา 2 วัน", "short"],
  ["ส่งมาใน 2 อาทิตย์ วันนี้ลองครั้งแรก", "short"],
  ["ติดไป 2 เดือน", "long"],
  ["นกพิราบหายไป 3 เดือนแล้ว", "long"],
])("distinguishes actual use duration in %s", async (text, usage) => {
  const { reviewUsage } = await import("./rules");
  expect(reviewUsage(text)).toBe(usage);
});
