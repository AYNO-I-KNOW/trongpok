import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyProductPages } from "./pages";
import type { SearchCandidate } from "./domain";
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
