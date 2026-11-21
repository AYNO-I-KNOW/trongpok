import { reviewUsage } from "../labeling/rules";
import type { Label, Product, Ranked, Requirement, RequirementResult, Review, Shop } from "../types";

export function reviewWeight(review: Review, label?: Pick<Label, "stance" | "specific">) {
  return (review.hasMedia ? 1.5 : 1) * (review.daysAgo <= 90 ? 1.2 : 1) * (label?.stance === "confirm" && !label.specific ? 0.3 : 1);
}

export function validLabels(product: Product, labels: Label[]) {
  const unique = new Map<string, Label>();
  for (const label of labels) {
    const review = product.reviews.find((item) => item.id === label.reviewId);
    if (!review || review.isTemplate || label.target !== "product" || label.stance === "none" || !label.quote.trim() || !review.text.includes(label.quote)) continue;
    unique.set(JSON.stringify([label.reviewId, label.subjectId]), label);
  }
  return [...unique.values()];
}

const thaiWords = new Intl.Segmenter("th", { granularity: "word" });

function appearanceClaim(text: string) {
  return /สวย|รูปลักษณ์|หน้าตา|appearance|color/i.test(text) ||
    [...thaiWords.segment(text)].some((part) => part.segment === "สี");
}

export function eligibleLabels(product: Product, requirements: Requirement[], labels: Label[]) {
  return validLabels(product, labels).filter((label) => {
    const requirement = requirements.find((item) => item.id === label.subjectId);
    if (requirement) return !requirement.specOnly && label.usage !== "unboxing" && (!requirement.longUse || label.usage === "long");
    const claim = product.claims.find((item) => item.id === label.subjectId && item.checkable);
    return Boolean(claim && (label.usage !== "unboxing" || appearanceClaim(claim.text)));
  });
}

export function reviewQualityWarning(product: Product, requirements: Requirement[], labels: Label[]) {
  const reviews = product.reviews.filter((review) => !review.isTemplate);
  if (!reviews.length) return null;
  const subjects = new Set([...requirements.map((item) => item.id), ...product.claims.map((item) => item.id)]);
  const metadata = new Map<string, Label[]>();
  for (const label of labels) {
    const review = reviews.find((item) => item.id === label.reviewId);
    if (!review || !subjects.has(label.subjectId) || !label.quote.trim() || !review.text.includes(label.quote)) continue;
    const entries = metadata.get(review.id) ?? [];
    entries.push(label);
    metadata.set(review.id, entries);
  }
  const poor = reviews.filter((review) => {
    const entries = metadata.get(review.id);
    if (!entries) return reviewUsage(review.text) === "unboxing";
    return entries.some((label) => label.usage === "unboxing" ||
      (label.target === "product" && label.stance === "confirm" && !label.specific));
  }).length;
  return poor / reviews.length >= 0.6 ? {
    message: "รีวิวส่วนใหญ่เขียนตอนเพิ่งได้ของ หรือชมแบบไม่มีรายละเอียด",
    percent: Math.round(100 * poor / reviews.length),
  } : null;
}

export function specCheck(product: Product, requirement: Requirement): "pass" | "fail" | "unknown" {
  const spec = requirement.spec;
  if (!spec || !Object.hasOwn(product.specs, spec.key)) return "unknown";
  const actual = product.specs[spec.key];
  let passed = false;
  switch (spec.op) {
    case ">=": passed = typeof actual === "number" && typeof spec.value === "number" && actual >= spec.value; break;
    case "<=": passed = typeof actual === "number" && typeof spec.value === "number" && actual <= spec.value; break;
    case "==": passed = actual === spec.value; break;
    case "includes": passed = Array.isArray(actual) ? actual.includes(spec.value) : typeof actual === "string" && typeof spec.value === "string" && actual.includes(spec.value); break;
  }
  return passed ? "pass" : "fail";
}

function ratio(product: Product, labels: Label[]) {
  const weighted = labels.map((label) => ({ label, weight: reviewWeight(product.reviews.find((review) => review.id === label.reviewId)!, label) }));
  return weighted.reduce((sum, item) => sum + (item.label.stance === "confirm" ? item.weight : 0), 0) / weighted.reduce((sum, item) => sum + item.weight, 0);
}

export function requirementResult(product: Product, requirement: Requirement, labels: Label[]): RequirementResult {
  const quotes = eligibleLabels(product, [requirement], labels).filter((label) => label.subjectId === requirement.id);
  const result = (status: RequirementResult["status"], score: number): RequirementResult => ({ requirementId: requirement.id, status, score, quotes });
  if (requirement.kind === "budget" && requirement.value !== undefined) return product.priceThb <= requirement.value ? result("pass", 1) : result("fail", 0);
  const spec = specCheck(product, requirement);
  if (spec === "fail") return result("fail", 0);
  if (quotes.length >= 3) {
    const score = ratio(product, quotes);
    return result(score < 0.4 ? "contradicted" : score >= 0.6 ? "pass" : "mixed", score);
  }
  const fallback = spec === "pass" ? result("spec-only", 0.6) : result("unknown", 0.4);
  if (requirement.longUse) fallback.message = spec === "pass"
    ? "Shopee ให้รีวิวได้ภายใน 30 วันหลังได้ของ ของที่พังหลังจากนั้นจึงไม่อยู่ในรีวิว"
    : "ยังไม่มีรีวิวจากคนที่ใช้นานพอ";
  return fallback;
}

export function fit(requirements: Requirement[], results: RequirementResult[]) {
  const weights = requirements.map((requirement) => requirement.kind === "nice" ? 1 : 2);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const score = total ? requirements.reduce((sum, requirement, index) => sum + weights[index] * (results.find((result) => result.requirementId === requirement.id)?.score ?? 0.4), 0) / total : 0.4;
  const mustOk = requirements.every((requirement) => requirement.kind === "nice" || !results.some((result) => result.requirementId === requirement.id && ["fail", "contradicted"].includes(result.status)));
  return { fit: score, fitPct: Math.round(score * 100), mustOk };
}

export function shopScore(shop: Shop) {
  const age = shop.years >= 2 ? 1 : shop.years >= 1 ? 0.8 : shop.years >= 0.5 ? 0.6 : 0.3;
  const bad = shop.badRatePct <= 1 ? 1 : shop.badRatePct <= 3 ? 0.7 : shop.badRatePct <= 6 ? 0.4 : 0.1;
  const badge = shop.official ? 1 : shop.preferredPlus ? 0.8 : shop.verified ? 0.7 : 0.4;
  return 0.3 * age + 0.35 * bad + 0.2 * badge + 0.15 * shop.chatResponsePct / 100;
}

export function evidenceCount(product: Product, requirements: Requirement[], labels: Label[]) {
  const subjects = new Set([...requirements.map((item) => item.id), ...product.claims.filter((claim) => claim.checkable).map((claim) => claim.id)]);
  return new Set(eligibleLabels(product, requirements, labels).filter((label) => subjects.has(label.subjectId)).map((label) => label.reviewId)).size;
}

export function trust(product: Product, requirements: Requirement[], labels: Label[]) {
  if (evidenceCount(product, requirements, labels) < 10) return null;
  const valid = eligibleLabels(product, requirements, labels);
  const scores = product.claims.filter((claim) => claim.checkable).map((claim) => {
    const evidence = valid.filter((label) => label.subjectId === claim.id);
    return evidence.length < 3 ? 0.4 : ratio(product, evidence);
  });
  const claimScore = scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0.4;
  return 0.7 * claimScore + 0.3 * shopScore(product.shop);
}

export function unusedFeatures(product: Product, requirements: Requirement[]) {
  return product.features.filter((feature) => !requirements.some((requirement) => requirement.text.toLocaleLowerCase().includes(feature.toLocaleLowerCase()) || feature.toLocaleLowerCase().includes(requirement.text.toLocaleLowerCase())));
}

export function savings(product: Product, comparison: Product | undefined, mustOk: boolean) {
  const amount = (comparison?.priceThb ?? product.priceThb) - product.priceThb;
  return mustOk && amount > 0 ? amount : null;
}

export function rank(products: Product[], requirements: Requirement[], labelsByProduct: Record<string, Label[]>, categoryPool = products): Ranked[] {
  const budget = requirements.find((requirement) => requirement.kind === "budget")?.value;
  const rows = products.map((product) => {
    const labels = labelsByProduct[product.id] ?? [];
    const results = requirements.map((requirement) => requirementResult(product, requirement, labels));
    const fitResult = fit(requirements, results);
    const trustResult = trust(product, requirements, labels);
    const value = budget ? Math.max(0, Math.min(1, 1 - product.priceThb / budget)) : 0.5;
    return { product, row: {
      productId: product.id,
      fitPct: fitResult.fitPct,
      mustOk: fitResult.mustOk,
      trust: trustResult,
      rankScore: 0.6 * fitResult.fit + 0.25 * (trustResult ?? 0.4) + 0.15 * value,
      requirements: results,
      savings: null,
      unusedFeatures: [],
      objections: [],
      why: "",
      reviewQualityWarning: reviewQualityWarning(product, requirements, labels),
    } satisfies Ranked };
  });
  const sorted = rows.toSorted((a, b) => Number(b.row.mustOk) - Number(a.row.mustOk) || b.row.rankScore - a.row.rankScore || a.product.priceThb - b.product.priceThb);
  return sorted.map(({ product, row }, index) => {
    if (index !== 0) return row;
    const comparison = categoryPool.filter((other) => other.category === product.category && other.id !== product.id)
      .toSorted((a, b) => b.stars - a.stars || b.ratingCount - a.ratingCount)[0];
    return { ...row, savings: savings(product, comparison, row.mustOk), unusedFeatures: comparison ? unusedFeatures(comparison, requirements) : [] };
  });
}
