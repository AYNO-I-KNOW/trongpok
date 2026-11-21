import { byCategory } from "../catalog";
import { labelWithRules } from "../labeling/rules";
import { fit, rank, requirementResult, reviewWeight, eligibleLabels } from "../scoring";
import type { AgentEvent, ArenaResult, CategoryPack, Label, Product, Requirement } from "../types";
import { createTools, type ArenaAgent, type ArenaTools } from "./tools";
import { runLlmAgent } from "./llm";

const shortlistSize = 3;

export async function runArena({ pack, requirements, needText, linkedProductId, products: supplied }: {
  pack: CategoryPack; requirements: Requirement[]; needText?: string; linkedProductId?: string; products?: Product[];
}, emit: (event: AgentEvent) => void = () => {}): Promise<ArenaResult & { usedModel: boolean }> {
  const products = (supplied ?? await byCategory(pack.id)).filter((product) => product.category === pack.id);
  const events: AgentEvent[] = [];
  const publish = (event: AgentEvent) => { events.push(event); emit(event); };
  const useLlm = Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL);
  const requirementIds = new Set(requirements.map((requirement) => requirement.id));
  const ruleLabels = new Map<string, Label[]>();

  function labelsFor(product: Product) {
    const cached = ruleLabels.get(product.id);
    if (cached) return cached;
    const labels = labelWithRules(product, [...requirements, ...product.claims.filter((claim) => claim.checkable)]);
    ruleLabels.set(product.id, labels);
    return labels;
  }

  function ruleCandidates(pool: Product[]) {
    return pool.map((product) => {
      const labels = labelsFor(product);
      const results = requirements.map((requirement) => requirementResult(product, requirement, labels));
      const confirmations = eligibleLabels(product, requirements, labels)
        .filter((label) => requirementIds.has(label.subjectId) && label.stance === "confirm").length;
      return { product, labels, results, confirmations, fit: fit(requirements, results) };
    }).sort((a, b) =>
      Number(b.fit.mustOk) - Number(a.fit.mustOk) || b.fit.fit - a.fit.fit ||
      b.confirmations - a.confirmations || a.product.id.localeCompare(b.product.id));
  }

  function rules(agent: ArenaAgent, tools: ArenaTools) {
    const pool = tools.search_catalog(pack.id);
    if (agent === "skeptic") {
      const objections = pool.flatMap((product) => {
        const labels = eligibleLabels(product, requirements, labelsFor(product)).filter((label) => label.stance === "contradict");
        if (!labels.length) return [];
        const weight = (label: Label) => reviewWeight(product.reviews.find((review) => review.id === label.reviewId)!);
        labels.sort((a, b) => Number(requirementIds.has(b.subjectId)) - Number(requirementIds.has(a.subjectId)) || weight(b) - weight(a));
        return [{ product, labels: labels.slice(0, 3) }];
      }).sort((a, b) => Number(b.product.id === linkedProductId) - Number(a.product.id === linkedProductId) ||
        b.labels.filter((label) => requirementIds.has(label.subjectId)).length -
        a.labels.filter((label) => requirementIds.has(label.subjectId)).length);
      for (const { product, labels } of objections) tools.propose(product.id, labels);
      return;
    }
    const scored = ruleCandidates(pool);
    const candidates = agent === "value" ? scored.filter(({ results, fit }) => fit.mustOk && requirements.every((requirement, index) =>
      requirement.kind === "nice" || ["pass", "spec-only"].includes(results[index].status)))
      .sort((a, b) => a.product.priceThb - b.product.priceThb || a.product.id.localeCompare(b.product.id)) : scored;
    for (const { product, labels } of candidates.slice(0, shortlistSize)) tools.propose(product.id, labels);
  }

  async function runRole(agent: ArenaAgent, allowedIds?: string[]) {
    publish({ agent, type: "start", text: "เริ่มตรวจสอบสินค้า" });
    if (useLlm) {
      const staged: AgentEvent[] = [];
      const tools = createTools({ agent, products, requirements, allowedIds, emit: (event) => {
        if (event.type === "candidate" || event.type === "objection") staged.push(event);
        else publish(event);
      } });
      try {
        await runLlmAgent({ agent, category: pack.id, requirements, needText, tools, linkedProductId });
        for (const event of staged) publish(event);
        publish({ agent, type: "done", text: "ตรวจสอบเสร็จแล้ว" });
        return { proposals: tools.proposals, usedRules: false };
      } catch {
        publish({ agent, type: "step", text: "ใช้โหมดกฎ" });
      }
    }
    const tools = createTools({ agent, products, requirements, allowedIds, emit: publish });
    rules(agent, tools);
    publish({ agent, type: "done", text: "ตรวจสอบเสร็จแล้ว" });
    return { proposals: tools.proposals, usedRules: true };
  }

  const [fitRole, valueRole] = await Promise.all([runRole("fit"), runRole("value")]);
  const merged: Record<string, Label[]> = Object.fromEntries(products.map(({ id }) => [id, []]));
  const candidateIds = new Set([...fitRole.proposals.keys(), ...valueRole.proposals.keys()]);
  let supplemented = false;
  const linked = products.find((product) => product.id === linkedProductId);
  if (linked) {
    if (!candidateIds.has(linked.id)) {
      merged[linked.id] = labelsFor(linked);
      supplemented = true;
      publish({ agent: "judge", type: "step", text: "ตรวจสินค้าที่ส่งมาด้วยกฎ", productId: linked.id });
    }
    candidateIds.add(linked.id);
  }
  const missing = Math.min(shortlistSize, products.length) - candidateIds.size;
  if (missing > 0) {
    const reserve = ruleCandidates(products.filter(({ id }) => !candidateIds.has(id))).slice(0, missing);
    for (const { product, labels } of reserve) {
      candidateIds.add(product.id);
      merged[product.id] = labels;
      supplemented = true;
      publish({ agent: "judge", type: "step", text: "เพิ่มตัวเลือกเปรียบเทียบจากกฎ", productId: product.id });
    }
  }
  for (const { proposals } of [valueRole, fitRole]) {
    for (const [id, labels] of proposals) merged[id].push(...labels);
  }
  const candidates = products.filter(({ id }) => candidateIds.has(id));
  const allowedIds = rank(candidates, requirements, merged, products).slice(0, shortlistSize).map(({ productId }) => productId);
  if (linked && !allowedIds.includes(linked.id)) allowedIds[shortlistSize - 1] = linked.id;
  const skepticRole = await runRole("skeptic", allowedIds);
  for (const [id, labels] of skepticRole.proposals) merged[id].push(...labels);
  const finalists = candidates.filter(({ id }) => allowedIds.includes(id));
  const ranked = rank(finalists, requirements, merged, products).map((row) => ({
    ...row, objections: skepticRole.proposals.get(row.productId) ?? [],
  }));
  const outcomes = [fitRole, valueRole, skepticRole];
  const mode = supplemented || outcomes.some(({ usedRules }) => usedRules) ? "rules" : "llm";
  const usedModel = outcomes.some(({ usedRules }) => !usedRules);
  return { requirements, ranked, events, mode, usedModel };
}
