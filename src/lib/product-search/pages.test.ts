import { afterEach, describe, expect, it, vi } from "vitest";
import { createProductPageCache, readProductPages, verifyProductPages } from "./pages";
import type { SearchCandidate } from "./domain";
import { rankProducts } from "../scoring/product-search";
import { productSearchResultSchema } from "./contract";
const url = "https://www.jib.co.th/product/logitech-m240";
function candidate(): SearchCandidate {
  return {
    model: "Logitech M240",
    modelFamily: null,
    category: "mouse",
    url,
    pageModel: "Logitech M240",
    pageKind: "product",
    price: { baht: 100, currency: "THB", url, pageModel: "Logitech M240" },
    stock: { status: "in_stock", url, pageModel: "Logitech M240" },
    evidence: [],
  };
}
function page(model = "Logitech M240", price = 799, availability = "InStock") {
  return `<title>${model}</title><script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: model, offers: { "@type": "Offer", price, priceCurrency: "THB", availability: `https://schema.org/${availability}` } })}</script>`;
}
afterEach(() => vi.unstubAllGlobals());
describe("independent retail page verification", () => {
  it("uses the published same-model price and deduplicates requests", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(page()));
    vi.stubGlobal("fetch", fetcher);
    const result = await verifyProductPages([candidate()], new Set([url]));
    expect(result[0].price?.baht).toBe(799);
    expect(result[0].stock.status).toBe("in_stock");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    page("Logitech M240s"),
    page("Logitech M240 Pro"),
    page("Logitech M241"),
    page("Logitech M240", 799, "OutOfStock"),
    "<title>JIB homepage</title>",
  ])("rejects a wrong variant, sold out or unrelated page", async (html) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(html)));
    expect(await verifyProductPages([candidate()], new Set([url]))).toEqual([]);
  });
  it("never fetches missing sources, custom ports, Shopee or redirects outside the source list", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: "https://shopee.co.th/m240" },
      }),
    );
    vi.stubGlobal("fetch", fetcher);
    expect(await verifyProductPages([candidate()], new Set())).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
    expect(await verifyProductPages([candidate()], new Set([url]))).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockClear();
    for (const link of [
      "https://jib.co.th:8443/product/m240",
      "https://shopee.co.th/product/m240",
    ]) {
      expect(
        await verifyProductPages(
          [{ ...candidate(), url: link }],
          new Set([link]),
        ),
      ).toEqual([]);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects nonexistent and opaque inaccessible URLs despite model self-attestation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 403 })),
    );
    const link = "https://www.jib.co.th/product/12345";
    expect(
      await verifyProductPages(
        [{ ...candidate(), url: link }],
        new Set([link, url]),
      ),
    ).toEqual([]);
  });
  it("does not borrow a different model price", async () => {
    const priceUrl = "https://www.jib.co.th/product/logitech-m241";
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation((link: string) =>
          Promise.resolve(
            new Response(
              link === url
                ? "<title>Logitech M240</title>Product details"
                : page("Logitech M241"),
            ),
          ),
        ),
    );
    const item = candidate();
    item.price = { ...item.price!, url: priceUrl };
    expect(
      (await verifyProductPages([item], new Set([url, priceUrl])))[0].price,
    ).toBeNull();
  });
  it("uses unambiguous visible prices but excludes installment amounts", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            "<title>Logitech M240</title><h1>Logitech M240</h1><p>฿799</p>",
          ),
        ),
    );
    expect(
      (await verifyProductPages([candidate()], new Set([url])))[0].price?.baht,
    ).toBe(799);
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("<title>Logitech M240</title><p>ผ่อน ฿99 / เดือน</p>"),
        ),
    );
    expect(
      (await verifyProductPages([candidate()], new Set([url])))[0].price,
    ).toBeNull();
  });
  it("ignores unrelated recommended-product stock but honors explicit tool stock", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(page() + "<aside>Other product out of stock</aside>"),
        ),
    );
    expect(
      await verifyProductPages([candidate()], new Set([url])),
    ).toHaveLength(1);
    const soldOut = candidate();
    soldOut.stock.status = "out_of_stock";
    expect(await verifyProductPages([soldOut], new Set([url]))).toEqual([]);
  });
  it("rejects an explicit sold-out message on the product even without structured availability", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            "<title>Logitech M240</title><main>฿799 สินค้าหมดชั่วคราว</main>",
          ),
        ),
    );
    expect(await verifyProductPages([candidate()], new Set([url]))).toEqual([]);
  });
  it("rejects an out-of-stock purchase button even when JSON-LD advertises InStock", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            page() + '<button class="out_stock">สินค้าหมดชั่วคราว</button>',
          ),
        ),
    );
    expect(await verifyProductPages([candidate()], new Set([url]))).toEqual([]);
  });
  it("drops unverified spec sources and handles malformed HTML entities", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(page() + "&#999999999999999;")),
    );
    const item = candidate();
    item.evidence = [
      {
        requirement: "quiet",
        stance: "yes",
        text: "quiet",
        excerpt: "quiet",
        url: "https://www.jib.co.th/product/other",
        pageModel: item.model,
      },
    ];
    const result = await verifyProductPages([item], new Set([url]));
    expect(result[0].evidence).toEqual([]);
  });
  it("requires exact decoded passages for yes/no claims on the verified primary page", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            page() +
              "<main><p>SilentTouch&nbsp;technology</p><p>1.7 ลิตร</p></main><aside>waterproof</aside>",
          ),
        ),
    );
    const item = candidate();
    item.evidence = [
      "SilentTouch technology",
      "1.7 ลิตร",
      "waterproof",
      "silent touch",
    ].map((excerpt) => ({
      requirement: excerpt,
      stance: "yes",
      text: "คำอธิบายภาษาไทย",
      excerpt,
      url,
      pageModel: item.model,
    }));
    const result = await verifyProductPages([item], new Set([url]));
    expect(result[0].evidence.map((evidence) => evidence.excerpt)).toEqual([
      "SilentTouch technology",
      "1.7 ลิตร",
    ]);
  });
  it("accepts passages from same-model HTML manuals and rejects wrong-model manuals", async () => {
    const manual = "https://www.jib.co.th/manual/logitech-m240";
    const wrong = "https://www.jib.co.th/manual/logitech-m241";
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation((link: string) =>
          Promise.resolve(
            new Response(
              link === url
                ? page()
                : `<title>${link === manual ? "Logitech M240" : "Logitech M241"} manual</title><main>SilentTouch</main>`,
            ),
          ),
        ),
    );
    const item = candidate();
    item.evidence = [manual, wrong].map((link) => ({
      requirement: "quiet",
      stance: "yes",
      text: "คลิกเงียบ",
      excerpt: "SilentTouch",
      url: link,
      pageModel: item.model,
    }));
    const result = await verifyProductPages(
      [item],
      new Set([url, manual, wrong]),
    );
    expect(result[0].evidence.map((evidence) => evidence.url)).toEqual([
      manual,
    ]);
    expect(
      await verifyProductPages([{ ...item, url: manual }], new Set([manual])),
    ).toEqual([]);
  });
  it("does not retain must evidence from blocked pages", async () => {
    const spec = "https://www.jib.co.th/manual/logitech-m240";
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation((link: string) =>
          Promise.resolve(
            link === url
              ? new Response(page())
              : new Response("SilentTouch", { status: 403 }),
          ),
        ),
    );
    const item = candidate();
    item.evidence = [
      {
        requirement: "quiet",
        stance: "no",
        text: "ไม่เงียบ",
        excerpt: "SilentTouch",
        url: spec,
        pageModel: item.model,
      },
    ];
    expect(
      (await verifyProductPages([item], new Set([url, spec])))[0].evidence,
    ).toEqual([]);
  });
  it("honors cancellation before fetching", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    await expect(
      verifyProductPages([candidate()], new Set([url]), controller.signal),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("decodes retailer bullet entities without changing quote spelling", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(page() + "<main><p>&bull; เม้าส์เสียงเบาเมื่อกดคลิก</p><p>&#8226; Silent click</p></main>")));
    const item = candidate();
    item.evidence = ["• เม้าส์เสียงเบาเมื่อกดคลิก", "• เมาส์เสียงเบาเมื่อกดคลิก", "• Silent click"].map((excerpt) => ({ requirement: "quiet", stance: "yes", text: "คลิกเงียบ", excerpt, url, pageModel: item.model }));
    const [verified] = await verifyProductPages([item], new Set([url]));
    expect(verified.evidence.map((entry) => entry.excerpt)).toEqual(["• เม้าส์เสียงเบาเมื่อกดคลิก", "• Silent click"]);
  });
  it("canonicalizes abbreviated evidence identity only after verifying its actual same-model page", async () => {
    const wrong = "https://www.jib.co.th/product/logitech-m240-pro";
    vi.stubGlobal("fetch", vi.fn().mockImplementation((link: string) => Promise.resolve(new Response(page(link === wrong ? "Logitech M240 Pro" : undefined) + "<main>Silent click</main>"))));
    const item = candidate();
    item.evidence = [url, wrong].map((link) => ({ requirement: "quiet", stance: "yes", text: "คลิกเงียบ", excerpt: "Silent click", url: link, pageModel: "M240" }));
    const sources = new Set([url, wrong]);
    const verified = await verifyProductPages([item], sources);
    expect(verified[0].evidence).toEqual([{ ...item.evidence[0], pageModel: item.model }]);
    expect(rankProducts(verified, { category: "mouse", budget: 1000, must: ["quiet"], nice: [], clarification: null }, sources, "now")).toHaveLength(1);
  });
  it("excludes nested recommendation, comparison and hidden stock and spec text", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(page() + '<main><p>Silent click</p><section class="related"><div><div>other</div><button>สินค้าหมดชั่วคราว</button></div></section><section class="pdp-section-pcompare"><table><tr><td>waterproof</td></tr></table></section><div hidden>out of stock</div></main>')));
    const item = candidate();
    item.evidence = ["Silent click", "waterproof"].map((excerpt) => ({ requirement: "quiet", stance: "yes", text: excerpt, excerpt, url, pageModel: item.model }));
    const [verified] = await verifyProductPages([item], new Set([url]));
    expect(verified.price?.baht).toBe(799);
    expect(verified.evidence.map((entry) => entry.excerpt)).toEqual(["Silent click"]);
  });
  it("shares source-page fetches with verification and reports blocked domains", async () => {
    const blocked = "https://www.powerbuy.co.th/th/product/logitech-m240";
    const fetcher = vi.fn().mockImplementation((link: string) => Promise.resolve(link === blocked ? new Response("blocked", { status: 403 }) : new Response(page() + "<main>SilentTouch</main>")));
    vi.stubGlobal("fetch", fetcher);
    const context = createProductPageCache();
    const sources = new Set([url, blocked, "https://shopee.co.th/m240"]);
    const pages = await readProductPages(sources, undefined, context);
    expect(pages).toEqual([expect.objectContaining({ url, title: "Logitech M240", modelNames: ["Logitech M240"], text: expect.stringContaining("SilentTouch") })]);
    expect(context.unavailableDomains).toEqual(new Set(["powerbuy.co.th"]));
    expect(await verifyProductPages([candidate()], sources, undefined, context)).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("does not reuse a cached redirect without every redirect URL in the current sources", async () => {
    const target = "https://www.jib.co.th/product/logitech-m240-new";
    vi.stubGlobal("fetch", vi.fn().mockImplementation((link: string) => Promise.resolve(link === url ? new Response(null, { status: 302, headers: { location: target } }) : new Response(page()))));
    const context = createProductPageCache();
    await readProductPages(new Set([url, target]), undefined, context);
    expect(await verifyProductPages([candidate()], new Set([url]), undefined, context)).toEqual([]);
  });
  it("retries a redirect rejected only because its destination was absent from an earlier lane", async () => {
    const target = "https://www.jib.co.th/product/logitech-m240-new";
    vi.stubGlobal("fetch", vi.fn().mockImplementation((link: string) => Promise.resolve(link === url ? new Response(null, { status: 302, headers: { location: target } }) : new Response(page()))));
    const context = createProductPageCache();
    expect(await verifyProductPages([candidate()], new Set([url]), undefined, context)).toEqual([]);
    expect(await verifyProductPages([candidate()], new Set([url, target]), undefined, context)).toHaveLength(1);
  });
  it("does not cache discovery host-quota misses as unavailable products", async () => {
    const urls = Array.from({ length: 9 }, (_, index) => `${url}-${index}`);
    const sources = new Set(urls);
    const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response(page())));
    vi.stubGlobal("fetch", fetcher);
    const context = createProductPageCache();
    expect(await readProductPages(sources, undefined, context)).toHaveLength(8);
    expect(context.unavailableDomains.size).toBe(0);
    const [verified] = await verifyProductPages([{ ...candidate(), url: urls[8], price: null }], sources, undefined, context);
    expect(verified.price?.baht).toBe(799);
    expect(fetcher).toHaveBeenCalledTimes(9);
  });
  it("allows retailer product nouns between a brand and model in citation titles while rejecting variants", async () => {
    const title = "Logitech Bluetooth Silent Mouse M240";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(page().replace("<title>Logitech M240</title>", `<title>${title}</title>`))));
    const sources = new Set([url]);
    const verified = await verifyProductPages([candidate()], sources);
    const goal = { category: "mouse", budget: 1000, must: [], nice: [], clarification: null };
    expect(rankProducts(verified, goal, sources, "now", new Map([[url, title]]))).toHaveLength(1);
    expect(rankProducts(verified, goal, sources, "now", new Map([[url, `${title} Pro`]]))).toHaveLength(0);
  });
  it("extracts primary specs and published offers before truncating large retailer navigation", async () => {
    const html = page() + `<div id="header">${"global navigation ".repeat(2000)}</div><div id="product_wrap"><h1>Logitech M240</h1><table><tr><td>Connection</td><td>Wireless</td></tr></table><p>&bull; Silent click</p></div>`;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(html)));
    const [result] = await readProductPages(new Set([url]));
    expect(result.text).toContain("Connection | Wireless");
    expect(result.text).toContain("• Silent click");
    expect(result.text).not.toContain("global navigation");
    expect(result.offers).toEqual([{ modelName: "Logitech M240", baht: 799, currency: "THB", availability: "https://schema.org/InStock" }]);
    expect(result.text.length).toBeLessThan(300);
  });
  it("places actual main spec rows before a long product description and rejects category listings", async () => {
    const listing = "https://www.central.co.th/th/computers/mice";
    vi.stubGlobal("fetch", vi.fn().mockImplementation((link: string) => Promise.resolve(new Response(link === listing ? "<title>Mice</title><main>Catalog</main>" : page() + `<main><p>${"Product description ".repeat(500)}</p><table><tr><td>ความจุ</td><td>1.70ลิตร</td></tr></table></main>`))));
    const result = await readProductPages(new Set([url, listing]));
    expect(result).toHaveLength(1);
    expect(result[0].text.indexOf("ความจุ | 1.70ลิตร")).toBeLessThan(100);
    expect(result[0].text.length).toBeLessThanOrEqual(6000);
  });
});

it("corroborates search tool table syntax only when the store places those cells in the same row", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          page() +
            "<main><table><tr><td>ความจุ</td><td>1.70ลิตร</td></tr><tr><td>น้ำหนัก</td><td>2.1 กก.</td></tr></table></main>",
        ),
      ),
  );
  const item = candidate();
  item.evidence = ["ความจุ  | 1.70ลิตร", "ความจุ | 2.1 กก."].map((excerpt) => ({
    requirement: "ความจุ",
    stance: "yes",
    text: "ความจุจากตาราง",
    excerpt,
    url,
    pageModel: item.model,
  }));
  const [verified] = await verifyProductPages([item], new Set([url]));
  expect(verified.evidence.map((entry) => entry.excerpt)).toEqual([
    "ความจุ  | 1.70ลิตร",
  ]);
});

it("carries only the verified primary same-model product photo through ranking and the public contract", async () => {
  const image = "https://statice.homepro.co.th/homepro/ARTICLE_IMAGE/11/372/1137295/447x447/25082022_1137295$Imagec1.jpg";
  const html = page() + `<script type="application/ld+json">${JSON.stringify([
    { "@type": "Product", name: "Logitech M241", image: "https://www.jib.co.th/images/wrong.jpg" },
    { "@type": "Product", name: "Logitech M240", image: [{ url: image }] },
  ])}</script>`;
  const fetcher = vi.fn().mockResolvedValue(new Response(html));
  vi.stubGlobal("fetch", fetcher);
  const verified = await verifyProductPages([candidate()], new Set([url]));
  const picks = rankProducts(verified, { category: "mouse", budget: null, must: [], nice: [], clarification: null }, new Set([url]), "2026-11-21T03:00:00Z");
  const result = productSearchResultSchema.parse({ kind: "web", picks, note: "", searchCalls: 1, searchRounds: 1 });
  expect(result.kind === "web" && result.picks[0].image).toBe(image);
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it.each([
  "https://shopee.co.th/m240.jpg",
  "http://www.jib.co.th/m240.jpg",
  "https://www.jib.co.th.evil.com/m240.jpg",
  "https://www.jib.co.th:8443/m240.jpg",
  "https://user:password@www.jib.co.th/m240.jpg",
  "https://unknown-cdn.com/m240.jpg",
])("drops unsafe product photos: %s", async (image) => {
  const html = page() + `<script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: "Logitech M240", image })}</script>`;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(html)));
  const [verified] = await verifyProductPages([{ ...candidate(), image: "https://www.jib.co.th/invented.jpg" }], new Set([url]));
  expect(verified.image).toBeUndefined();
});

it("does not borrow OG or unrelated product photos", async () => {
  const html = page() + `<meta property="og:image" content="https://www.jib.co.th/stock.jpg"><script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: "Logitech M241", image: "https://www.jib.co.th/wrong.jpg" })}</script>`;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(html)));
  const [verified] = await verifyProductPages([candidate()], new Set([url]));
  expect(verified.image).toBeUndefined();
});
