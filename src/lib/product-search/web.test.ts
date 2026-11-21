import { describe, expect, it } from "vitest";
import { mergeSearchCandidates, parseCandidateOutput } from "./web";
import type { SearchCandidate } from "./domain";

const url = "https://www.homepro.co.th/p/123";
const candidate: SearchCandidate = {
  model: "Brand A123",
  modelFamily: "Brand A123",
  category: "กาต้มน้ำ",
  url,
  pageModel: "Brand A123",
  pageKind: "product",
  price: { baht: 500, currency: "THB", url, pageModel: "Brand A123" },
  stock: { status: "in_stock", url, pageModel: "Brand A123" },
  evidence: [],
};

describe("search candidate recovery", () => {
  it("keeps usable source discovery when structured output is truncated or refused", () => {
    expect(parseCandidateOutput('{"candidates":[')).toEqual([]);
    expect(parseCandidateOutput("I cannot answer")).toEqual([]);
    expect(
      parseCandidateOutput(JSON.stringify({ candidates: [candidate] })),
    ).toEqual([candidate]);
  });

  it("retains purchase identity and offer provenance when duplicate extraction adds evidence", () => {
    const evidence = {
      requirement: "ไร้สาย",
      stance: "yes",
      excerpt: "Wireless",
      text: "รองรับไร้สาย",
      url,
      pageModel: candidate.model,
    } satisfies SearchCandidate["evidence"][number];
    const extraction: SearchCandidate = {
      ...candidate,
      modelFamily: "Brand",
      category: "accessory",
      pageModel: "Wrong model",
      price: {
        ...candidate.price!,
        baht: 1,
        url: "https://www.jib.co.th/product/other",
      },
      stock: { ...candidate.stock, status: "out_of_stock" },
      evidence: [evidence],
    };
    expect(
      mergeSearchCandidates([candidate, extraction], new Set([url])),
    ).toEqual([{ ...candidate, evidence: [evidence] }]);
  });

  it("drops candidates with unsourced, forbidden or non-product primary URLs", () => {
    expect(
      mergeSearchCandidates(
        [
          { ...candidate, url: "https://www.jib.co.th/product/other" },
          { ...candidate, url: "https://shopee.co.th/product/123" },
          { ...candidate, pageKind: "manual" },
        ],
        new Set([url]),
      ),
    ).toEqual([]);
  });
});
