import { expect, it, vi, afterEach } from "vitest";
import { runLlmAgent } from "./llm";
import { createTools } from "./tools";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("openai", () => ({ default: class { responses = { create }; } }));
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it("fails before calling the model when configuration is missing", async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  const tools = createTools({ agent: "fit", products: [], requirements: [], emit: () => {} });
  await expect(runLlmAgent({ agent: "fit", requirements: [], tools })).rejects.toThrow("Missing model");
  expect(create).not.toHaveBeenCalled();
});
it("returns tool errors to the model and rejects empty candidate proposals", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test");
  vi.stubEnv("OPENAI_MODEL", "test-model");
  create.mockResolvedValueOnce({ output: [{ type: "function_call", name: "get_product", arguments: "{}", call_id: "call-1" }] })
    .mockResolvedValueOnce({ output: [] });
  const tools = createTools({ agent: "fit", products: [], requirements: [], emit: () => {} });
  await expect(runLlmAgent({ agent: "fit", requirements: [], tools })).rejects.toThrow("No proposals");
  expect(create).toHaveBeenCalledTimes(2);
  expect(create.mock.calls[1][0].input).toContainEqual(expect.objectContaining({
    type: "function_call_output", call_id: "call-1", output: expect.stringContaining("error"),
  }));
});
it("corrects a rejected quote on the next model turn", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test");
  vi.stubEnv("OPENAI_MODEL", "test-model");
  const { ProductSchema } = await import("../types");
  const fixture = await import("../../../data/products/_example.json");
  const product = ProductSchema.parse(fixture.default);
  const tools = createTools({ agent: "fit", products: [product], requirements: [], emit: () => {} });
  const label = { reviewId: "r1", subjectId: "c1", stance: "confirm", target: "product", quote: "fabricated" };
  const call = (quote: string, id: string) => ({
    output: [{ type: "function_call", name: "propose", arguments: JSON.stringify({
      id: product.id, labels: [{ ...label, quote }],
    }), call_id: id }],
  });
  create.mockResolvedValueOnce(call("fabricated", "first"))
    .mockResolvedValueOnce(call(product.reviews[0].text, "corrected"))
    .mockResolvedValueOnce({ output: [] });
  await runLlmAgent({ agent: "fit", requirements: [], tools });
  expect(tools.proposals.get(product.id)?.[0].quote).toBe(product.reviews[0].text);
  expect(create.mock.calls[1][0].input).toContainEqual(expect.objectContaining({
    call_id: "first", output: expect.stringContaining('"accepted":false'),
  }));
});
it("allows Value to finish when no eligible product is found", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test");
  vi.stubEnv("OPENAI_MODEL", "test-model");
  create.mockResolvedValueOnce({ output: [] });
  const tools = createTools({ agent: "value", products: [], requirements: [], emit: () => {} });
  await expect(runLlmAgent({ agent: "value", requirements: [], tools })).resolves.toBeUndefined();
  expect(tools.proposals.size).toBe(0);
});
