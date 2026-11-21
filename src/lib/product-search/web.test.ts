import { afterEach, describe, expect, it, vi } from "vitest";
import { Responses } from "openai/resources/responses/responses";
import { createSearchBackend, mergeSearchCandidates, parseCandidateOutput } from "./web";
import type { SearchCandidate } from "./domain";
import { rankProducts } from "../scoring/product-search";

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


describe("bounded live discovery", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("uses lean sourced URLs only in the retailer first round", async () => {
    const stopped = new Error("request captured");
    const create = vi.spyOn(Responses.prototype, "create").mockRejectedValue(stopped);
    const backend = createSearchBackend("test-key", "gpt-6-luna");
    const goal = { category: "test", must: ["feature"], nice: [], budget: 900, clarification: null };
    for (const strategy of ["retail", "value", "specs"] as const) {
      await expect(backend.search("buyer", goal, [], 0, {
        strategy, missingRequirements: [], knownModels: [], coveredDomains: [],
        avoidDomains: ["lazada.co.th"],
      })).rejects.toThrow(stopped);
    }
    for (const [index, call] of create.mock.calls.entries()) {
      const request = call[0];
      expect(request.max_tool_calls).toBe(2);
      expect(JSON.parse(String(request.input)).goal).toEqual(goal);
      if (index < 2) {
        expect(request.max_output_tokens).toBe(1200);
        expect(request.instructions).toContain("only prioritized direct product URLs");
        expect(request.tools).toEqual([expect.objectContaining({
          search_context_size: "low",
          filters: { allowed_domains: expect.arrayContaining(["powerbuy.co.th", "homepro.co.th"]) },
        })]);
      } else {
        expect(request.max_output_tokens).toBe(4500);
        expect(request.instructions).toContain("model-specific manuals");
      }
    }
  });

  it.each(["gpt-6-luna", "another-model"])(
    "limits web calls without imposing unsupported reasoning controls on %s",
    async (model) => {
      const stopped = new Error("request captured");
      const parse = vi.spyOn(Responses.prototype, "parse").mockRejectedValue(stopped);
      const create = vi.spyOn(Responses.prototype, "create").mockRejectedValue(stopped);
      const backend = createSearchBackend("test-key", model);
      await expect(backend.goal("buyer request")).rejects.toThrow(stopped);
      expect(parse.mock.calls[0][0]).toMatchObject({ model });
      expect(parse.mock.calls[0][0].reasoning).toEqual(
        model === "gpt-6-luna" ? { effort: "none" } : undefined,
      );
      const goal = { category: "test category", must: ["feature"], nice: [], budget: 900, clarification: null };
      await expect(backend.search("buyer request", goal, [], 1, {
        strategy: "value", missingRequirements: ["feature"], knownModels: ["Model"],
        coveredDomains: [], unpricedModels: ["Model"], preferredOfferDomains: ["jib.co.th"],
      })).rejects.toThrow(stopped);
      const request = create.mock.calls[0][0];
      expect(request).toMatchObject({ tool_choice: "required", max_tool_calls: 2 });
      expect(request.reasoning).toEqual(model === "gpt-6-luna" ? { effort: "low" } : undefined);
      expect(request.instructions).toContain("2 to 3 strong distinct products");
      expect(JSON.parse(String(request.input))).toMatchObject({
        goal, discovery: { unpricedModels: ["Model"], preferredOfferDomains: ["jib.co.th"] },
        instruction: expect.stringContaining("Search exact unpricedModels"),
      });
    },
  );
});


describe("source-only page discovery", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each(["prioritized", "incomplete", "malformed", "simple"])(
    "verifies sourced pages and all must requirements with a %s shortlist",
    async (shortlist) => {
      const unproven = "https://www.jib.co.th/product/invented";
      const must = shortlist === "simple" ? ["wireless"] : ["wireless", "silent", "compact", "bluetooth", "rechargeable"];
      const goal = { category: "mouse", must, nice: ["blue"], budget: 900, clarification: null };
      const fetcher = vi.fn().mockResolvedValue(new Response(
        `<title>Brand A123</title><main><h1>Brand A123 mouse</h1><p>฿799</p>${must.map((feature) => `<p>${feature} supported</p>`).join("")}</main>` +
        `<script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: "Brand A123", offers: { availability: "https://schema.org/InStock" } })}</script>`,
      ));
      vi.stubGlobal("fetch", fetcher);
      vi.spyOn(Responses.prototype, "create").mockResolvedValue({
        output: [{ type: "web_search_call", id: "search", status: "completed", action: {
          type: "search", query: "mouse", sources: [{ type: "url", url }],
        } }],
        output_text: shortlist === "malformed" ? '{"urls":[' : JSON.stringify({ urls: shortlist === "incomplete" ? [] : [unproven, url] }),
      } as Awaited<ReturnType<Responses["create"]>>);
      const parse = vi.spyOn(Responses.prototype, "parse").mockResolvedValue({
        status: "completed",
        output_parsed: { candidates: [{
          page: 0, model: "Brand A123", family: "Brand A123", matchesCategory: true,
          evidence: [...must.map((requirement) => ({ requirement, stance: "yes", excerpt: `${requirement} supported`, reason: `รองรับ ${requirement}` })),
            { requirement: "blue", stance: "yes", excerpt: "invented blue finish", reason: "สีฟ้า" }],
        }] },
      } as Awaited<ReturnType<Responses["parse"]>>);
      const result = await createSearchBackend("test-key", "gpt-6-luna").search("mouse", goal, []);
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(fetcher.mock.calls[0][0]).toBe(url);
      expect(parse.mock.calls[0][0].instructions).toContain(shortlist === "simple" ? "Return at most 4 evidence items per model." : "every must requirement first");
      expect(result.candidates).toHaveLength(1);
      expect(result.candidates[0].price?.baht).toBe(799);
      expect(result.candidates[0].stock.status).toBe("in_stock");
      expect(result.candidates[0].evidence.map((item) => item.excerpt)).toEqual(must.map((feature) => `${feature} supported`));
      expect(rankProducts(result.candidates, goal, result.sources, "2026-11-21T00:00:00Z")).toHaveLength(1);
    },
  );
});
