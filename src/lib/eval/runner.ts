import { join } from "node:path";
import { loadPacks, loadProducts } from "../catalog";
import { loadPersonas, personaRequest } from "../personas";
import { readRequestCache, requestCacheKey } from "../agents/cache";
import { labelWithRules } from "../labeling/rules";
import { rank } from "../scoring";
import type { EvaluationRow } from "./metrics";
import { plainLlm } from "./plain-llm";

export async function collectEvaluations(dataRoot = join(process.cwd(), "data"), cacheRoot = join(dataRoot, "cache/arena")): Promise<EvaluationRow[]> {
  const [packs, allProducts, personas] = await Promise.all([loadPacks(dataRoot), loadProducts(dataRoot), loadPersonas(dataRoot)]);
  if (!personas.length) throw new Error("No personas available");
  const rows: EvaluationRow[] = [];
  for (const persona of personas) {
    const products = allProducts.filter((product) => product.category === persona.category);
    const lists = [persona.human_top3, persona.labeler_a_top3, persona.labeler_b_top3]
      .map((value) => value.split("|").map((id) => id.trim()).filter(Boolean));
    if (!lists[0].length || lists.some((ids) => ids.length > 3 || new Set(ids).size !== ids.length)) {
      throw new Error("Invalid human ranking for persona " + persona.persona_id);
    }
    const human = lists.flat();
    if (!products.length || human.some((id) => !products.some((product) => product.id === id))) {
      throw new Error("Unknown product in persona " + persona.persona_id);
    }
    const cached = await readRequestCache(cacheRoot, requestCacheKey(personaRequest(persona), packs, allProducts));
    if (!cached) throw new Error("Missing arena cache for persona " + persona.persona_id);
    if (cached.ranked.some((row) => !products.some((product) => product.id === row.productId))) throw new Error("Invalid cached product");
    const labels = Object.fromEntries(products.map((product) => [product.id, labelWithRules(product, [...cached.requirements, ...product.claims.filter((claim) => claim.checkable)])]));
    rows.push({ persona, prices: Object.fromEntries(products.map((product) => [product.id, product.priceThb])), rankings: {
      ours: cached.ranked.slice(0, 3).map((row) => row.productId),
      "ours-rules": rank(products, cached.requirements, labels).slice(0, 3).map((row) => row.productId),
      stars: products.toSorted((a, b) => b.stars - a.stars || b.ratingCount - a.ratingCount).slice(0, 3).map((product) => product.id),
      popular: products.toSorted((a, b) => b.ratingCount - a.ratingCount).slice(0, 3).map((product) => product.id),
      "plain-llm": await plainLlm(persona.need_text, products),
    } });
  }
  return rows;
}
