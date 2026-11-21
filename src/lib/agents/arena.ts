import { byCategory } from "../catalog";
import { labelWithRules } from "../labeling/rules";
import { fit, rank, requirementResult, reviewWeight, eligibleLabels } from "../scoring";
import type { AgentEvent, ArenaResult, CategoryPack, Label, Product, Requirement } from "../types";
import { createTools, type ArenaAgent } from "./tools";
import { runLlmAgent } from "./llm";

export async function runArena({ pack, requirements, linkedProductId, products: supplied }: {
  pack: CategoryPack; requirements: Requirement[]; linkedProductId?: string; products?: Product[];
}, emit: (event: AgentEvent) => void = () => {}): Promise<ArenaResult> {
  const products = (supplied ?? await byCategory(pack.id)).filter((product) => product.category === pack.id);
  const events: AgentEvent[] = [];
  const publish = (event: AgentEvent) => { events.push(event); emit(event); };
  const merged: Record<string, Label[]> = {};
  const useLlm = Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL);
  const roleResults = new Map<ArenaAgent, Map<string, Label[]>>();
  let mode: ArenaResult["mode"] = process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL ? "llm" : "rules";
  function rules(agent: ArenaAgent, tools: ReturnType<typeof createTools>) {
    const pool = tools.search_catalog(pack.id);
    const scored = pool.map((product) => {
      const labels = labelWithRules(product, [...requirements, ...product.claims.filter((claim) => claim.checkable)]);
      const results = requirements.map((requirement) => requirementResult(product, requirement, labels));
      const requirementIds = new Set(requirements.map((requirement) => requirement.id));
      const confirmations = eligibleLabels(product, requirements, labels)
        .filter((label) => requirementIds.has(label.subjectId) && label.stance === "confirm").length;
      return { product, labels, results, confirmations, fit: fit(requirements, results) };
    });
    let candidates = scored;
    if (agent === "value") {
      candidates = scored.filter(({ results }) => requirements.every((requirement, index) =>
        requirement.kind === "nice" || ["pass", "spec-only"].includes(results[index].status)))
        .toSorted((a, b) => a.product.priceThb - b.product.priceThb || a.product.id.localeCompare(b.product.id));
    }
    if (agent === "fit") {
      candidates = scored.toSorted((a, b) =>
        Number(b.fit.mustOk) - Number(a.fit.mustOk) || b.fit.fit - a.fit.fit ||
        b.confirmations - a.confirmations || a.product.id.localeCompare(b.product.id));
    }
    for (const { product, labels } of candidates.slice(0, agent === "verifier" ? 1 : 3)) {
      if (agent !== "skeptic") {
        tools.propose(product.id, labels);
        continue;
      }
      const objections = eligibleLabels(product, requirements, labels).filter((label) => label.stance === "contradict")
        .toSorted((a, b) => reviewWeight(product.reviews.find((review) => review.id === b.reviewId)!) -
          reviewWeight(product.reviews.find((review) => review.id === a.reviewId)!)).slice(0, 1);
      if (objections.length) tools.propose(product.id, objections);
    }
  }
  async function role(agent: ArenaAgent, topIds?: string[]) {
    const allowedIds = agent === "verifier" ? [linkedProductId!] : topIds;
    const staged: AgentEvent[] = [];
    const modelEmit = (event: AgentEvent) => {
      if (event.type === "candidate" || event.type === "objection") staged.push(event);
      else publish(event);
    };
    let tools = createTools({ agent, products, requirements, allowedIds, emit: modelEmit });
    publish({ agent, type: "start", text: "เริ่มตรวจสอบสินค้า" });
    let needsRules = !useLlm;
    if (useLlm) {
      try {
        await runLlmAgent({ agent, category: pack.id, requirements, tools, linkedProductId, topIds });
        for (const event of staged) publish(event);
      } catch {
        mode = "rules";
        needsRules = true;
        publish({ agent, type: "step", text: "ใช้โหมดกฎ" });
      }
    }
    if (needsRules) {
      tools = createTools({ agent, products, requirements, allowedIds, emit: publish });
      rules(agent, tools);
    }
    roleResults.set(agent, tools.proposals);
    publish({ agent, type: "done", text: "ตรวจสอบเสร็จแล้ว" });
  }
  await Promise.all([...(linkedProductId ? [role("verifier")] : []), role("fit"), role("value")]);
  for (const agent of ["verifier", "fit", "value"] as const) {
    for (const [id, labels] of roleResults.get(agent) ?? []) merged[id] = [...(merged[id] ?? []), ...labels];
  }
  const candidates = products.filter((product) => Object.hasOwn(merged, product.id));
  const topIds = rank(candidates, requirements, merged, products).slice(0, 3).map((row) => row.productId);
  await role("skeptic", topIds);
  for (const [id, labels] of roleResults.get("skeptic") ?? []) merged[id] = [...(merged[id] ?? []), ...labels];
  const ranked = rank(candidates, requirements, merged, products).map((row) => ({
    ...row, objections: eligibleLabels(products.find((product) => product.id === row.productId)!, requirements, roleResults.get("skeptic")?.get(row.productId) ?? []),
  }));
  return { requirements, ranked, events, mode };
}
