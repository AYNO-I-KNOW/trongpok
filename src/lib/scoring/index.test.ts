import { describe, expect, it } from "vitest";
import example from "../../../data/products/_example.json";
import { ProductSchema, type Label, type Product, type Requirement } from "../types";
import { evidenceCount, fit, rank, requirementResult, reviewWeight, shopScore, specCheck, trust } from "./index";

const base = ProductSchema.parse(example);
const need: Requirement = { id: "ice", text: "ปั่นน้ำแข็ง", kind: "must" };
function product(count = 4): Product {
  return { ...base, reviews: Array.from({ length: count }, (_, i) => ({ id: `r${i}`, text: "ปั่นน้ำแข็งดี", stars: 5, hasMedia: false, daysAgo: 100, isTemplate: false })) };
}
function labels(stances: Label["stance"][], subjectId = "ice"): Label[] {
  return stances.map((stance, i) => ({ reviewId: `r${i}`, subjectId, stance, target: "product", quote: "ปั่นน้ำแข็ง" }));
}

describe("requirement scoring", () => {
  it.each([
    [0, "contradicted", 0],
    [1, "contradicted", 0.25],
    [2, "mixed", 0.5],
    [3, "pass", 0.75],
    [4, "pass", 1],
  ])("scores %i confirming reviews", (confirmations, status, score) => {
    const evidence = labels(Array.from({ length: 4 }, (_, i) => i < confirmations ? "confirm" : "contradict"));
    expect(requirementResult(product(), need, evidence)).toMatchObject({ requirementId: "ice", status, score });
  });
  it("falls back to unknown with fewer than three reviews", () => {
    expect(requirementResult(product(), need, labels(["confirm", "confirm"]))).toMatchObject({ status: "unknown", score: 0.4 });
  });
  it("uses spec-only when specs pass and reviews are sparse", () => {
    expect(requirementResult(product(), { ...need, spec: { key: "watt", op: ">=", value: 600 } }, [])).toMatchObject({ status: "spec-only", score: 0.6 });
  });
  it("fails a spec before counting positive reviews", () => {
    expect(requirementResult(product(), { ...need, spec: { key: "watt", op: ">=", value: 1000 } }, labels(["confirm", "confirm", "confirm"]))).toMatchObject({ status: "fail", score: 0 });
  });
  it.each([[889, "fail", 0], [890, "pass", 1], [891, "pass", 1]])("checks budget %i", (value, status, score) => {
    expect(requirementResult(product(), { id: "budget", text: "งบ", kind: "budget", value }, [])).toMatchObject({ status, score });
  });
  it("drops fake quotes, logistics, and template reviews", () => {
    const p = product();
    p.reviews[2].isTemplate = true;
    const evidence = labels(["confirm", "confirm", "confirm"]);
    evidence[0].quote = "invented";
    evidence[1].target = "logistics";
    expect(requirementResult(p, need, evidence)).toMatchObject({ status: "unknown", score: 0.4, quotes: [] });
  });
  it("does not multiply evidence through duplicated labels", () => {
    const evidence = labels(["confirm"]);
    expect(evidenceCount(product(), [need], [...evidence, ...evidence, ...evidence])).toBe(1);
    expect(requirementResult(product(), need, [...evidence, ...evidence, ...evidence]).status).toBe("unknown");
  });
});

it("weights media and the inclusive recency boundary", () => {
  expect(reviewWeight({ ...base.reviews[0], hasMedia: true, daysAgo: 90 })).toBeCloseTo(1.8);
  expect(reviewWeight({ ...base.reviews[0], hasMedia: false, daysAgo: 91 })).toBe(1);
});
it("checks array inclusion and missing specs", () => {
  const p = { ...product(), specs: { platforms: ["ios", "android"] } };
  expect(specCheck(p, { ...need, spec: { key: "platforms", op: "includes", value: "ios" } })).toBe("pass");
  expect(specCheck(p, { ...need, spec: { key: "absent", op: "==", value: true } })).toBe("unknown");
});
it("withholds trust below ten distinct evidence reviews", () => {
  expect(trust(product(9), [need], labels(Array(9).fill("confirm")))).toBeNull();
  expect(trust(product(10), [need], labels(Array(10).fill("confirm")))).toBeCloseTo(0.7 * 0.4 + 0.3 * shopScore(base.shop));
});
it("ranks must-ok products ahead of products with higher scores", () => {
  const requirements: Requirement[] = [need, ...Array.from({ length: 8 }, (_, i): Requirement => ({ id: `nice${i}`, text: "ดี", kind: "nice", spec: { key: "premium", op: "==", value: true } }))];
  const good = { ...product(), id: "good", specs: { premium: false } };
  const bad = { ...product(), id: "bad", specs: { premium: true } };
  const result = rank([bad, good], requirements, { bad: labels(Array(4).fill("contradict")) });
  expect(result[0].productId).toBe("good");
  expect(result[0].rankScore).toBeLessThan(result[1].rankScore);
});
it("computes positive savings and unused features from the highest-starred alternative", () => {
  const cheap = { ...product(), id: "cheap", priceThb: 500, stars: 4 };
  const premium = { ...product(), id: "premium", priceThb: 1500, stars: 5, features: ["ปั่นน้ำแข็ง", "GPS"] };
  const result = rank([premium, cheap], [need], {});
  expect(result[0]).toMatchObject({ productId: "cheap", savings: 1000, unusedFeatures: ["GPS"] });
  const failed = rank([premium, cheap], [{ ...need, spec: { key: "missing", op: "==", value: true } }], { cheap: labels(Array(4).fill("contradict")), premium: labels(Array(4).fill("contradict")) });
  expect(failed[0].savings).toBeNull();
});
it("keeps the weighted fit before percentage rounding", () => {
  const requirements: Requirement[] = [need, { id: "nice", text: "ดี", kind: "nice" }];
  const results = [{ requirementId: "ice", status: "pass" as const, score: 2 / 3, quotes: [] }, { requirementId: "nice", status: "unknown" as const, score: 0.4, quotes: [] }];
  expect(fit(requirements, results).fit).toBeCloseTo((2 * 2 / 3 + 0.4) / 3);
});
it("shows savings only for the top-ranked product", () => {
  const products = [
    { ...product(), id: "first", priceThb: 500, stars: 4 },
    { ...product(), id: "second", priceThb: 700, stars: 4 },
    { ...product(), id: "premium", priceThb: 1500, stars: 5 },
  ];
  const result = rank(products, [need], {});
  expect(result.map((pick) => pick.productId)).toEqual(["first", "second", "premium"]);
  expect(result.map((pick) => pick.savings)).toEqual([1000, null, null]);
});
it("computes rankScore from unrounded fit", () => {
  const p = product(3);
  const evidence = labels(["confirm", "confirm", "contradict"]);
  const result = rank([p], [need], { [p.id]: evidence });
  expect(result[0].fitPct).toBe(67);
  expect(result[0].rankScore).toBeCloseTo(0.6 * (2 / 3) + 0.25 * 0.4 + 0.15 * 0.5, 12);
});
