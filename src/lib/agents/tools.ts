import { eligibleLabels, fit, requirementResult, specCheck } from "../scoring";
import type { AgentEvent, Label, Product, Requirement } from "../types";
import { reviewsForRequirement } from "./review-search";

export type ArenaAgent = Exclude<AgentEvent["agent"], "judge" | "verifier">;
export type Filters = { maxPrice?: number; specKey?: string; specOp?: NonNullable<Requirement["spec"]>["op"]; specValue?: NonNullable<Requirement["spec"]>["value"] };
export function createTools({ agent, products, requirements, allowedIds, emit }: {
  agent: ArenaAgent; products: Product[]; requirements: Requirement[]; allowedIds?: string[]; emit: (event: AgentEvent) => void;
}) {
  const proposals = new Map<string, Label[]>();
  const accessible = products.filter((product) => !allowedIds || allowedIds.includes(product.id));
  let lastStep: string | undefined;
  function step(text: string) {
    if (text === lastStep) return;
    lastStep = text;
    emit({ agent, type: "step", text });
  }
  return {
    proposals,
    search_catalog(category: string, filters: Filters = {}) {
      step("กำลังค้นสินค้าในชุดเดโม");
      return accessible.filter((product) => product.category === category
        && (filters.maxPrice === undefined || product.priceThb <= filters.maxPrice)
        && (!filters.specKey || !filters.specOp || filters.specValue === undefined || specCheck(product, { id: "filter", text: "ตัวกรอง", kind: "must", spec: { key: filters.specKey, op: filters.specOp, value: filters.specValue } }) === "pass"));
    },
    get_product(id: string) {
      step("กำลังอ่านข้อมูลสินค้า");
      const product = accessible.find((item) => item.id === id);
      if (!product) return null;
      const { reviews, ...details } = product;
      return {
        ...details,
        reviewCount: reviews.length,
        reviewEvidence: requirements.filter((requirement) => requirement.kind !== "budget").map((requirement) => {
          const matching = reviewsForRequirement(product, requirement);
          return { requirementId: requirement.id, matchingReviewCount: matching.length, reviews: matching.slice(0, 6) };
        }),
      };
    },
    get_reviews(id: string, query: string, requirementId?: string) {
      step("กำลังค้นหลักฐานจากรีวิว");
      const product = accessible.find((item) => item.id === id);
      if (!product) return [];
      if (requirementId !== undefined) {
        const requirement = requirements.find((item) => item.id === requirementId);
        return requirement ? reviewsForRequirement(product, requirement) : [];
      }
      const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
      return product.reviews.filter((review) => !review.isTemplate && words.every((word) => review.text.toLocaleLowerCase().includes(word)));
    },
    propose(productId: string, labels: Label[]) {
      step("กำลังตรวจข้อเสนอและข้อความอ้างอิง");
      if (agent === "skeptic" && !labels.length) return { accepted: false, reason: "ไม่มีหลักฐานแย้ง" };
      const product = accessible.find((product) => product.id === productId);
      if (!product) return { accepted: false, reason: "สินค้าอยู่นอกขอบเขต" };
      if (!proposals.has(productId) && proposals.size >= 3) return { accepted: false, reason: "เสนอสินค้าครบแล้ว" };
      if (agent === "value") {
        const required = requirements.filter(({ kind }) => kind !== "nice");
        const results = required.map((requirement) => requirementResult(product, requirement, labels));
        if (!fit(required, results).mustOk || results.some(({ status }) => !["pass", "spec-only"].includes(status))) {
          return { accepted: false, reason: "ยังไม่ผ่านข้อจำเป็นทุกข้อ" };
        }
      }
      const subjects = new Set([...requirements.map((item) => item.id), ...product.claims.filter((claim) => claim.checkable).map((claim) => claim.id)]);
      const invalid = labels.some((label) => {
        const review = product.reviews.find((item) => item.id === label.reviewId);
        return !review || review.isTemplate || !subjects.has(label.subjectId) || !label.quote.trim() || !review.text.includes(label.quote)
          || (agent === "skeptic" && (label.stance !== "contradict" || label.target !== "product"));
      });
      if (invalid) return { accepted: false, reason: "หลักฐานหรือข้อความอ้างอิงไม่ถูกต้อง" };
      if (agent === "skeptic" && eligibleLabels(product, requirements, labels).length !== labels.length) return { accepted: false, reason: "หลักฐานยังไม่ผ่านระยะเวลาการใช้งาน" };
      proposals.set(productId, labels);
      emit({ agent, type: agent === "skeptic" ? "objection" : "candidate", text: "พบสินค้าพร้อมหลักฐาน", productId, ...(agent === "skeptic" && labels[0] ? { quote: labels[0].quote } : {}) });
      return { accepted: true };
    },
  };
}
export type ArenaTools = ReturnType<typeof createTools>;
