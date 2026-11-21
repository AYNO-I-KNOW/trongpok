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
  expect(new Set(result.events.map((event) => event.agent))).toEqual(new Set(["fit", "value", "skeptic"]));
  expect(result.events.some((event) => event.type === "step")).toBe(true);
  expect(result.events.some((event) => event.type === "candidate")).toBe(true);
});
it("handles an empty catalog", async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  const result = await runArena({ pack, requirements: [], products: [] });
  expect(result.ranked).toEqual([]);
  expect(result.events.filter((event) => event.type === "start").map((event) => event.agent)).toEqual(["fit", "value", "skeptic"]);
});
it("rejects invented quotes and out-of-scope products", () => {
  const emit = vi.fn();
  const tools = createTools({ agent: "skeptic", products: [product], requirements: [], allowedIds: [product.id], emit });
  expect(tools.propose(product.id, [{ reviewId: "r1", subjectId: "c1", stance: "contradict", target: "product", usage: "short", specific: true, quote: "invented" }])).toEqual({ accepted: false, reason: "หลักฐานหรือข้อความอ้างอิงไม่ถูกต้อง" });
  expect(tools.propose("other", []).accepted).toBe(false);
  expect(tools.proposals.size).toBe(0);
  expect(emit).toHaveBeenCalled();
});
it("requires value candidates to pass all musts", () => {
  const tools = createTools({ agent: "value", products: [product], requirements: [{ id: "unknown", text: "unknown", kind: "must" }], emit: () => {} });
  expect(tools.propose(product.id, []).accepted).toBe(false);
});

it("rejects a Value proposal with concrete must objections despite a passing spec", () => {
  const requirement = { id: "ice", text: "ปั่นน้ำแข็ง", kind: "must" as const,
    spec: { key: "watt", op: ">=" as const, value: 600 } };
  const tools = createTools({ agent: "value", products: [product], requirements: [requirement], emit: () => {} });
  const labels = product.reviews.slice(1, 3).map((review) => ({
    reviewId: review.id, subjectId: requirement.id, stance: "contradict" as const,
    target: "product" as const, quote: review.text, usage: "short" as const, specific: true,
  }));
  expect(tools.propose(product.id, labels).accepted).toBe(false);
  expect(tools.propose(product.id, []).accepted).toBe(true);
});

it("streams exact skeptic quotes and exposes only its objections", async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  const observed: AgentEvent[] = [];
  const result = await runArena({ pack, requirements: [], linkedProductId: product.id, products: [product] }, (event) => observed.push(event));
  expect(observed).toEqual(result.events);
  const objections = result.events.filter((event) => event.type === "objection");
  expect(objections).toHaveLength(1);
  const returned = result.ranked[0].objections;
  expect(returned.length).toBeGreaterThan(0);
  expect(objections[0]).toMatchObject({ agent: "skeptic", productId: product.id, quote: returned[0].quote });
  for (const objection of returned) {
    expect(objection).toMatchObject({ stance: "contradict", target: "product" });
    expect(product.reviews.find((review) => review.id === objection.reviewId)?.text).toContain(objection.quote);
  }
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
  const tools = createTools({ agent: "skeptic", products, requirements: [], allowedIds: [products[0].id], emit: () => {} });
  expect(tools.get_product(products[1].id)).toBeNull();
  expect(tools.search_catalog(pack.id).map((item) => item.id)).toEqual([products[0].id]);
  expect(tools.propose(products[1].id, []).accepted).toBe(false);
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

it.each([false, true])("scopes Skeptic after parallel Fit and Value, with linked reserve: %s", async (withLink) => {
  vi.stubEnv("OPENAI_API_KEY", "test");
  vi.stubEnv("OPENAI_MODEL", "test");
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const [linked, cheapest, second, third, expensive] = [5000, 500, 1000, 1500, 2000].map((priceThb, index) => ({
    ...product, id: `candidate-${index}`, priceThb,
  }));
  let skepticPool: string[] | undefined;
  let inspectedExcluded: unknown[] = [];
  let finishedBeforeSkeptic: string[] = [];
  const finished: string[] = [];
  vi.mocked(runLlmAgent).mockImplementation(async ({ agent, tools }) => {
    await gate;
    if (agent === "fit") {
      for (const item of [expensive, third, second]) tools.propose(item.id, []);
    } else if (agent === "value") {
      tools.propose(cheapest.id, []);
    } else {
      finishedBeforeSkeptic = finished.slice();
      skepticPool = tools.search_catalog(pack.id).map(({ id }) => id);
      inspectedExcluded = [tools.get_product(expensive.id), tools.get_reviews(expensive.id, "")];
    }
    finished.push(agent);
  });
  const pending = runArena({
    pack, requirements: [{ id: "budget", kind: "budget", text: "ราคาไม่เกิน 3,000 บาท", value: 3000 }],
    products: [linked, expensive, third, second, cheapest], linkedProductId: withLink ? linked.id : undefined,
  });
  const started = vi.mocked(runLlmAgent).mock.calls.map(([input]) => input.agent);
  release();
  const result = await pending;
  expect(started).toEqual(["fit", "value"]);
  expect(finishedBeforeSkeptic).toEqual(["fit", "value"]);
  expect(inspectedExcluded).toEqual([null, []]);
  const expected = [cheapest.id, second.id, withLink ? linked.id : third.id];
  expect(skepticPool?.toSorted()).toEqual(expected.toSorted());
  expect(result.ranked.map(({ productId }) => productId)).toEqual(expected);
  if (withLink) {
    expect(result.mode).toBe("rules");
    expect(result.events).toContainEqual(expect.objectContaining({ agent: "judge", productId: linked.id }));
  }
});

it("fills unused shortlist slots with catalog candidates before Skeptic starts", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test");
  vi.stubEnv("OPENAI_MODEL", "test");
  const linked = { ...product, id: "linked" };
  const alternative = { ...product, id: "alternative" };
  let scope: string[] | undefined;
  vi.mocked(runLlmAgent).mockImplementation(async ({ agent, tools }) => {
    if (agent === "fit") tools.propose(alternative.id, []);
    if (agent === "skeptic") scope = tools.search_catalog(pack.id).map(({ id }) => id);
  });
  const result = await runArena({ pack, requirements: [], products: [product, linked, alternative], linkedProductId: linked.id });
  expect(scope).toEqual([product.id, linked.id, alternative.id]);
  expect(result.ranked.map(({ productId }) => productId).toSorted()).toEqual([product.id, linked.id, alternative.id].toSorted());
  expect(result.mode).toBe("rules");
  expect(result.events).toContainEqual(expect.objectContaining({ agent: "judge", productId: product.id }));
});

it("reranks the vetted finalists after concrete Skeptic objections", async () => {
  vi.stubEnv("OPENAI_API_KEY", "test");
  vi.stubEnv("OPENAI_MODEL", "test");
  const requirement = { id: "ice", kind: "must" as const, text: "ปั่นน้ำแข็ง", spec: { key: "watt", op: ">=" as const, value: 600 } };
  const first = { ...product, id: "first", priceThb: 500 };
  const second = { ...product, id: "second", priceThb: 1000 };
  const warnings = first.reviews.slice(1, 3).map(({ id, text }) => ({
    reviewId: id, quote: text, subjectId: requirement.id, stance: "contradict" as const, target: "product" as const, usage: "short" as const, specific: true,
  }));
  vi.mocked(runLlmAgent).mockImplementation(async ({ agent, tools }) => {
    if (agent === "fit") tools.propose(second.id, []);
    if (agent === "value") tools.propose(first.id, []);
    if (agent === "skeptic") tools.propose(first.id, warnings);
  });
  const result = await runArena({ pack, requirements: [requirement], products: [first, second] });
  expect(result.ranked.map(({ productId, mustOk }) => [productId, mustOk])).toEqual([[second.id, true], [first.id, false]]);
  expect(result.ranked[1].objections).toEqual(warnings);
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

it("rejects short-use skeptic evidence for a long-use requirement", () => {
  const requirement = { id: "durable", text: "ใช้ได้นาน", kind: "must" as const, longUse: true };
  const tools = createTools({ agent: "skeptic", products: [product], requirements: [requirement], emit: () => {} });
  const label = { reviewId: product.reviews[0].id, subjectId: requirement.id, stance: "contradict" as const,
    target: "product" as const, quote: product.reviews[0].text, usage: "short" as const, specific: true };
  expect(tools.propose(product.id, [label]).accepted).toBe(false);
  expect(tools.propose(product.id, [{ ...label, usage: "long" }]).accepted).toBe(true);
});

it("lets Skeptic retrieve a relevant short-use failure past the preview limit", () => {
  const requirement = { id: "ice", text: "ปั่นน้ำแข็งได้ต่อเนื่องโดยมอเตอร์ไม่ไหม้", kind: "must" as const };
  const review = { ...product.reviews[0], isTemplate: false };
  const reviews = [
    ...Array.from({ length: 6 }, (_, index) => ({
      ...review, id: String(index), text: "ใช้มา 2 เดือน ปั่นน้ำแข็งทุกวันมอเตอร์ไม่ไหม้",
    })),
    { ...review, id: "failure", text: "ลองมา 3 วัน ปั่นน้ำแข็งแล้วเครื่องตัด" },
  ];
  const tools = createTools({ agent: "skeptic", products: [{ ...product, reviews }], requirements: [requirement], emit: () => {} });
  const preview = tools.get_product(product.id)?.reviewEvidence[0];
  expect(preview?.matchingReviewCount).toBe(7);
  expect(preview?.reviews).toHaveLength(6);
  expect(tools.get_reviews(product.id, "", requirement.id)).toContainEqual(reviews[6]);
});

it("preserves long-use warnings in schema-validated arena results", async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  const { ArenaResultSchema } = await import("../types");
  const reviews = Array.from({ length: 5 }, (_, index) => ({
    ...product.reviews[0], id: String(index), text: "แกะกล่องแล้วสวยดีมาก", isTemplate: false,
  }));
  const result = ArenaResultSchema.parse(await runArena({
    pack, products: [{ ...product, reviews }],
    requirements: [{ id: "duration", text: "ใช้นาน", kind: "must", longUse: true }],
  }));
  expect(result.ranked[0].requirements[0]).toMatchObject({ status: "unknown", message: "ยังไม่มีรีวิวจากคนที่ใช้นานพอ" });
  expect(result.ranked[0].reviewQualityWarning?.percent).toBe(100);
  expect(result.ranked[0].requirements[0].quotes).toEqual([]);
});
