import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { z } from "zod";
import { loadPacks, loadProducts, findByLink } from "../catalog";
import { requirementsFromAnswers } from "../needs/answers";
import { requirementsFromText } from "../needs";
import { eligibleLabels } from "../scoring";
import { RequirementSchema, type AgentEvent, type ArenaResult, type Product } from "../types";
import { runArena } from "./arena";
import { scoringVersion, cacheHash, requestCacheKey, readArenaCache, writeArenaCache, readRequestCache, writeRequestCache } from "./cache";
import { judge } from "./judge";

export const ArenaRequestSchema = z.object({
  category: z.string().max(80).optional(),
  needText: z.string().max(2000).optional(),
  answers: z.record(z.string(), z.union([z.string(), z.number(), z.array(z.union([z.string(), z.number()]))])).optional(),
  link: z.string().max(2000).optional(),
  requirements: z.array(RequirementSchema).min(1).max(30).refine((items) =>
    new Set(items.map((item) => item.id)).size === items.length && items.every((item) => item.kind !== "budget" || item.value !== undefined),
  { message: "เงื่อนไขที่ยืนยันไม่ถูกต้อง" }).optional(),
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

export async function runArenaRequest(
  input: z.infer<typeof InternalArenaRequestSchema>,
  emit: (event: AgentEvent) => void = () => {},
  options: {
    dataRoot?: string;
    cacheRoot?: string;
    replayDelayMs?: number;
    strictCache?: boolean;
    signal?: AbortSignal;
    onMode?: (mode: ArenaResult["mode"]) => void;
  } = {},
): Promise<ArenaResult> {
  options.signal?.throwIfAborted();
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
    options.signal?.throwIfAborted();
    options.onMode?.("cache");
    for (const event of result.events) {
      await setTimeout(options.replayDelayMs ?? 15, undefined, { signal: options.signal });
      options.signal?.throwIfAborted();
      emit(event);
    }
    options.signal?.throwIfAborted();
    return { ...result, mode: "cache", cachedMode: result.mode };
  };
  const indexed = await readRequestCache(cacheRoot, requestKey);
  options.signal?.throwIfAborted();
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
  const requirements = request.requirements ?? (request.answers
    ? requirementsFromAnswers(pack, request.answers, request.needText)
    : await requirementsFromText(pack, request.needText ?? ""));
  const linkedProductId = selectedProduct?.id;
  const key = cacheHash([scoringVersion, requirements, request.needText, linkedProductId, pack.id, version]);
  const cached = await readArenaCache(cacheRoot, key);
  options.signal?.throwIfAborted();
  if (canReplay(cached)) {
    await writeRequestCache(cacheRoot, requestKey, key, options.strictCache);
    return replay(cached);
  }
  options.onMode?.(hasModel ? "llm" : "rules");
  const { usedModel, ...result } = await runArena({ pack, requirements, needText: request.needText, linkedProductId, products }, (event) => {
    options.signal?.throwIfAborted();
    if (event.text === "ใช้โหมดกฎ") options.onMode?.("rules");
    emit(event);
  });
  options.signal?.throwIfAborted();
  emit({ agent: "judge", type: "start", text: "กำลังสรุปเหตุผล" });
  result.events.push({ agent: "judge", type: "start", text: "กำลังสรุปเหตุผล" });
  const summary = await judge(result.ranked, requirements, usedModel ? "llm" : "rules", request.needText, result.events);
  options.signal?.throwIfAborted();
  const judged = {
    ...result,
    ranked: summary.ranked,
    mode: result.mode === "rules" ? result.mode : summary.mode,
    ...(usedModel ? { modelContributed: true } : {}),
  };
  options.onMode?.(judged.mode);
  const done: AgentEvent = { agent: "judge", type: "done", text: "สรุปผลแล้ว" };
  judged.events.push(done);
  emit(done);
  await writeArenaCache(cacheRoot, key, judged, options.strictCache);
  await writeRequestCache(cacheRoot, requestKey, key, options.strictCache);
  return judged;
}
