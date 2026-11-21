import { afterEach, expect, it, vi } from "vitest";
import blender from "../../../data/categories/blender.json";
import { CategoryPackSchema } from "../types";
import { requirementsFromAnswers, requirementsFromText } from "./index";

const pack = CategoryPackSchema.parse(blender);
afterEach(() => vi.unstubAllEnvs());

it("maps multiple answers and chooses budget by value", () => {
  const requirements = requirementsFromAnswers(pack, { use: ["ice", "smoothie"], noise: "", budget: "3000" });
  expect(requirements.map((item) => item.id)).toEqual(["smoothie", "ice", "budget"]);
  expect(requirements.at(-1)?.value).toBe(3000);
});

it("uses matching option words without API credentials", async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  expect((await requirementsFromText(pack, "ปั่นสมูทตี้")).some((item) => item.id === "smoothie")).toBe(true);
});

it("uses rules when the model is missing", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test");
  vi.stubEnv("OPENAI_MODEL", "");
  expect((await requirementsFromText(pack, "ปั่นสมูทตี้")).map((item) => item.id)).toContain("smoothie");
});

it.each(["ไม่เกิน 3,000 บาท", "งบ 3000 บาท"])("matches an explicit budget in %s", async (text) => {
  vi.stubEnv("OPENAI_API_KEY", "");
  const requirements = await requirementsFromText(pack, text);
  expect(requirements.filter((item) => item.kind === "budget").map((item) => item.value)).toEqual([3000]);
});

it.each(["ไม่เกินงบ", "งบ 13000 บาท", "งบ 3000.50 บาท"])("avoids guessing a budget from %s", async (text) => {
  vi.stubEnv("OPENAI_API_KEY", "");
  expect((await requirementsFromText(pack, text)).filter((item) => item.kind === "budget")).toEqual([]);
});
