import OpenAI from "openai";
import { rankProducts } from "../scoring/product-search";
import type { ClarificationTurn, ProductSearchResult } from "./contract";
import { demoFallback } from "./demo";
import { sourceUrl } from "./domain";
import { budgetFromQuery } from "./budget";
import {
  createSearchBackend,
  type SearchBackend,
  type SearchCandidate,
} from "./web";

const productTypeQuestion = {
  kind: "clarify",
  questions: [{
    question: "กำลังมองหาสินค้าประเภทไหน?",
    choices: ["เครื่องใช้ไฟฟ้าในบ้าน", "อุปกรณ์ไอที", "อุปกรณ์ออกกำลังกาย"],
  }],
} satisfies ProductSearchResult;
const needsSpecifics = {
  kind: "needs-specifics",
  message: "ข้อมูลยังไม่พอให้รู้ว่าควรค้นหาสินค้าแบบไหน ลองแก้โจทย์โดยระบุประเภทสินค้าหรือการใช้งานหลัก",
} satisfies ProductSearchResult;

function cleanBuyerText(text: string): string {
  return text
    .replace(
      /https?:\/\/[^\s<>]+|\b(?:[\w-]+\.)*(?:shopee\.[a-z.]+|shope\.ee)\/[^\s<>]*/gi,
      (link) => sourceUrl(link) ?? "",
    )
    .trim();
}

export async function searchProducts(
  query: string,
  backend?: SearchBackend,
  signal?: AbortSignal,
  clarifications: readonly ClarificationTurn[] = [],
): Promise<ProductSearchResult> {
  signal?.throwIfAborted();
  const original = cleanBuyerText(query);
  const turns = clarifications.map(({ question, answer }) => ({
    question: cleanBuyerText(question),
    answer: cleanBuyerText(answer),
  }));
  const searchText = [original, ...turns.map(({ answer }) => answer)].filter(Boolean).join("\n");
  const canClarify = turns.length === 0;
  const askProductType = canClarify ? productTypeQuestion : needsSpecifics;
  const fallback = async () => {
    const result = await demoFallback(searchText);
    return !canClarify && result.kind === "clarify" ? needsSpecifics : result;
  };
  if (!searchText) return askProductType;
  if (!backend && (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL))
    return fallback();
  const live =
    backend ??
    createSearchBackend(
      process.env.OPENAI_API_KEY!,
      process.env.OPENAI_MODEL!,
      signal,
    );
  try {
    const extracted = await live.goal(original, turns);
    if (extracted.clarification) {
      if (!canClarify) return needsSpecifics;
      const questions = extracted.clarification.flatMap(({ question, choices }) => {
        const presets = [...new Set(choices)].filter(
          (choice) => !/^(?:อื่น(?:\s*ๆ)?|กรอกเอง|พิมพ์เอง|ระบุเอง|other)(?:$|[\s(:（])/iu.test(choice),
        );
        return presets.length >= 2 ? [{ question, choices: presets }] : [];
      });
      return questions.length
        ? { kind: "clarify", questions }
        : askProductType;
    }
    const cap = budgetFromQuery(searchText);
    const goal = {
      ...extracted,
      budget:
        cap === null
          ? extracted.budget
          : Math.min(cap, extracted.budget ?? cap),
    };
    if (!goal.category.trim()) return askProductType;
    if (goal.budget !== null && (!Number.isFinite(goal.budget) || goal.budget <= 0))
      return !canClarify ? needsSpecifics : {
        kind: "clarify",
        questions: [{
          question: "ตั้งงบไว้ไม่เกินเท่าไร?",
          choices: ["ไม่เกิน 1,000 บาท", "ไม่เกิน 3,000 บาท", "ไม่เกิน 5,000 บาท"],
        }],
      };
    const candidates: SearchCandidate[] = [];
    const sources = new Set<string>();
    const titles = new Map<string, string>();
    const unavailableDomains = new Set<string>();
    let searchCalls = 0;
    let expansionFailed = false;
    let searchRounds = 0;
    let completedAgents = 0;
    const merge = (result: Awaited<ReturnType<SearchBackend["search"]>>) => {
      searchCalls += result.searchCalls;
      result.unavailableDomains?.forEach((domain) => unavailableDomains.add(domain));
      if (result.usable === false || !result.sources.size) return false;
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
      result.titles?.forEach((title, url) => {
        if (result.sources.has(url) && !titles.has(url)) titles.set(url, title);
      });
      return true;
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
    let picks = rankProducts(
      candidates,
      goal,
      sources,
      new Date().toISOString(),
      titles,
    );
    const exactModels: string[] = [];
    for (const { model, fit } of picks) {
      if (fit.meetsRequired) exactModels.push(model);
    }
    if (exactModels.length < 3) {
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
        expansionFailed = !merge(
          await live.search(
            searchText,
            goal,
            exactModels,
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
    if (!picks.length && expansionFailed) return fallback();
    const summary = picks.length
      ? `ยืนยันรุ่นและราคาได้ ${picks.length} รุ่น`
      : "ยังไม่พบสินค้าที่มีข้อมูลยืนยันทั้งรุ่นและราคาจากแหล่งที่ตรวจสอบ";
    const searchStatus = expansionFailed
      ? " · ค้นเพิ่มไม่สำเร็จ"
      : completedAgents < initial.length
        ? " · ค้นเว็บได้ไม่ครบทุกส่วน"
        : "";
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
      note: summary + searchStatus,
    };
  } catch (error) {
    signal?.throwIfAborted();
    logFailure(error, "search");
    return fallback();
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
