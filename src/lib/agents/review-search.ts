import { iceReviewRelevant, isBlenderIceRequirement, reviewSpecific, reviewUsage } from "../labeling/rules";
import type { Product, Requirement } from "../types";

const thaiWords = new Intl.Segmenter("th", { granularity: "word" });
const commonWords = new Set(["ได้", "มี", "ให้", "ไม่", "ต้อง", "ใช้", "โดย", "อย่าง", "อย่างน้อย", "ขึ้นไป", "ตอน", "และ", "แล้ว"]);

function terms(text: string) {
  return new Set([...thaiWords.segment(text.toLocaleLowerCase())]
    .filter(({ isWordLike, segment }) => isWordLike && segment.length > 1 && !commonWords.has(segment) && !/^\d+$/.test(segment))
    .map(({ segment }) => segment));
}

export function directReviewMatcher(category: string, requirement: Requirement) {
  if (isBlenderIceRequirement(category, requirement)) return iceReviewRelevant;
  if (category === "bird-repeller" && requirement.id === "solar") {
    return (text: string) => /โซลาร์|แผงรับแดด|พลังงานแสงอาทิตย์|ใช้.{0,12}ถ่าน|เสียบปลั๊ก|(?:แดด|แบต).{0,12}(?:หมด|ไม่ติด)/.test(text);
  }
}

export function reviewsForRequirement(product: Product, requirement: Requirement) {
  if (requirement.kind === "budget" || requirement.specOnly) return [];
  const keywords = [...terms(requirement.text)];
  const matchesDirectly = directReviewMatcher(product.category, requirement);
  return product.reviews.flatMap((review) => {
    if (review.isTemplate) return [];
    const usage = reviewUsage(review.text);
    if (usage === "unboxing" || (requirement.longUse && usage !== "long")) return [];
    const text = review.text.toLocaleLowerCase();
    const matches = keywords.filter((word) => text.includes(word)).length;
    if (matchesDirectly ? !matchesDirectly(text) : !matches) return [];
    return [{ review, matches, longUse: usage === "long", specific: reviewSpecific(text) }];
  }).sort((a, b) => Number(b.longUse) - Number(a.longUse) || b.matches - a.matches ||
    Number(b.specific) - Number(a.specific) || a.review.daysAgo - b.review.daysAgo)
    .map(({ review }) => review);
}
