import { expect, it, vi, afterEach } from "vitest";
import iceStation from "../../../data/products/blender-ice-station.json";
import example from "../../../data/products/_example.json";
import { ProductSchema } from "../types";
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
    { reviewId: "r14", subjectId: "ice", stance: "confirm" },
    { reviewId: "r3", subjectId: "ice", stance: "confirm" },
    { reviewId: "r2", subjectId: "ice", stance: "contradict" },
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
    { productId: "alien", evidence: [{ reviewId: "r14", subjectId: "ice", stance: "confirm" }] },
    { productId: product.id, evidence: [
      { reviewId: "alien", subjectId: "ice", stance: "confirm" },
      { reviewId: "r14", subjectId: "alien", stance: "confirm" },
      { reviewId: "r14", subjectId: "ice", stance: "confirm" },
      { reviewId: "r14", subjectId: "ice", stance: "confirm" },
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
    { reviewId: "r2", subjectId: "ice", stance: "contradict" },
    { reviewId: "r3", subjectId: "ice", stance: "confirm" },
  ] }] } });
  const tools = createTools({ agent: "skeptic", products: [failed], requirements, emit: () => {} });
  await runLlmAgent({ agent: "skeptic", category: "blender", requirements, tools });
  expect(tools.proposals.get(failed.id)).toHaveLength(1);
  expect(tools.proposals.get(failed.id)?.[0]).toMatchObject({ reviewId: "r2", stance: "contradict", quote: failed.reviews[1].text });
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
