import { afterEach, expect, it, vi } from "vitest";
import { judge } from "./judge";
import { rank } from "../scoring";
import example from "../../../data/products/_example.json";
import { ProductSchema } from "../types";

const { parse } = vi.hoisted(() => ({ parse: vi.fn() }));
vi.mock("openai", () => ({ default: class { responses = { parse }; } }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
it("explains rules results while preserving computed values and ordering", async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  const product = ProductSchema.parse(example);
  const ranked = rank([product, { ...product, id: "alternative", priceThb: 1000 }], [], {});
  const result = await judge(ranked, []);
  expect(result.mode).toBe("rules");
  expect(result.ranked.map(({ why, tradeoff, ...row }) => {
    expect(why).toBeTruthy(); expect(tradeoff).toBeTruthy(); return row;
  })).toEqual(ranked.map((row) => { const copy = { ...row }; Reflect.deleteProperty(copy, "why"); return copy; }));
});

it("maps reversed model explanations without reordering or changing scores", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test");
  vi.stubEnv("OPENAI_MODEL", "test-model");
  const product = ProductSchema.parse(example);
  const ranked = rank([product, { ...product, id: "alternative", priceThb: 1000 }], [], {});
  parse.mockResolvedValue({ output_parsed: { picks: ranked.toReversed().map((row) => ({
    productId: row.productId, why: "เหมาะ " + row.productId, tradeoff: "ข้อมูลจำกัด",
  })) } });
  const result = await judge(ranked, []);
  expect(result.mode).toBe("llm");
  expect(result.ranked.map((row) => row.productId)).toEqual(ranked.map((row) => row.productId));
  expect(result.ranked.map((row) => row.rankScore)).toEqual(ranked.map((row) => row.rankScore));
  expect(result.ranked[0].why).toBe("เหมาะ " + ranked[0].productId);
  expect(parse).toHaveBeenCalledTimes(1);
  expect(parse.mock.calls[0][0].reasoning).toEqual({ effort: "low" });
});
it("falls back when the judge invents a product id", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test");
  vi.stubEnv("OPENAI_MODEL", "test-model");
  parse.mockResolvedValue({ output_parsed: { picks: [{ productId: "alien", why: "เหตุผล", tradeoff: "ข้อแลกเปลี่ยน" }] } });
  const ranked = rank([ProductSchema.parse(example)], [], {});
  const result = await judge(ranked, []);
  expect(result.mode).toBe("rules");
  expect(result.ranked[0].productId).toBe(ranked[0].productId);
});


it("uses no reasoning only for the configured gpt-6-luna grounded summary", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test");
  vi.stubEnv("OPENAI_MODEL", "gpt-6-luna");
  const ranked = rank([ProductSchema.parse(example)], [], {});
  parse.mockResolvedValue({ output_parsed: { picks: ranked.map(({ productId }) => ({
    productId, why: "หลักฐานจำกัด", tradeoff: "ควรตรวจเพิ่มเติม",
  })) } });
  expect((await judge(ranked, [])).mode).toBe("llm");
  expect(parse.mock.calls[0][0].reasoning).toEqual({ effort: "none" });
});
