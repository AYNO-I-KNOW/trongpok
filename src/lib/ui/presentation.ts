import type { AgentEvent, Label, Product, Ranked, RequirementStatus } from "../types";

export const money = (value: number) => new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 }).format(value);
export const statusText: Record<RequirementStatus, string> = {
  pass: "ผ่าน", fail: "ไม่ผ่าน", contradicted: "รีวิวขัดแย้ง", mixed: "รีวิวมีทั้งสองด้าน",
  "spec-only": "ตามสเปก ยังไม่มีรีวิวยืนยัน", unknown: "ยังไม่มีข้อมูลยืนยัน",
};
export const agentInfo = {
  fit: { title: "หาให้เหมาะ" },
  value: { title: "เลือกให้คุ้ม" },
  skeptic: { title: "มองอีกด้าน" },
};

export function safeQuotes(product: Product, labels: Label[]): Label[] {
  return [...new Map(labels.filter((label) => label.target === "product" && label.stance !== "none" && label.quote.trim() && product.reviews.some((review) =>
    review.id === label.reviewId && !review.isTemplate && review.text.includes(label.quote)))
    .map((label) => [`${label.reviewId}:${label.subjectId}`, label])).values()];
}

export function safeAgentEvent(event: AgentEvent, products: Product[]): AgentEvent {
  if (!event.quote) return event;
  const product = products.find((item) => item.id === event.productId);
  if (product?.reviews.some((review) => !review.isTemplate && review.text.includes(event.quote!))) return event;
  const { quote, ...withoutQuote } = event;
  void quote;
  return withoutQuote;
}

export function comparisonProduct(products: Product[], selected: Product) {
  return products.filter((product) => product.category === selected.category && product.id !== selected.id)
    .toSorted((a, b) => b.stars - a.stars || b.ratingCount - a.ratingCount)[0];
}

export function trustText(product: Product, row: Ranked) {
  const eligible = new Set(product.reviews.filter((review) => !review.isTemplate).map((review) => review.id)).size;
  return row.trust === null || eligible < 10 ? "ข้อมูลไม่พอ" : `${Math.round(row.trust * 100)}%`;
}

export function outboundLink(product: Product) {
  try {
    const url = new URL(product.shopeeUrl);
    if (url.protocol === "https:" && url.hostname === "shopee.co.th") return url.toString();
  } catch {}
  return `https://shopee.co.th/search?keyword=${encodeURIComponent(product.title)}`;
}
