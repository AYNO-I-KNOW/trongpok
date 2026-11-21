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
    const unavailableDomains = new Set<string>();
    let searchCalls = 0;
    let expansionFailed = false;
    let picks: ProductPick[] = [];
    let searchRounds = 0;
    let completedAgents = 0;
    const merge = (result: Awaited<ReturnType<SearchBackend["search"]>>) => {
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
      searchCalls += result.searchCalls;
      result.unavailableDomains?.forEach((domain) =>
        unavailableDomains.add(domain),
      );
    };
    const initial = await Promise.allSettled(
      (["retail", "specs", "value"] as const).map((strategy) =>
        live.search(searchText, goal, [], 0, {
          strategy,
          missingRequirements: goal.must,
          knownModels: [],
          coveredDomains: [],
        }),
      ),
    );
    signal?.throwIfAborted();
    for (const result of initial) {
      if (result.status === "fulfilled") {
        merge(result.value);
        completedAgents++;
      } else logFailure(result.reason, "discovery");
    }
    if (!completedAgents) throw new Error("All discovery agents failed");
    searchRounds = 1;
    picks = rankProducts(
      candidates,
      goal,
      sources,
      new Date().toISOString(),
      titles,
    );
    if (picks.length < 3) {
      searchRounds++;
      try {
        const knownModels = [
          ...new Set(candidates.map((candidate) => candidate.model)),
        ];
        const missingRequirements = [...goal.must, ...goal.nice].filter(
          (requirement) =>
            new Set(
              candidates
                .filter((candidate) =>
                  candidate.evidence.some(
                    (item) =>
                      item.requirement === requirement && item.stance === "yes",
                  ),
                )
                .map((candidate) => candidate.modelFamily ?? candidate.model),
            ).size < 3,
        );
        merge(
          await live.search(
            searchText,
            goal,
            picks.map((pick) => pick.model),
            1,
            {
              strategy: "retail",
              avoidDomains: [...unavailableDomains].filter(
                (domain) =>
                  !candidates.some(
                    (candidate) =>
                      candidate.price &&
                      new URL(candidate.price.url).hostname.replace(
                        /^www\./,
                        "",
                      ) === domain.replace(/^www\./, ""),
                  ),
              ),
              unpricedModels: knownModels.filter(
                (model) =>
                  !candidates.some(
                    (candidate) => candidate.model === model && candidate.price,
                  ),
              ),
              preferredOfferDomains: [
                ...new Set(
                  candidates.flatMap((candidate) =>
                    candidate.price
                      ? [new URL(candidate.price.url).hostname]
                      : [],
                  ),
                ),
              ],
              missingRequirements,
              knownModels,
              coveredDomains: [
                ...new Set([...sources].map((url) => new URL(url).hostname)),
              ],
            },
          ),
        );
        signal?.throwIfAborted();
        picks = rankProducts(
          candidates,
          goal,
          sources,
          new Date().toISOString(),
          titles,
        );
      } catch (error) {
        signal?.throwIfAborted();
        logFailure(error, "follow_up");
        expansionFailed = true;
      }
    }
    return {
      kind: "web",
      picks,
      searchCalls,
      searchRounds,
      discovery: {
        agents: 3,
        completed: completedAgents,
        candidates: new Set(
          candidates.map(
            (candidate) => candidate.modelFamily ?? candidate.model,
          ),
        ).size,
        sources: sources.size,
        followUp: searchRounds === 2,
      },
      note:
        picks.length === 3
          ? "เรียงตามเงื่อนไขที่ตรงโจทย์ แล้วจึงเทียบราคา"
          : `${expansionFailed ? "ค้นเพิ่มไม่สำเร็จ" : "ค้นเพิ่มแล้วแต่ข้อมูลยังไม่พอ"}${goal.budget === null ? "" : ` ภายในงบ ${goal.budget.toLocaleString("th-TH")} บาท`}${goal.must.length ? ` และเงื่อนไข ${goal.must.join(" / ")}` : ""}`,
    };
  } catch (error) {
    signal?.throwIfAborted();
    logFailure(error, "search");
    return demoFallback(searchText);
  }
}

function logFailure(error: unknown, phase: string) {
  const details =
    error instanceof OpenAI.APIError
      ? {
          type: error.type ?? error.name,
          status: error.status,
          code: error.code,
        }
      : { type: error instanceof Error ? error.name : "UnknownError" };
  console.error("product_search_failed", { phase, ...details });
}
