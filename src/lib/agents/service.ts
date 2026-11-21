import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { z } from "zod";
import { loadPacks, loadProducts, findByLink } from "../catalog";
import { requirementsFromAnswers } from "../needs/answers";
import { requirementsFromText } from "../needs";
import { eligibleLabels } from "../scoring";
import type { AgentEvent, ArenaResult, Product } from "../types";
import { runArena } from "./arena";
import { scoringVersion, cacheHash, requestCacheKey, readArenaCache, writeArenaCache, readRequestCache, writeRequestCache } from "./cache";
import { judge } from "./judge";

export const ArenaRequestSchema = z.object({
  category: z.string().optional(),
  needText: z.string().optional(),
  answers: z.record(z.string(), z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))])).optional(),
  link: z.string().optional(),
});

const InternalArenaRequestSchema = ArenaRequestSchema.extend({ linkedProductId: z.string().min(1).optional() });

function cacheMatchesCatalog(result: ArenaResult, products: Product[]) {
  const objectionsByProduct = new Map<string, string>();
  for (const row of result.ranked) {
    const product = products.find(({ id }) => id === row.productId);
    if (!product) return false;
    const { objections } = row;
    if (objections.length) {
      if (objectionsByProduct.has(row.productId) || objections.some(({ stance }) => stance !== "contradict")
        || eligibleLabels(product, result.requirements, objections).length !== objections.length) return false;
      objectionsByProduct.set(row.productId, JSON.stringify(objections));
    }
    for (const { requirementId, quotes } of row.requirements) {
      if (quotes.some(({ subjectId }) => subjectId !== requirementId)
        || eligibleLabels(product, result.requirements, quotes).length !== quotes.length) return false;
    }
  }
  for (const event of result.events) {
    if (event.type !== "objection") continue;
    if (!event.productId || objectionsByProduct.get(event.productId) !== JSON.stringify(event.objections)) return false;
    objectionsByProduct.delete(event.productId);
  }
  return objectionsByProduct.size === 0;
}

export async function runArenaRequest(input: z.infer<typeof InternalArenaRequestSchema>, emit: (event: AgentEvent) => void = () => {}, options: { dataRoot?: string; cacheRoot?: string; replayDelayMs?: number; strictCache?: boolean } = {}): Promise<ArenaResult> {
  const request = InternalArenaRequestSchema.parse(input);
  const dataRoot = options.dataRoot ?? join(process.cwd(), "data");
  const cacheRoot = options.cacheRoot ?? join(dataRoot, "cache", "arena");
  const [packs, products] = await Promise.all([loadPacks(dataRoot), loadProducts(dataRoot)]);
  const version = cacheHash([packs, products]);
  const requestKey = requestCacheKey(request, packs, products);
  const hasModel = Boolean(process.env.OPENAI_API_KEY && process.env.OPENAI_MODEL);
  const canReplay = (result: ArenaResult | null): result is ArenaResult & { mode: "llm" | "rules" } =>
    result !== null && (result.mode === "rules" || result.mode === "llm") &&
    (hasModel || (result.mode === "rules" && !result.modelContributed)) &&
    cacheMatchesCatalog(result, products);
  const replay = async (result: ArenaResult & { mode: "llm" | "rules" }): Promise<ArenaResult> => {
    for (const event of result.events) {
      await setTimeout(options.replayDelayMs ?? 15);
      emit(event);
    }
    return { ...result, mode: "cache", cachedMode: result.mode };
  };
  const indexed = await readRequestCache(cacheRoot, requestKey);
  if (canReplay(indexed)) return replay(indexed);
  const linked = request.link ? await findByLink(request.link, dataRoot) : null;
  if (linked?.status === "not-in-demo") throw new Error("ลิงก์นี้ไม่อยู่ในชุดเดโม");
  const linkedById = request.linkedProductId ? products.find((product) => product.id === request.linkedProductId) : undefined;
  if (request.linkedProductId && !linkedById) throw new Error("Unknown linked product");
  const selectedProduct = linkedById ?? (linked?.status === "found" ? linked.product : undefined);
  if (linkedById && request.category && linkedById.category !== request.category) throw new Error("Linked product category mismatch");
  const category = selectedProduct?.category ?? request.category;
  const pack = packs.find((item) => item.id === category) ?? (!category ? packs.find((item) => item.keywords.some((keyword) => request.needText?.toLowerCase().includes(keyword.toLowerCase()))) : undefined);
  if (!pack) throw new Error("กรุณาระบุหมวดสินค้า");
  const requirements = request.answers ? requirementsFromAnswers(pack, request.answers, request.needText) : await requirementsFromText(pack, request.needText ?? "");
  const linkedProductId = selectedProduct?.id;
  const key = cacheHash([scoringVersion, requirements, request.needText, linkedProductId, pack.id, version]);
  const cached = await readArenaCache(cacheRoot, key);
  if (canReplay(cached)) {
    await writeRequestCache(cacheRoot, requestKey, key, options.strictCache);
    return replay(cached);
  }
  const { usedModel, ...result } = await runArena({ pack, requirements, needText: request.needText, linkedProductId, products }, emit);
  emit({ agent: "judge", type: "start", text: "กำลังสรุปเหตุผล" });
  result.events.push({ agent: "judge", type: "start", text: "กำลังสรุปเหตุผล" });
  const summary = await judge(result.ranked, requirements, usedModel ? "llm" : "rules", request.needText, result.events);
  const judged = {
    ...result,
    ranked: summary.ranked,
    mode: result.mode === "rules" ? result.mode : summary.mode,
    ...(usedModel ? { modelContributed: true } : {}),
  };
  const done: AgentEvent = { agent: "judge", type: "done", text: "สรุปผลแล้ว" };
  judged.events.push(done);
  emit(done);
  await writeArenaCache(cacheRoot, key, judged, options.strictCache);
  await writeRequestCache(cacheRoot, requestKey, key, options.strictCache);
  return judged;
}
