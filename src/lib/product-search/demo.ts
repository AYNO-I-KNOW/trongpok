import { byCategory, detectCategory } from "../catalog";
import { labelWithRules } from "../labeling/rules";
import { requirementsFromTextWithRules } from "../needs";
import { rank } from "../scoring";
import type { ProductPick, ProductSearchResult } from "./contract";
import { budgetFromQuery } from "./budget";

export async function demoFallback(
  query: string,
): Promise<ProductSearchResult> {
  const pack = await detectCategory(query);
  if (!pack)
    return {
      kind: "unavailable",
      message: "ค้นเว็บไม่ได้ในขณะนี้ และยังไม่มีสินค้าหมวดนี้ในชุดเดโม",
    };
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery === pack.name.toLowerCase() || normalizedQuery === pack.id) {
    const [question] = pack.questions;
    if (question && question.options.length >= 2)
      return {
        kind: "clarify",
        question: question.text.replace(/\s*\(ข้ามได้\)$/u, ""),
        choices: question.options.slice(0, 3).map(({ label }) => label),
      };
  }
  const budget = budgetFromQuery(query);
  const preferences = pack.keywords
    .toSorted((a, b) => b.length - a.length)
    .reduce(
      (text, keyword) => text.replaceAll(keyword.toLowerCase(), " "),
      normalizedQuery,
    );
  const requirements = requirementsFromTextWithRules(pack, preferences).filter(
    (item) => item.kind !== "budget",
  );
  const measurements = [
    ...query.matchAll(
      /[\d๐-๙]+(?:[.,][\d๐-๙]+)?\s*(?:มิลลิลิตร|ลิตร|วัตต์|เมตร|นิ้ว|ชั่วโมง|วัน|ก้อน|แก้ว|แผ่น|กรัม|กิโลกรัม|ml\b|l\b|watts?\b|w\b|mm\b|cm\b|kg\b|atm\b)/gi,
    ),
  ];
  for (const [measurement] of measurements) {
    if (
      !requirements.some(
        (item) => item.text.includes(measurement) && query.includes(item.text),
      )
    ) {
      return {
        kind: "demo",
        picks: [],
        note: `ค้นเว็บไม่ได้ในขณะนี้ กฎของหมวด${pack.name}ยังตรวจเงื่อนไข “${measurement}” จากชุดเดโมไม่ได้`,
      };
    }
  }
  const products = (await byCategory(pack.id)).filter(
    (product) => budget === null || product.priceThb <= budget,
  );
  const labels = Object.fromEntries(
    products.map((product) => [
      product.id,
      labelWithRules(product, requirements),
    ]),
  );
  const observedAt = new Date().toISOString();
  const picks: ProductPick[] = [];
  for (const row of rank(products, requirements, labels)) {
    if (
      !row.mustOk ||
      requirements.some(
        (need) =>
          need.kind === "must" &&
          !row.requirements.some(
            (item) =>
              item.requirementId === need.id &&
              (item.status === "spec-only" || item.status === "pass"),
          ),
      )
    )
      continue;
    const product = products.find((item) => item.id === row.productId);
    if (!product) continue;
    const url = `/api/demo-products/${product.id}`;
    const reasons = [{ text: `อยู่ในชุดเดโมหมวด${pack.name}`, url }];
    const unknowns: string[] = [];
    for (const item of row.requirements) {
      const need = requirements.find(
        (entry) => entry.id === item.requirementId,
      );
      if (!need) continue;
      if (item.status === "spec-only" || item.status === "pass")
        reasons.push({ text: need.text, url });
      else unknowns.push(need.text);
    }
    picks.push({
      model: `${product.brand} ${product.title}`,
      url,
      reasons,
      unknowns,
      price: { baht: product.priceThb, url, observedAt },
    });
    if (picks.length === 3) break;
  }
  return {
    kind: "demo",
    picks,
    note: "ค้นเว็บไม่ได้ในขณะนี้ รุ่นและราคาในชุดนี้เป็นข้อมูลสังเคราะห์สำหรับสาธิต",
  };
}
