import { describe, expect, it, vi } from "vitest";
import { rankProducts } from "../scoring/product-search";
import { searchProducts } from "./service";
import {
  completedSearchSources,
  sourceUrl,
  type SearchBackend,
  type SearchCandidate,
  type SearchGoal,
} from "./web";

const goal: SearchGoal = {
  category: "mouse",
  budget: 1000,
  must: ["silent"],
  nice: ["wireless"],
  clarification: null,
};
const url = "https://www.jib.co.th/product/m240";
const candidate = (model = "Logitech M240"): SearchCandidate => ({
  model,
  modelFamily: null,
  category: "mouse",
  url,
  pageModel: model,
  pageKind: "product",
  price: { baht: 700, url, pageModel: model, currency: "THB" },
  stock: { status: "in_stock", url, pageModel: model },
  evidence: [
    {
      requirement: "silent",
      stance: "yes",
      text: "คลิกเงียบ",
      excerpt: "Silent switches",
      url,
      pageModel: model,
    },
  ],
});
const sources = new Set([url]);

describe("live product validation", () => {
  it("rejects Shopee, lookalike domains, non-HTTPS and credentials", () => {
    for (const raw of [
      "https://shopee.co.th/a",
      "https://jib.co.th.evil.com/a",
      "http://jib.co.th/a",
      "https://user@jib.co.th/a",
    ])
      expect(sourceUrl(raw)).toBeNull();
  });
  it("drops unsupported, over-budget, out-of-stock, wrong category and wrong variant products", () => {
    const noPrice = { ...candidate(), price: null };
    const costly = candidate();
    costly.price!.baht = 1100;
    const soldOut = candidate();
    soldOut.stock.status = "out_of_stock";
    const wrongVariant = { ...candidate(), pageModel: "Logitech M240s" };
    expect(
      rankProducts(
        [
          noPrice,
          costly,
          soldOut,
          wrongVariant,
          { ...candidate(), category: "keyboard" },
        ],
        goal,
        sources,
        "now",
      ),
    ).toEqual([]);
    expect(rankProducts([candidate()], goal, new Set(), "now")).toEqual([]);
  });
  it("never accepts wrong-variant price or evidence as verified", () => {
    const item = candidate();
    item.price!.pageModel = "M241";
    expect(rankProducts([item], goal, sources, "now")).toEqual([]);
    item.price = candidate().price;
    item.evidence[0].pageModel = "M241";
    expect(rankProducts([item], goal, sources, "now")).toEqual([]);
  });
  it("deduplicates actual models and ranks evidence before price", () => {
    const cheap = candidate("Logitech M220");
    cheap.url = "https://www.jib.co.th/product/m220";
    const distinctSources = new Set([...sources, cheap.url]);
    cheap.price!.baht = 400;
    cheap.evidence[0].url = cheap.url;
    cheap.price!.url = cheap.url;
    const preferred = candidate();
    preferred.evidence.push({
      ...preferred.evidence[0],
      requirement: "wireless",
      text: "ไร้สาย",
    });
    const picks = rankProducts(
      [cheap, preferred, candidate("Logitech M240 Black")],
      goal,
      distinctSources,
      "now",
    );
    expect(picks.map((pick) => pick.model)).toEqual([
      "Logitech M240",
      "Logitech M220",
    ]);
    expect(picks[1].unknowns).toContain("ข้อมูลไม่พอ · wireless");
  });
  it("excludes explicitly contradicted must requirements", () => {
    const item = candidate();
    item.evidence[0].stance = "no";
    expect(rankProducts([item], goal, sources, "now")).toEqual([]);
  });
});

describe("live search rounds", () => {
  it("keeps original constraints and retains first results if expansion fails", async () => {
    const search = vi
      .fn<SearchBackend["search"]>()
      .mockResolvedValueOnce({
        candidates: [candidate()],
        sources,
        usable: true,
        searchCalls: 1,
      })
      .mockRejectedValue(new Error("timeout"));
    const result = await searchProducts("silent mouse", {
      goal: async () => goal,
      search,
    });
    expect(result).toMatchObject({
      kind: "web",
      picks: [{ model: "Logitech M240" }],
      note: expect.stringContaining("ค้นเพิ่มไม่สำเร็จ"),
    });
    expect(search).toHaveBeenNthCalledWith(
      4,
      "silent mouse",
      goal,
      ["Logitech M240"],
      1,
      expect.objectContaining({ knownModels: ["Logitech M240"] }),
    );
  });
  it("reports unavailable when discovery completes without any usable sources", async () => {
    const query = "เครื่องวัดรังสีนิวตรอน";
    const search = vi.fn<SearchBackend["search"]>().mockResolvedValue({
      candidates: [],
      sources: new Set(),
      usable: false,
      searchCalls: 1,
    });
    expect(
      await searchProducts(query, {
        goal: async () => ({ ...goal, category: query }),
        search,
      }),
    ).toMatchObject({ kind: "unavailable" });
  });
  it("does not present zero matches when discovery sources could not be verified", async () => {
    const query = "เครื่องวัดรังสีนิวตรอน";
    const blocked = "https://www.powerbuy.co.th/th/product/neutron-meter";
    const search = vi.fn<SearchBackend["search"]>().mockResolvedValue({
      candidates: [],
      sources: new Set([blocked]),
      usable: false,
      searchCalls: 1,
      unavailableDomains: ["powerbuy.co.th"],
    });
    expect(
      await searchProducts(query, {
        goal: async () => ({ ...goal, category: query }),
        search,
      }),
    ).toMatchObject({ kind: "unavailable" });
  });
  it("reports unavailable when an empty first round is followed by a failed search", async () => {
    const query = "เครื่องวัดรังสีนิวตรอน";
    const search = vi
      .fn<SearchBackend["search"]>()
      .mockResolvedValueOnce({ candidates: [], sources, usable: true, searchCalls: 1 })
      .mockRejectedValue(new Error("timeout"));
    expect(
      await searchProducts(query, {
        goal: async () => ({ ...goal, category: query }),
        search,
      }),
    ).toMatchObject({ kind: "unavailable" });
  });
  it("keeps an empty web outcome when completed discovery finds no qualifying matches", async () => {
    const search = vi.fn<SearchBackend["search"]>().mockResolvedValue({
      candidates: [{ ...candidate(), price: null, evidence: [] }],
      sources,
      usable: true,
      searchCalls: 1,
    });
    expect(
      await searchProducts("silent mouse", { goal: async () => goal, search }),
    ).toMatchObject({ kind: "web", picks: [] });
  });
  it("asks a clarification without searching", async () => {
    const search = vi.fn<SearchBackend["search"]>();
    expect(
      await searchProducts("หาอะไรดี", {
        goal: async () => ({ ...goal, clarification: "อยากได้สินค้าประเภทไหน?" }),
        search,
      }),
    ).toEqual({ kind: "clarify", question: "อยากได้สินค้าประเภทไหน?" });
    expect(search).not.toHaveBeenCalled();
  });
});

describe("search execution proof", () => {
  it("requires completed search calls with allowed action sources", () => {
    expect(() => completedSearchSources([])).toThrow();
    expect(() =>
      completedSearchSources([
        {
          id: "s",
          type: "web_search_call",
          status: "failed",
          action: { type: "search", sources: [{ type: "url", url }] },
        },
      ]),
    ).toThrow();
    expect(() =>
      completedSearchSources([
        {
          id: "s",
          type: "web_search_call",
          status: "completed",
          action: { type: "open_page", url },
        },
      ]),
    ).toThrow();
    expect(
      completedSearchSources([
        {
          id: "s",
          type: "web_search_call",
          status: "completed",
          action: {
            type: "search",
            sources: [{ type: "url", url: "https://shopee.co.th/product" }],
          },
        },
      ]).sources.size,
    ).toBe(0);
    expect(
      completedSearchSources([
        {
          id: "s",
          type: "web_search_call",
          status: "completed",
          action: { type: "search", sources: [{ type: "url", url }] },
        },
      ]).sources.has(url),
    ).toBe(true);
  });
});

it("rejects malformed primary URLs without losing other valid candidates", () => {
  expect(
    rankProducts(
      [{ ...candidate(), url: "invalid" }, candidate()],
      goal,
      sources,
      "now",
    ),
  ).toHaveLength(1);
});
it("rejects root, search and manual primary links and mismatched citation titles", () => {
  for (const path of ["/", "/search", "/manual/m240"]) {
    const link = `https://www.jib.co.th${path}`;
    expect(
      rankProducts(
        [{ ...candidate(), url: link }],
        goal,
        new Set([link]),
        "now",
      ),
    ).toEqual([]);
  }
  expect(
    rankProducts(
      [candidate()],
      goal,
      sources,
      "now",
      new Map([[url, "Logitech M241"]]),
    ),
  ).toEqual([]);
});
it("aborts before extracting goals or searching", async () => {
  const controller = new AbortController();
  controller.abort();
  const extract = vi.fn<SearchBackend["goal"]>();
  await expect(
    searchProducts(
      "mouse",
      { goal: extract, search: vi.fn() },
      controller.signal,
    ),
  ).rejects.toThrow();
  expect(extract).not.toHaveBeenCalled();
});

it("combines same-model spec evidence across shops and links the qualifying offer", () => {
  const local = candidate();
  local.price = null;
  const offer = candidate();
  const shopUrl = "https://www.homepro.co.th/p/123";
  offer.url = shopUrl;
  offer.price = {
    baht: 625,
    currency: "THB",
    pageModel: offer.model,
    url: shopUrl,
  };
  offer.stock.url = shopUrl;
  offer.evidence = [];
  const picks = rankProducts(
    [local, offer],
    goal,
    new Set([url, shopUrl]),
    "now",
  );
  expect(picks).toMatchObject([
    { url: shopUrl, price: { baht: 625, url: shopUrl }, reasons: [{ url }] },
  ]);
});

it("searches again instead of counting unverified musts toward the top three", async () => {
  const unverified = candidate();
  unverified.evidence = [];
  const search = vi
    .fn<SearchBackend["search"]>()
    .mockResolvedValueOnce({
      candidates: [unverified],
      sources,
      usable: true,
      searchCalls: 2,
    })
    .mockResolvedValueOnce({ candidates: [], sources, usable: true, searchCalls: 1 })
    .mockResolvedValueOnce({ candidates: [], sources, usable: true, searchCalls: 1 })
    .mockResolvedValueOnce({
      candidates: [candidate()],
      sources,
      usable: true,
      searchCalls: 1,
    });
  const result = await searchProducts("silent mouse", {
    goal: async () => goal,
    search,
  });
  expect(result).toMatchObject({
    kind: "web",
    searchRounds: 2,
    searchCalls: 5,
    picks: [{ model: "Logitech M240" }],
  });
});

it("excludes an unpriced exact model even without a spending cap", () => {
  expect(
    rankProducts(
      [{ ...candidate(), price: null }],
      { ...goal, budget: null },
      sources,
      "now",
    ),
  ).toEqual([]);
});

it("keeps excluded buyer URLs out of both provider requests", async () => {
  const extract = vi.fn().mockResolvedValue(goal);
  const search = vi
    .fn<SearchBackend["search"]>()
    .mockResolvedValue({ candidates: [], sources: new Set(), usable: false, searchCalls: 1 });
  const backend = { goal: extract, search };
  const link = "https://shopee.co.th/product/12/34";
  expect(await searchProducts(link, backend)).toMatchObject({
    kind: "clarify",
  });
  expect(extract).not.toHaveBeenCalled();
  await searchProducts("เมาส์ไร้สาย " + link, backend);
  expect(extract).toHaveBeenCalledWith("เมาส์ไร้สาย");
  expect(search.mock.calls.every(([text]) => text === "เมาส์ไร้สาย")).toBe(true);
});

it("counts two finishes of the same model sold on separate product pages only once", () => {
  const offers = [
    "Logitech M240 Graphite",
    "Logitech M240 Wireless Silent Rose",
    "Logitech M240s",
  ].map((name, index) => {
    const item = candidate(name);
    item.modelFamily = index === 2 ? name : "Logitech M240";
    item.url = url + index;
    item.price = {
      baht: 650 + index * 50,
      currency: "THB",
      url: item.url,
      pageModel: name,
    };
    item.stock.url = item.url;
    return item;
  });
  expect(
    rankProducts(
      offers,
      { ...goal, budget: null, must: [] },
      new Set(offers.map((item) => item.url)),
      "now",
    ),
  ).toHaveLength(2);
});

it("starts three complementary agents before awaiting any and ranks their combined candidates", async () => {
  const pending: Array<
    (value: Awaited<ReturnType<SearchBackend["search"]>>) => void
  > = [];
  const search = vi
    .fn<SearchBackend["search"]>()
    .mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
  const result = searchProducts("silent mouse", {
    goal: async () => goal,
    search,
  });
  await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(3));
  expect(search.mock.calls.map((call) => call[4]?.strategy)).toEqual([
    "retail",
    "specs",
    "value",
  ]);
  for (const [index, resolve] of pending.entries()) {
    const item = candidate(`Logitech M${index + 100}`);
    item.price!.baht = 800 - index * 100;
    item.url = `${url}${index}`;
    item.price!.url = item.url;
    item.stock.url = item.url;
    item.evidence[0].url = item.url;
    resolve({
      candidates: [item],
      sources: new Set([item.url]),
      usable: true,
      searchCalls: 1,
    });
  }
  expect(await result).toMatchObject({
    kind: "web",
    searchRounds: 1,
    searchCalls: 3,
    picks: [
      { model: "Logitech M102" },
      { model: "Logitech M101" },
      { model: "Logitech M100" },
    ],
    discovery: { agents: 3, completed: 3, candidates: 3, followUp: false },
  });
});

it("propagates cancellation after discovery without starting a follow-up", async () => {
  const controller = new AbortController();
  const search = vi
    .fn<SearchBackend["search"]>()
    .mockImplementation(async () => {
      controller.abort();
      return { candidates: [], sources, usable: true, searchCalls: 1 };
    });
  await expect(
    searchProducts(
      "silent mouse",
      { goal: async () => goal, search },
      controller.signal,
    ),
  ).rejects.toThrow();
  expect(search).toHaveBeenCalledTimes(3);
});

it("targets missing coverage and avoids blocked domains in the follow-up", async () => {
  const search = vi.fn<SearchBackend["search"]>().mockResolvedValue({
    candidates: [candidate()],
    sources,
    usable: true,
    searchCalls: 1,
    unavailableDomains: ["www.powerbuy.co.th"],
  });
  const result = await searchProducts("silent mouse", {
    goal: async () => goal,
    search,
  });
  expect(search).toHaveBeenNthCalledWith(
    4,
    "silent mouse",
    goal,
    ["Logitech M240"],
    1,
    {
      strategy: "retail",
      avoidDomains: ["www.powerbuy.co.th"],
      unpricedModels: [],
      preferredOfferDomains: ["www.jib.co.th"],
      missingRequirements: ["silent", "wireless"],
      knownModels: ["Logitech M240"],
      coveredDomains: ["www.jib.co.th"],
    },
  );
  expect(result).toMatchObject({
    kind: "web",
    discovery: { completed: 3, followUp: true },
  });
});

it("keeps a verified first-round offer when unusable expansion cites the same URL", async () => {
  const search = vi.fn<SearchBackend["search"]>()
    .mockResolvedValueOnce({ candidates: [candidate()], sources, usable: true, searchCalls: 1 })
    .mockRejectedValueOnce(new Error("offline"))
    .mockRejectedValueOnce(new Error("offline"))
    .mockResolvedValueOnce({ candidates: [], sources, usable: false, titles: new Map([[url, "JIB homepage"]]), searchCalls: 1 });
  await expect(searchProducts("silent mouse", { goal: async () => goal, search }))
    .resolves.toMatchObject({ kind: "web", picks: [{ model: "Logitech M240", price: { baht: 700 } }] });
});
