import { describe, expect, it } from "vitest";
import example from "../../../data/products/_example.json";
import { ProductSchema, type Label, type Product, type Requirement } from "../types";
import { eligibleLabels, evidenceCount, fit, rank, requirementResult, reviewWeight, reviewQualityWarning, shopScore, specCheck, trust } from "./index";

const base = ProductSchema.parse(example);
const need: Requirement = { id: "ice", text: "ปั่นน้ำแข็ง", kind: "must" };
function product(count = 4): Product {
  return { ...base, reviews: Array.from({ length: count }, (_, i) => ({ id: `r${i}`, text: "ปั่นน้ำแข็งดี", stars: 5, hasMedia: false, daysAgo: 100, isTemplate: false })) };
}
function labels(stances: Label["stance"][], subjectId = "ice"): Label[] {
  return stances.map((stance, i) => ({ reviewId: `r${i}`, subjectId, stance, target: "product", usage: "short", specific: true, quote: "ปั่นน้ำแข็ง" }));
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

it("keeps a product with two concrete must failures behind a supported alternative", () => {
  const risky = { ...product(), id: "risky", priceThb: 500 };
  const supported = { ...product(), id: "supported", priceThb: 1500 };
  const result = rank([risky, supported], [need], {
    risky: labels(["contradict", "contradict"]),
    supported: labels(["confirm", "confirm"]),
  });
  expect(result.map(({ productId, mustOk }) => ({ productId, mustOk }))).toEqual([
    { productId: "supported", mustOk: true }, { productId: "risky", mustOk: false },
  ]);
  expect(result[1].requirements[0].status).toBe("unknown");
});

it("prefers stronger must review support when fit ties", () => {
  const cheaper = { ...product(), id: "cheaper", priceThb: 500 };
  const supported = { ...product(), id: "supported", priceThb: 1500 };
  const result = rank([cheaper, supported], [need, { id: "budget", text: "งบ", kind: "budget", value: 2000 }], {
    cheaper: labels(["confirm"]),
    supported: labels(["confirm", "confirm"]),
  });
  expect(result.map(({ productId }) => productId)).toEqual(["supported", "cheaper"]);
  expect(result[0].fitPct).toBe(result[1].fitPct);
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


it("excludes unboxing and short use from durability requirements with correct fallback messages", () => {
  const longNeed = { ...need, longUse: true };
  const evidence = labels(["confirm", "confirm", "confirm", "confirm"]);
  evidence[0].usage = "unboxing";
  expect(requirementResult(product(), need, evidence).quotes).toHaveLength(3);
  expect(requirementResult(product(), longNeed, evidence)).toMatchObject({ status: "unknown", score: 0.4, message: "ยังไม่มีรีวิวจากคนที่ใช้นานพอ" });
  const specNeed = { ...longNeed, spec: { key: "watt", op: ">=" as const, value: 600 } };
  expect(requirementResult(product(), specNeed, evidence)).toMatchObject({ status: "spec-only", score: 0.6, message: "Shopee ให้รีวิวได้ภายใน 30 วันหลังได้ของ ของที่พังหลังจากนั้นจึงไม่อยู่ในรีวิว" });
  evidence.forEach((label) => { label.usage = "long"; });
  expect(requirementResult(product(), longNeed, evidence).status).toBe("pass");
});
it("discounts generic confirmation but preserves contradiction weight", () => {
  const evidence = labels(["confirm", "confirm", "contradict"]);
  evidence.forEach((label) => { label.specific = false; });
  expect(requirementResult(product(), need, evidence).score).toBeCloseTo(0.6 / 1.6);
  expect(reviewWeight(base.reviews[0], evidence[0])).toBeCloseTo(1.8 * 0.3);
  expect(reviewWeight(base.reviews[0], evidence[2])).toBeCloseTo(1.8);
});
it("warns at sixty percent without changing scores and ignores templates and duplicates", () => {
  const p = product(5);
  const evidence = labels(["confirm", "confirm", "confirm"]);
  evidence.forEach((label) => { label.specific = false; });
  expect(reviewQualityWarning(p, [need], [...evidence, ...evidence])).toMatchObject({ percent: 60 });
  expect(reviewQualityWarning(product(6), [need], evidence)).toBeNull();
  p.reviews[0].isTemplate = true;
  expect(reviewQualityWarning(p, [need], evidence)).toBeNull();
});
it("keeps unboxing evidence only for appearance claims and counts each eligible review once", () => {
  const p = product(10);
  const evidence = labels(Array(10).fill("confirm"), "c1").map((label) => ({ ...label, usage: "unboxing" as const }));
  expect(evidenceCount(p, [], evidence)).toBe(0);
  expect(trust(p, [], evidence)).toBeNull();
  p.claims = [{ id: "c1", text: "เสียงเบา", source: "description", checkable: true }];
  expect(evidenceCount(p, [], evidence)).toBe(0);
  p.claims = [{ id: "c1", text: "สีสวย", source: "description", checkable: true }];
  expect(evidenceCount(p, [], [...evidence, ...evidence])).toBe(10);
  expect(trust(p, [], evidence)).not.toBeNull();
});

it("weights claim trust confirmations while preserving full contradiction weight", () => {
  const p = product(10);
  p.claims = [{ id: "c1", text: "ปั่นน้ำแข็ง", source: "description", checkable: true }];
  const evidence = labels([...Array(9).fill("confirm"), "contradict"], "c1")
    .map((label) => ({ ...label, specific: false }));
  expect(trust(p, [], evidence)).toBeCloseTo(0.7 * (2.7 / 3.7) + 0.3 * shopScore(p.shop));
});
it("requires three eligible long-use reviews and gives failed specs priority", () => {
  const longNeed = { ...need, longUse: true };
  const evidence = labels(["confirm", "confirm", "confirm"]).map((label) => ({ ...label, usage: "long" as const }));
  expect(requirementResult(product(), longNeed, evidence.slice(0, 2)).status).toBe("unknown");
  expect(requirementResult(product(), longNeed, evidence).status).toBe("pass");
  expect(requirementResult(product(), {
    ...longNeed, spec: { key: "watt", op: ">=", value: 1000 },
  }, evidence)).toMatchObject({ status: "fail", score: 0 });
});
it("counts unlabeled unboxing once and warns without reducing computed scores", () => {
  const p = product(5);
  p.reviews.slice(0, 3).forEach((review) => { review.text = "แกะกล่องแล้วสวย"; });
  const before = rank([p], [need], {})[0];
  expect(before.reviewQualityWarning).toMatchObject({ percent: 60 });
  const clean = { ...p, reviews: p.reviews.map((review) => ({ ...review, text: "ลองใช้งานแล้ว" })) };
  const after = rank([clean], [need], {})[0];
  expect(after.reviewQualityWarning).toBeNull();
  expect(before.rankScore).toBe(after.rankScore);
  p.reviews.push({ ...p.reviews[4], id: "extra" });
  expect(reviewQualityWarning(p, [need], [])).toBeNull();
});


it("cannot use broad ice quotes to prove exact container capacity or affect trust", () => {
  const exact: Requirement = { id: "ice-condition", text: "ปั่นน้ำแข็ง 5 ก้อนในขวด 600 มล.", kind: "must", specOnly: true, spec: { key: "maxIceCubesBottle600", op: ">=", value: 5 } };
  const p = product(10);
  const evidence = labels(Array(10).fill("confirm"), exact.id);
  expect(requirementResult(p, exact, evidence)).toMatchObject({ status: "unknown", score: 0.4, quotes: [] });
  expect(evidenceCount(p, [exact], evidence)).toBe(0);
  expect(trust(p, [exact], evidence)).toBeNull();
  expect(eligibleLabels(p, [exact], labels(["contradict"], exact.id))).toEqual([]);
  expect(requirementResult({ ...p, specs: { maxIceCubesBottle600: 5 } }, exact, evidence)).toMatchObject({ status: "spec-only", score: 0.6, quotes: [] });
  expect(requirementResult({ ...p, specs: { maxIceCubesBottle600: 4 } }, exact, evidence)).toMatchObject({ status: "fail", score: 0, quotes: [] });
});
