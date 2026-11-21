import OpenAI from "openai";
import { rankProducts } from "../scoring/product-search";
import type { ProductPick, ProductSearchResult } from "./contract";
import { demoFallback } from "./demo";
import { sourceUrl } from "./domain";
import { budgetFromQuery } from "./budget";
import {
  createSearchBackend,
  type SearchBackend,
  type SearchCandidate,
} from "./web";

export async function searchProducts(
  query: string,
  backend?: SearchBackend,
  signal?: AbortSignal,
): Promise<ProductSearchResult> {
  signal?.throwIfAborted();
  const searchText = query
    .replace(
      /https?:\/\/[^\s<>]+|\b(?:[\w-]+\.)*(?:shopee\.[a-z.]+|shope\.ee)\/[^\s<>]*/gi,
      (link) => sourceUrl(link) ?? "",
    )
    .trim();
  if (!searchText)
    return {
      kind: "clarify",
      question: "สินค้าที่ต้องการชื่อรุ่นอะไร หรืออยากใช้ทำอะไร?",
    };
  if (!backend && (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL))
    return demoFallback(searchText);
  const live =
    backend ??
    createSearchBackend(
      process.env.OPENAI_API_KEY!,
      process.env.OPENAI_MODEL!,
      signal,
    );
  try {
    const extracted = await live.goal(searchText);
    const cap = budgetFromQuery(searchText);
    const goal = {
      ...extracted,
      budget:
        cap === null
          ? extracted.budget
          : Math.min(cap, extracted.budget ?? cap),
    };
    if (goal.clarification)
      return { kind: "clarify", question: goal.clarification };
    if (
      !goal.category.trim() ||
      (goal.budget !== null &&
        (!Number.isFinite(goal.budget) || goal.budget <= 0))
    )
      return {
        kind: "clarify",
        question: "ต้องการสินค้าประเภทไหน และงบสูงสุดเท่าไร?",
      };
    const candidates: SearchCandidate[] = [];
    const sources = new Set<string>();
    const titles = new Map<string, string>();
    let searchCalls = 0;
    let expansionFailed = false;
    let picks: ProductPick[] = [];
    let searchRounds = 0;
    for (let round = 0; round < 2; round++) {
      try {
        signal?.throwIfAborted();
        const result = await live.search(
          searchText,
          goal,
          picks.map((pick) => pick.model),
          round,
        );
        candidates.push(
          ...result.candidates
            .filter((candidate) =>
              result.sources.has(sourceUrl(candidate.url) ?? ""),
            )
            .map((candidate): SearchCandidate => ({
              ...candidate,
              evidence: candidate.evidence.filter((item) =>
                result.sources.has(sourceUrl(item.url) ?? ""),
              ),
              price:
                candidate.price &&
                result.sources.has(sourceUrl(candidate.price.url) ?? "")
                  ? candidate.price
                  : null,
              stock: result.sources.has(sourceUrl(candidate.stock.url) ?? "")
                ? candidate.stock
                : { ...candidate.stock, status: "unknown" },
            })),
        );
        result.sources.forEach((source) => sources.add(source));
        result.titles?.forEach((title, url) => titles.set(url, title));
        searchRounds++;
        searchCalls += result.searchCalls;
        picks = rankProducts(
          candidates,
          goal,
          sources,
          new Date().toISOString(),
          titles,
        );
        if (picks.length >= 3) break;
      } catch (error) {
        signal?.throwIfAborted();
        if (round === 0) throw error;
        logFailure(error);
        expansionFailed = true;
      }
    }
    return {
      kind: "web",
      picks,
      searchCalls,
      searchRounds,
      note:
        picks.length === 3
          ? "เรียงตามเงื่อนไขที่ตรงโจทย์ แล้วจึงเทียบราคา"
          : `${expansionFailed ? "ค้นเพิ่มไม่สำเร็จ" : "ค้นเพิ่มแล้วแต่ข้อมูลยังไม่พอ"}${goal.budget === null ? "" : ` ภายในงบ ${goal.budget.toLocaleString("th-TH")} บาท`}${goal.must.length ? ` และเงื่อนไข ${goal.must.join(" / ")}` : ""}`,
    };
  } catch (error) {
    signal?.throwIfAborted();
    logFailure(error);
    return demoFallback(searchText);
  }
}

function logFailure(error: unknown) {
  const details =
    error instanceof OpenAI.APIError
      ? { type: error.type, status: error.status, code: error.code }
      : { type: error instanceof Error ? error.name : "UnknownError" };
  console.error("product_search_failed", details);
}
