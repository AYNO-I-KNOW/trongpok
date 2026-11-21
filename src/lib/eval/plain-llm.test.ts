import { afterEach, expect, it, vi } from "vitest";
import example from "../../../data/products/_example.json";
import { ProductSchema } from "../types";
import { plainLlm } from "./plain-llm";

const { parse } = vi.hoisted(() => ({ parse: vi.fn() }));
vi.mock("openai", () => ({ default: class { responses = { parse }; } }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
const product = ProductSchema.parse(example);

function configure() {
  vi.stubEnv("OPENAI_API_KEY", "test");
  vi.stubEnv("OPENAI_MODEL", "test-model");
}

it("accepts allowed ids and sends only baseline product fields", async () => {
  configure();
  parse.mockResolvedValue({ output_parsed: { ids: [product.id] } });
  expect(await plainLlm("เครื่องปั่น", [product])).toEqual([product.id]);
  const input = JSON.parse(parse.mock.calls[0][0].input);
  expect(input).toEqual({ need: "เครื่องปั่น", products: [{
    id: product.id, title: product.title, priceThb: product.priceThb,
    specs: product.specs, stars: product.stars,
  }] });
  expect(parse.mock.calls[0][0].model).toBe("test-model");
  expect(parse).toHaveBeenCalledTimes(1);
});

it.each([
  ["unknown", { ids: ["unknown"] }],
  ["duplicate", { ids: [product.id, product.id] }],
  ["missing", { ids: [] }],
])("leaves %s model rankings unmeasured", async (_name, output) => {
  configure();
  parse.mockResolvedValue({ output_parsed: output });
  expect(await plainLlm("เครื่องปั่น", [product])).toBeNull();
});

it("leaves failed calls unmeasured", async () => {
  configure();
  parse.mockRejectedValue(new Error("offline"));
  expect(await plainLlm("เครื่องปั่น", [product])).toBeNull();
});

it("skips the model when configuration is missing", async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  expect(await plainLlm("เครื่องปั่น", [product])).toBeNull();
  expect(parse).not.toHaveBeenCalled();
});
