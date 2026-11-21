import { afterEach, expect, it, vi } from "vitest";
import blender from "../../../data/categories/blender.json";
import smoothiePro from "../../../data/products/blender-smoothie-pro.json";
import { eligibleLabels, specCheck } from "../scoring";
import { labelWithRules } from "../labeling/rules";
import { CategoryPackSchema, ProductSchema } from "../types";
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


it("translates designer answers and keeps explicit text budget", () => {
  const requirements = requirementsFromAnswers(pack, { blenderUsage: "ice", iceCubes: "5", container: "bottle600" }, "เครื่องปั่น งบ 2,500 บาท");
  expect(requirements).toEqual([
    { id: "ice", text: "บดน้ำแข็งได้", kind: "must", spec: { key: "iceCrush", op: "==", value: true } },
    { id: "ice-condition", text: "ปั่นน้ำแข็ง 5 ก้อน ในขวดพกพา 600 มล.", kind: "must", specOnly: true, spec: { key: "maxIceCubesBottle600", op: ">=", value: 5 } },
    { id: "budget", text: "ราคาไม่เกิน 2,500 บาท", kind: "budget", value: 2500 },
  ]);
});

it.each(["งบไม่เกิน 3000 บาท", "งบ ไม่เกิน 3000 บาท", "งบประมาณ ไม่เกิน 3000 บาท"])("keeps the designer budget from %s", (text) => {
  const requirements = requirementsFromAnswers(pack, { blenderUsage: "ice", iceCubes: "5", container: "bottle600" }, text);
  expect(requirements.filter((requirement) => requirement.kind === "budget").map((requirement) => requirement.value)).toEqual([3000]);
});

it("allows ordinary ice crushing with review evidence without requiring commercial wattage", () => {
  const product = ProductSchema.parse(smoothiePro);
  const requirements = requirementsFromAnswers(pack, { blenderUsage: "ice", iceCubes: "5", container: "bottle600" });
  const general = requirements[0];
  expect(product.specs.watt).toBe(600);
  expect(specCheck(product, general)).toBe("pass");
  const labels = labelWithRules(product, requirements);
  expect(eligibleLabels(product, requirements, labels).some((label) => label.subjectId === general.id)).toBe(true);
  expect(eligibleLabels(product, requirements, labels).some((label) => label.subjectId === "ice-condition")).toBe(false);
  const legacy = requirementsFromAnswers(pack, { use: "ice" });
  expect(legacy).toEqual([pack.questions[0].options[1].requirement]);
  expect(specCheck(product, legacy[0])).toBe("fail");
});

it.each(["pulse", "4–5", "-1", "0", "1001", "Infinity"])("preserves unnormalized count %s without inferring capacity", (iceCubes) => {
  const requirements = requirementsFromAnswers(pack, { blenderUsage: "smoothie", iceCubes, container: "mainJar" });
  expect(requirements[0].id).toBe("smoothie");
  expect(requirements[1]).toMatchObject({ specOnly: true });
  expect(requirements[1].spec).toBeUndefined();
  expect(requirements[1].text).toContain(iceCubes);
});

it("keeps custom usage and container as bounded unknown requirements", () => {
  const requirements = requirementsFromAnswers(pack, { blenderUsage: "ทำซุป", iceCubes: "5", container: "แก้วส่วนตัว" });
  expect(requirements[0]).toMatchObject({ id: "custom-usage", text: "การใช้งาน: ทำซุป", specOnly: true });
  expect(requirements[1].spec).toBeUndefined();
  expect(requirements[1].text).toContain("แก้วส่วนตัว");
  const long = requirementsFromAnswers(pack, { blenderUsage: "ก".repeat(1000), iceCubes: "ก".repeat(1000), container: "ก".repeat(1000) });
  expect(long.every((requirement) => requirement.text.length < 400)).toBe(true);
});

it("preserves legacy answer budget precedence over text", () => {
  expect(requirementsFromAnswers(pack, { use: "ice", budget: "3000" }, "งบ 1000 บาท"))
    .toEqual(requirementsFromAnswers(pack, { use: "ice", budget: "3000" }));
});


it("does not mistake an ice cube limit for a text budget", () => {
  const requirements = requirementsFromAnswers(pack, { blenderUsage: "ice", iceCubes: "5", container: "mainJar" }, "ปั่นน้ำแข็งไม่เกิน 5 ก้อน");
  expect(requirements.some((requirement) => requirement.kind === "budget")).toBe(false);
});


it.each(["8", "8 ก้อน", "๘ ก้อน"])("normalizes exact custom count %s", (iceCubes) => {
  const requirements = requirementsFromAnswers(pack, { blenderUsage: "ice", iceCubes, container: "ขวดปั่น 600 มล." });
  expect(requirements[1]).toMatchObject({ text: "ปั่นน้ำแข็ง 8 ก้อน ในขวดพกพา 600 มล.", spec: { key: "maxIceCubesBottle600", op: ">=", value: 8 } });
});

it.each(["8–10 ก้อน", "8.5 ก้อน", "8 ก้อนขึ้นไป", "8e2", "8/10"])("keeps ambiguous count %s unknown", (iceCubes) => {
  const requirement = requirementsFromAnswers(pack, { blenderUsage: "ice", iceCubes, container: "mainJar" })[1];
  expect(requirement.spec).toBeUndefined();
  expect(requirement.text).toBe(`ปั่นน้ำแข็ง ${iceCubes} ในโถหลัก`);
});

it.each(["งบ 2,50 บาท", "งบ 3000.50.1 บาท", "งบ 1e3 บาท", "งบ 1000-2000 บาท", "งบ 1000 - 2000 บาท", "งบ ไม่เกิน 1000 - 2000 บาท", "งบประมาณ ไม่เกิน 2,50 บาท", "ขอแบบไม่เกิน 8 ก้อน"])("avoids partial budget from %s", (text) => {
  expect(requirementsFromAnswers(pack, { blenderUsage: "ice", iceCubes: "8", container: "mainJar" }, text).some((requirement) => requirement.kind === "budget")).toBe(false);
});

it("preserves the supplied legacy budget in mixed designer answers", () => {
  const requirements = requirementsFromAnswers(pack, { blenderUsage: "ice", iceCubes: "8", container: "mainJar", budget: "3000" }, "งบ 1000 บาท");
  expect(requirements.filter((requirement) => requirement.kind === "budget").map((requirement) => requirement.value)).toEqual([3000]);
});
