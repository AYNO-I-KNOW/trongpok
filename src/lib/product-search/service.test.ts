import { describe, expect, it, vi } from "vitest";
import { rankProducts } from "../scoring/product-search";
import { productSearchResultSchema } from "./contract";
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
const candidate = (model = "Logitech M240", productUrl = url): SearchCandidate => ({
  model,
  modelFamily: null,
  category: "mouse",
  url: productUrl,
  pageModel: model,
  pageKind: "product",
  price: { baht: 700, url: productUrl, pageModel: model, currency: "THB" },
  stock: { status: "in_stock", url: productUrl, pageModel: model },
  evidence: [
    {
      requirement: "silent",
      stance: "yes",
      text: "คลิกเงียบ",
      excerpt: "Silent switches",
      url: productUrl,
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
  it("drops unsupported, out-of-stock, wrong category and wrong variant products", () => {
    const noPrice = { ...candidate(), price: null };
    const soldOut = candidate();
    soldOut.stock.status = "out_of_stock";
    const wrongVariant = { ...candidate(), pageModel: "Logitech M240s" };
    expect(
      rankProducts(
        [
          noPrice,
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
    expect(rankProducts([item], goal, sources, "now")).toMatchObject([
      {
        fit: { percent: 40, meetsRequired: false },
        unknowns: expect.arrayContaining(["ข้อมูลไม่พอ · silent"]),
        reasons: [{ text: expect.stringContaining(item.model), url }],
      },
    ]);
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
  it("shows explicitly contradicted must requirements as caveats, not positive evidence", () => {
    const item = candidate();
    item.evidence[0].stance = "no";
    expect(rankProducts([item], goal, sources, "now")).toMatchObject([
      {
        fit: { percent: 40, meetsRequired: false },
        unknowns: expect.arrayContaining(["ไม่ตรงความต้องการ · silent"]),
        reasons: [{ text: expect.stringContaining(item.model), url }],
      },
    ]);
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
  it("keeps an empty web outcome when completed discovery finds no verifiable offer", async () => {
    const search = vi.fn<SearchBackend["search"]>().mockResolvedValue({
      candidates: [{ ...candidate(), price: null, evidence: [] }],
      sources,
      usable: true,
      searchCalls: 1,
    });
    expect(
      await searchProducts("silent mouse", { goal: async () => goal, search }),
    ).toMatchObject({
      kind: "web",
      picks: [],
      note: expect.stringContaining("ยืนยันทั้งรุ่นและราคา"),
    });
  });
  it("offers the agent's preset answers before searching and reserves Other for the UI", async () => {
    const search = vi.fn<SearchBackend["search"]>();
    const question = "จะใช้เมาส์ทำอะไรเป็นหลัก?";
    const grip = { question: "ถนัดมือข้างไหน?", choices: ["ขวา", "ซ้าย"] };
    const connection = { question: "ต่อเมาส์กับอุปกรณ์ไหน?", choices: ["คอมพิวเตอร์", "แท็บเล็ต"] };
    const result = await searchProducts("อยากได้เมาส์", {
      goal: async () => ({
        ...goal,
        clarification: [
          { question, choices: ["ทำงานออฟฟิศ", "เล่นเกม", "อื่น ๆ (ระบุเอง)"] },
          grip,
          connection,
        ],
      }),
      search,
    });
    expect(productSearchResultSchema.parse(result)).toEqual({
      kind: "clarify",
      questions: [
        { question, choices: ["ทำงานออฟฟิศ", "เล่นเกม"] },
        grip,
        connection,
      ],
    });
    expect(search).not.toHaveBeenCalled();
  });

  it("returns no second questionnaire after a buyer submits answers", async () => {
    const search = vi.fn<SearchBackend["search"]>();
    const backend = {
      goal: async () => ({
        ...goal,
        clarification: [{ question: "ถนัดมือข้างไหน?", choices: ["ขวา", "ซ้าย"] }],
      }),
      search,
    };
    const turns = [{ question: "จะใช้เมาส์ทำอะไรเป็นหลัก?", answer: "ยังไม่แน่ใจ" }];
    const result = await searchProducts("อยากได้เมาส์", backend, undefined, turns);
    expect(productSearchResultSchema.parse(result)).toMatchObject({ kind: "needs-specifics" });
    expect(search).not.toHaveBeenCalled();
  });

  it("starts discovery after the fifth answer without turning examples in a question into requirements", async () => {
    const search = vi.fn<SearchBackend["search"]>().mockResolvedValue({
      candidates: [candidate()],
      sources,
      usable: true,
      searchCalls: 1,
    });
    const turns = Array.from({ length: 5 }, () => ({
      question: "อยากได้เมาส์สำหรับงานแบบไหน เช่น ใช้เล่นเกม งบ 100 บาท?",
      answer: "ทำงานออฟฟิศ",
    }));
    const result = await searchProducts("เมาส์คลิกเงียบ", { goal: async () => goal, search }, undefined, turns);
    expect(result).toMatchObject({ kind: "web", picks: [{ model: "Logitech M240" }] });
    expect(search.mock.calls[0]?.[0]).not.toContain("งบ 100 บาท");
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

it("returns only verified, priced alternatives when no pick meets every required check", async () => {
  const unconfirmed = candidate();
  unconfirmed.evidence = [{
    ...unconfirmed.evidence[0],
    requirement: "wireless",
    excerpt: "Wireless connectivity",
    text: "ไร้สาย",
  }];
  unconfirmed.stock.status = "unknown";
  const aboveCap = candidate("Logitech M650", "https://www.jib.co.th/product/m650");
  aboveCap.price!.baht = 1300;
  const wrongVariant = candidate("Logitech M220", "https://www.jib.co.th/product/m220s");
  wrongVariant.pageModel = "Logitech M220s";
  const unpriced = candidate("Logitech M350", "https://www.jib.co.th/product/m350");
  unpriced.price = null;
  const candidates = [aboveCap, wrongVariant, unpriced, unconfirmed];
  const verifiedSources = new Set(candidates.map((item) => item.url));
  const search = vi.fn<SearchBackend["search"]>()
    .mockResolvedValueOnce({ candidates, sources: verifiedSources, usable: true, searchCalls: 1 })
    .mockResolvedValue({ candidates: [], sources: verifiedSources, usable: true, searchCalls: 1 });

  const result = productSearchResultSchema.parse(
    await searchProducts("silent wireless mouse", { goal: async () => goal, search }),
  );

  expect(result).toMatchObject({
    kind: "web",
    searchRounds: 2,
    note: expect.not.stringContaining("ภายในงบ"),
    picks: [
      {
        model: unconfirmed.model,
        url: unconfirmed.url,
        price: { baht: 700 },
        fit: { percent: 60, meetsRequired: false },
        unknowns: expect.arrayContaining([
          "ข้อมูลไม่พอ · silent",
          "ร้านยังไม่ยืนยันว่ามีสินค้าพร้อมขาย",
        ]),
      },
      {
        model: aboveCap.model,
        url: aboveCap.url,
        price: { baht: 1300 },
        fit: { percent: 40, meetsRequired: false },
        unknowns: expect.arrayContaining(["เกินงบ 300 บาท", "ข้อมูลไม่พอ · wireless"]),
      },
    ],
  });
});

it("searches again with three partial picks and puts a newly found required match first", async () => {
  const preferences = ["wireless", "Bluetooth", "compact"];
  const buyerGoal = { ...goal, nice: preferences };
  const partial = candidate();
  partial.evidence = preferences.map((requirement) => ({
    ...partial.evidence[0],
    requirement,
    excerpt: requirement,
    text: requirement,
  }));
  const contradicted = candidate("Logitech M220", "https://www.jib.co.th/product/m220");
  contradicted.evidence[0] = {
    ...contradicted.evidence[0],
    stance: "no",
    excerpt: "Audible standard switches",
    text: "คลิกไม่เงียบ",
  };
  const aboveCap = candidate("Logitech M650", "https://www.jib.co.th/product/m650");
  aboveCap.price!.baht = 1300;
  const exact = candidate("Logitech M350", "https://www.jib.co.th/product/m350");
  const candidates = [partial, contradicted, aboveCap];
  const verifiedSources = new Set(candidates.map((item) => item.url));
  const search = vi.fn<SearchBackend["search"]>()
    .mockImplementation(async (_query, _goal, _seen, round) =>
      round === 0
        ? { candidates, sources: verifiedSources, usable: true, searchCalls: 1 }
        : { candidates: [exact], sources: new Set([exact.url]), usable: true, searchCalls: 1 },
    );

  const result = productSearchResultSchema.parse(
    await searchProducts("silent mouse", { goal: async () => buyerGoal, search }),
  );

  expect(search).toHaveBeenCalledTimes(4);
  expect(search).toHaveBeenNthCalledWith(
    4,
    "silent mouse",
    buyerGoal,
    [],
    1,
    expect.objectContaining({ knownModels: candidates.map((item) => item.model) }),
  );
  expect(result).toMatchObject({
    kind: "web",
    searchRounds: 2,
    picks: [
      { model: exact.model, fit: { percent: 57, meetsRequired: true } },
      { model: partial.model, fit: { percent: 71, meetsRequired: false } },
      {
        model: contradicted.model,
        fit: { percent: 29, meetsRequired: false },
        unknowns: expect.arrayContaining(["ไม่ตรงความต้องการ · silent"]),
      },
    ],
  });
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

it("reports full fit for a verified priced category match when there are no other checks", () => {
  expect(
    rankProducts(
      [candidate()],
      { ...goal, budget: null, must: [], nice: [] },
      sources,
      "now",
    ),
  ).toMatchObject([{ fit: { percent: 100, meetsRequired: true }, unknowns: [] }]);
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
  expect(extract).toHaveBeenCalledWith("เมาส์ไร้สาย", []);
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


it.each([false, true])("prefers the chosen SKU's supporting reason regardless of offer order (reversed: %s)", (reverse) => {
  const selected = candidate();
  const otherUrl = "https://www.jib.co.th/product/m240-white";
  const other = {
    ...candidate(),
    url: otherUrl,
    price: { baht: 800, currency: "THB", pageModel: selected.model, url: otherUrl },
    stock: { ...selected.stock, url: otherUrl },
    evidence: [{ ...selected.evidence[0], url: otherUrl, text: "รุ่นสีขาวคลิกเงียบ" }],
  } satisfies SearchCandidate;
  const offers = reverse ? [other, selected] : [selected, other];
  const verifiedSources = new Set([url, otherUrl]);
  expect(rankProducts(offers, goal, verifiedSources, "now")).toMatchObject([
    { url, price: { baht: 700 }, reasons: [{ text: "คลิกเงียบ", url }] },
  ]);
  other.evidence[0].stance = "no";
  expect(rankProducts(offers, goal, verifiedSources, "now")).toMatchObject([
    {
      url,
      price: { baht: 700 },
      fit: { percent: 40, meetsRequired: false },
      unknowns: expect.arrayContaining(["ไม่ตรงความต้องการ · silent"]),
      reasons: [{ text: expect.stringContaining(selected.model), url }],
    },
  ]);
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
