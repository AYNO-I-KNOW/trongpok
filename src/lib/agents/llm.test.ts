import { expect, it, vi, afterEach } from "vitest";
import iceStation from "../../../data/products/blender-ice-station.json";
import example from "../../../data/products/_example.json";
import { ProductSchema, type Requirement } from "../types";
import { runLlmAgent } from "./llm";
import { createTools } from "./tools";

const { parse } = vi.hoisted(() => ({ parse: vi.fn() }));
vi.mock("openai", () => ({ default: class { responses = { parse }; } }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
const product = ProductSchema.parse(iceStation);
const requirements = [{ id: "ice", text: "ปั่นน้ำแข็งได้ต่อเนื่องโดยมอเตอร์ไม่ไหม้", kind: "must" as const }];
const configure = () => {
  vi.stubEnv("OPENAI_API_KEY", "test");
  vi.stubEnv("OPENAI_MODEL", "test-model");
};

it("fails before calling the model when configuration is missing", async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  const tools = createTools({ agent: "fit", products: [], requirements: [], emit: () => {} });
  await expect(runLlmAgent({ agent: "fit", requirements: [], tools })).rejects.toThrow("Missing model");
  expect(parse).not.toHaveBeenCalled();
});

it("uses one model call and restores original daily workload evidence", async () => {
  configure();
  parse.mockResolvedValue({ output_parsed: { proposals: [{ productId: product.id, evidence: [
    { subjectId: "ice", confirm: ["r14"], contradict: [] },
    { subjectId: "ice", confirm: ["r3"], contradict: [] },
    { subjectId: "ice", confirm: [], contradict: ["r2"] },
  ] }] } });
  const tools = createTools({ agent: "fit", products: [product], requirements, emit: () => {} });
  await runLlmAgent({ agent: "fit", category: "blender", needText: "วันละ 50 แก้ว", requirements, tools });
  expect(parse).toHaveBeenCalledTimes(1);
  expect(parse.mock.calls[0][0].reasoning).toEqual({ effort: "low" });
  const payload = JSON.parse(parse.mock.calls[0][0].input);
  expect(payload.catalog[0].reviews).toContainEqual({
    id: "r14", text: "ทำร้านมา 4 เดือน ใช้วันละสี่สิบถึงห้าสิบแก้ว ยังไม่เคยเครื่องตัด",
  });
  expect(payload.catalog[0].reviews).not.toContainEqual(expect.objectContaining({ id: "r10" }));
  expect(tools.proposals.get(product.id)).toContainEqual(expect.objectContaining({
    reviewId: "r14", subjectId: "ice", stance: "confirm", usage: "long", specific: true,
    quote: "ทำร้านมา 4 เดือน ใช้วันละสี่สิบถึงห้าสิบแก้ว ยังไม่เคยเครื่องตัด",
  }));
  expect(tools.proposals.get(product.id)).not.toContainEqual(expect.objectContaining({ reviewId: "r2" }));
});

it("drops invented references and duplicate pairs while preserving valid evidence", async () => {
  configure();
  parse.mockResolvedValue({ output_parsed: { proposals: [
    { productId: "alien", evidence: [{ subjectId: "ice", confirm: ["r14"], contradict: [] }] },
    { productId: product.id, evidence: [
      { subjectId: "ice", confirm: ["alien"], contradict: [] },
      { subjectId: "alien", confirm: ["r14"], contradict: [] },
      { subjectId: "ice", confirm: ["r14"], contradict: [] },
      { subjectId: "ice", confirm: ["r14"], contradict: [] },
    ] },
  ] } });
  const tools = createTools({ agent: "fit", products: [product], requirements, emit: () => {} });
  await runLlmAgent({ agent: "fit", category: "blender", requirements, tools });
  expect(tools.proposals.size).toBe(1);
  expect(tools.proposals.get(product.id)).toHaveLength(1);
});

it("keeps skeptic evidence as contradictions from the allowed product pool", async () => {
  configure();
  const failed = ProductSchema.parse(example);
  parse.mockResolvedValue({ output_parsed: { proposals: [{ productId: failed.id, evidence: [
    { subjectId: "ice", confirm: ["r2"], contradict: ["r2"] },
    { subjectId: "ice", confirm: ["r3"], contradict: [] },
  ] }] } });
  const tools = createTools({ agent: "skeptic", products: [failed], requirements, emit: () => {} });
  await runLlmAgent({ agent: "skeptic", category: "blender", requirements, tools });
  expect(tools.proposals.get(failed.id)).toHaveLength(1);
  expect(tools.proposals.get(failed.id)?.[0]).toMatchObject({ reviewId: "r2", stance: "contradict", quote: failed.reviews[1].text });
});

it("keeps short reviews describing a failure after long use", async () => {
  configure();
  const review = { ...product.reviews[0], text: "ใช้มา 4 เดือน เครื่องดับ" };
  const failed = { ...product, reviews: [review] };
  const requirements = [{ id: "durability", text: "ใช้ต่อเนื่องได้", kind: "must" as const, longUse: true }];
  parse.mockResolvedValue({ output_parsed: { proposals: [{ productId: failed.id, evidence: [
    { subjectId: "durability", confirm: [], contradict: [review.id] },
  ] }] } });
  const tools = createTools({ agent: "skeptic", products: [failed], requirements, emit: () => {} });
  await runLlmAgent({ agent: "skeptic", category: "blender", requirements, tools });
  expect(tools.proposals.get(failed.id)?.[0]).toMatchObject({
    reviewId: review.id, usage: "long", stance: "contradict", specific: false, quote: review.text,
  });
});

it("allows Value to finish without candidates and rejects an empty Fit result", async () => {
  configure();
  parse.mockResolvedValue({ output_parsed: { proposals: [] } });
  const value = createTools({ agent: "value", products: [product], requirements, emit: () => {} });
  await expect(runLlmAgent({ agent: "value", category: "blender", requirements, tools: value })).resolves.toBeUndefined();
  const fit = createTools({ agent: "fit", products: [product], requirements, emit: () => {} });
  await expect(runLlmAgent({ agent: "fit", category: "blender", requirements, tools: fit })).rejects.toThrow("No proposals");
});

it("propagates a failed structured response for the rules fallback", async () => {
  configure();
  parse.mockResolvedValue({ output_parsed: null });
  const tools = createTools({ agent: "fit", products: [product], requirements, emit: () => {} });
  await expect(runLlmAgent({ agent: "fit", category: "blender", requirements, tools })).rejects.toThrow("Missing agent evidence");
});


it("expands grouped evidence without capping reviews and preserves exact quotes", async () => {
  configure();
  vi.stubEnv("OPENAI_MODEL", "gpt-6-luna");
  const reviews = Array.from({ length: 15 }, (_, index) => ({
    ...product.reviews[0], id: `evidence-${index}`, text: `ใช้มา 4 เดือน เครื่องดับ ครั้งที่ ${index}`,
  }));
  const failed = { ...product, reviews };
  const requirements = [{ id: "durability", text: "ใช้ต่อเนื่องได้", kind: "must" as const, longUse: true }];
  parse.mockResolvedValue({ output_parsed: { proposals: [{ productId: failed.id, evidence: [
    { subjectId: "durability", confirm: [], contradict: [...reviews.map(({ id }) => id), reviews[0].id] },
    { subjectId: "durability", confirm: [], contradict: [reviews[0].id] },
  ] }] } });
  const tools = createTools({ agent: "skeptic", products: [failed], requirements, emit: () => {} });
  await runLlmAgent({ agent: "skeptic", category: "blender", requirements, tools });
  expect(parse.mock.calls[0][0].reasoning).toEqual({ effort: "low" });
  expect(tools.proposals.get(failed.id)).toHaveLength(reviews.length);
  expect(tools.proposals.get(failed.id)?.map(({ quote }) => quote)).toEqual(reviews.map(({ text }) => text));
});

it.each(["fit", "value"] as const)("drops ambiguous %s evidence across groups and repeated proposals", async (agent) => {
  configure();
  const requirements = [{ id: "ice", text: "ปั่นน้ำแข็งได้ต่อเนื่องโดยมอเตอร์ไม่ไหม้", kind: "nice" as const }];
  parse.mockResolvedValue({ output_parsed: { proposals: [
    { productId: product.id, evidence: [
      { subjectId: "ice", confirm: ["r14"], contradict: ["r14"] },
      { subjectId: "ice", confirm: ["r3"], contradict: [] },
      { subjectId: "ice", confirm: [], contradict: ["r3"] },
      { subjectId: "ice", confirm: [], contradict: ["r1"] },
    ] },
    { productId: product.id, evidence: [
      { subjectId: "ice", confirm: ["r1", "r12"], contradict: [] },
    ] },
  ] } });
  const tools = createTools({ agent, products: [product], requirements, emit: () => {} });
  await runLlmAgent({ agent, category: "blender", requirements, tools });
  expect(tools.proposals.get(product.id)?.map(({ reviewId }) => reviewId)).toEqual(["r12"]);
});


it.each([
  { name: "one review requirement with explicit specs", model: "gpt-6-luna", reviewCount: 1, specOnly: true, effort: "none" },
  { name: "multiple review requirements with specs", model: "gpt-6-luna", reviewCount: 2, specOnly: true, effort: "low" },
  { name: "one review requirement without specs", model: "gpt-6-luna", reviewCount: 1, specOnly: false, effort: "low" },
  { name: "another model with one review requirement and specs", model: "test-model", reviewCount: 1, specOnly: true, effort: "low" },
])("uses $effort reasoning for $name", async ({ model, reviewCount, specOnly, effort }) => {
  configure();
  vi.stubEnv("OPENAI_MODEL", model);
  const selected: Requirement[] = Array.from({ length: reviewCount }, (_, index) => ({
    id: `review-${index}`, text: "ใช้ต่อเนื่องได้", kind: "must",
  }));
  selected.push({ id: "budget", text: "ไม่เกิน 5000 บาท", kind: "budget", value: 5000 });
  if (specOnly) selected.push({ id: "capacity", text: "โถ 2 ลิตร", kind: "must", specOnly: true });
  parse.mockResolvedValue({ output_parsed: { proposals: [] } });
  const tools = createTools({ agent: "value", products: [product], requirements: selected, emit: () => {} });
  await runLlmAgent({ agent: "value", category: "blender", needText: "ใช้ต่อเนื่องได้", requirements: selected, tools });
  expect(parse).toHaveBeenCalledTimes(1);
  expect(parse.mock.calls[0][0].reasoning).toEqual({ effort });
});
