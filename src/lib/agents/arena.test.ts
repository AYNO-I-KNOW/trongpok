import { afterEach, expect, it, vi } from "vitest";
import example from "../../../data/products/_example.json";
import category from "../../../data/categories/blender.json";
import { CategoryPackSchema, ProductSchema, type AgentEvent } from "../types";
import { runArena } from "./arena";
import { createTools } from "./tools";
import { runLlmAgent } from "./llm";

vi.mock("./llm", () => ({ runLlmAgent: vi.fn() }));

afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
const product = ProductSchema.parse(example);
const pack = CategoryPackSchema.parse(category);
it("runs linked rules roles and returns ranked products", async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  const result = await runArena({ pack, requirements: [], linkedProductId: product.id, products: [product] });
  expect(result.mode).toBe("rules");
  expect(result.ranked[0].productId).toBe(product.id);
  expect(new Set(result.events.map((event) => event.agent))).toEqual(new Set(["verifier", "fit", "value", "skeptic"]));
  expect(result.events.some((event) => event.type === "step")).toBe(true);
  expect(result.events.some((event) => event.type === "candidate")).toBe(true);
});
it("omits verifier without a link and handles an empty catalog", async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  const result = await runArena({ pack, requirements: [], products: [] });
  expect(result.ranked).toEqual([]);
  expect(result.events.some((event) => event.agent === "verifier")).toBe(false);
});
it("rejects invented quotes and out-of-scope products", () => {
  const emit = vi.fn();
  const tools = createTools({ agent: "skeptic", products: [product], requirements: [], allowedIds: [product.id], emit });
  expect(tools.propose(product.id, [{ reviewId: "r1", subjectId: "c1", stance: "contradict", target: "product", quote: "invented" }]).accepted).toBe(false);
  expect(tools.propose("other", []).accepted).toBe(false);
  expect(tools.proposals.size).toBe(0);
  expect(emit).toHaveBeenCalled();
});
it("requires value candidates to pass all musts", () => {
  const tools = createTools({ agent: "value", products: [product], requirements: [{ id: "unknown", text: "unknown", kind: "must" }], emit: () => {} });
  expect(tools.propose(product.id, []).accepted).toBe(false);
});

it("streams exact skeptic quotes and exposes only its objections", async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  const observed: AgentEvent[] = [];
  const result = await runArena({ pack, requirements: [], linkedProductId: product.id, products: [product] }, (event) => observed.push(event));
  expect(observed).toEqual(result.events);
  const objections = result.events.filter((event) => event.type === "objection");
  expect(objections).toHaveLength(1);
  expect(result.ranked[0].objections).toHaveLength(1);
  expect(objections[0].quote).toBe(result.ranked[0].objections[0].quote);
  expect(product.reviews.some((review) => review.text.includes(objections[0].quote!))).toBe(true);
});
it("allows skeptic to finish without an objection", async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  const positive = { ...product, reviews: [product.reviews[0]] };
  const result = await runArena({ pack, requirements: [], products: [positive] });
  expect(result.events.filter((event) => event.type === "objection")).toEqual([]);
});
it("enforces proposal caps and linked and top-three scope", () => {
  const products = Array.from({ length: 4 }, (_, index) => ({ ...product, id: `item-${index}` }));
  const fit = createTools({ agent: "fit", products, requirements: [], emit: () => {} });
  products.slice(0, 3).forEach((item) => expect(fit.propose(item.id, []).accepted).toBe(true));
  expect(fit.propose(products[3].id, []).accepted).toBe(false);
  for (const agent of ["verifier", "skeptic"] as const) {
    const tools = createTools({ agent, products, requirements: [], allowedIds: [products[0].id], emit: () => {} });
    expect(tools.get_product(products[1].id)).toBeNull();
    expect(tools.search_catalog(pack.id).map((item) => item.id)).toEqual([products[0].id]);
    expect(tools.propose(products[1].id, []).accepted).toBe(false);
  }
});
it("does not let cheap unknown products displace passing value choices", async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  const unknown = Array.from({ length: 3 }, (_, index) => ({ ...product, id: `unknown-${index}`, priceThb: 1, specs: {}, reviews: [] }));
  const passing = { ...product, id: "passing", specs: { watt: 1000 }, reviews: [] };
  const result = await runArena({ pack, requirements: [{ id: "power", text: "กำลังไฟ", kind: "must", spec: { key: "watt", op: ">=", value: 1000 } }], products: [...unknown, passing] });
  expect(result.events.filter((event) => event.agent === "value" && event.type === "candidate").map((event) => event.productId)).toEqual(["passing"]);
});
it("discards partial model proposals before falling back", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test");
  vi.stubEnv("OPENAI_MODEL", "test");
  vi.mocked(runLlmAgent).mockImplementation(async ({ agent, tools }) => {
    if (agent === "fit") {
      tools.propose(product.id, []);
      throw new Error("interrupted");
    }
    if (agent === "value") tools.propose(product.id, []);
  });
  const result = await runArena({ pack, requirements: [], products: [product] });
  expect(result.mode).toBe("rules");
  expect(result.events.filter((event) => event.agent === "fit" && event.type === "candidate")).toHaveLength(1);
  expect(result.ranked).toHaveLength(1);
});
it("orders equally fitting products by evidence independently of input order", async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  const reviews = Array.from({ length: 5 }, (_, index) => ({
    id: `evidence-${index}`, text: "น้ำแข็งละเอียดดี", stars: 5,
    hasMedia: false, daysAgo: 10, isTemplate: false,
  }));
  const stronger = { ...product, id: "stronger", priceThb: 2000, reviews };
  const cheaper = { ...product, id: "cheaper", priceThb: 500, reviews: reviews.slice(0, 3) };
  const requirements = [{ id: "ice", text: "น้ำแข็งละเอียด", kind: "must" as const }];
  const candidateOrders = [];
  for (const products of [[cheaper, stronger], [stronger, cheaper]]) {
    const result = await runArena({ pack, requirements, products });
    expect(result.ranked.map((pick) => pick.fitPct)).toEqual([100, 100]);
    candidateOrders.push(result.events.filter((event) =>
      event.agent === "fit" && event.type === "candidate").map((event) => event.productId));
  }
  expect(candidateOrders).toEqual([["stronger", "cheaper"], ["stronger", "cheaper"]]);
});
