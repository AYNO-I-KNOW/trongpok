import { createHash } from "node:crypto";
import { LabelSchema, type Label, type Product } from "../types";
import { labelWithLlm } from "./llm";
import { labelWithRules, type Subject } from "./rules";

const cache = new Map<string, Label[]>();

export async function labelProduct(product: Product, subjects: Subject[]) {
  const key = createHash("sha256").update(JSON.stringify([product, subjects, process.env.OPENAI_MODEL, Boolean(process.env.OPENAI_API_KEY)])).digest("hex");
  const cached = cache.get(key);
  if (cached) return { labels: structuredClone(cached), mode: "cache" as const };
  if (process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL) {
    try {
      const labels = LabelSchema.array().parse(await labelWithLlm(product, subjects));
      const pairs = new Set(labels.map((label) => JSON.stringify([label.reviewId, label.subjectId])));
      const reviews = product.reviews.filter((review) => !review.isTemplate);
      const expected = new Set(reviews.flatMap((review) => subjects.map((subject) => JSON.stringify([review.id, subject.id]))));
      if (pairs.size !== expected.size || labels.length !== pairs.size || [...pairs].some((pair) => !expected.has(pair))) throw new Error("Incomplete labels");
      const checked = labels.filter((label) => {
        const review = reviews.find((review) => review.id === label.reviewId);
        return subjects.some((subject) => subject.id === label.subjectId) && review && label.quote.trim() && review.text.includes(label.quote);
      }).map((label) => label.target === "product" ? label : { ...label, stance: "none" as const });
      if (cache.size >= 100) cache.delete(cache.keys().next().value!);
      cache.set(key, structuredClone(checked));
      return { labels: checked, mode: "llm" as const };
    } catch {
      return { labels: labelWithRules(product, subjects), mode: "rules" as const };
    }
  }
  return { labels: labelWithRules(product, subjects), mode: "rules" as const };
}
