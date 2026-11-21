import { z } from "zod";
import { sourceUrl, type SearchCandidate } from "./domain";

const productSchema = z
  .object({
    "@type": z.union([z.string(), z.array(z.string())]).optional(),
    name: z.string().optional(),
    model: z.union([z.string(), z.object({ name: z.string() })]).optional(),
    sku: z.string().optional(),
    offers: z.unknown().optional(),
    image: z.unknown().optional(),
  })
  .passthrough();
const offerSchema = z.object({
  price: z.union([z.string(), z.number()]),
  priceCurrency: z.string(),
  availability: z.string().optional(),
});
type Page =
  | { kind: "html"; html: string; url: string }
  | { kind: "unavailable" }
  | { kind: "invalid" };
const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim();
function matches(text: string, model: string) {
  const tokens = normalize(model).split(" ");
  const haystack = ` ${normalize(text)} `;
  return (
    tokens.every((token) => haystack.includes(` ${token} `)) &&
    !tokens.some(
      (token) =>
        /\d/.test(token) &&
        new RegExp(` ${token} (pro|plus|max|ultra|lite|mini|se) `).test(
          haystack,
        ) &&
        !tokens.includes(
          haystack.match(
            new RegExp(` ${token} (pro|plus|max|ultra|lite|mini|se) `),
          )?.[1] ?? "",
        ),
    )
  );
}
function safeUrl(raw: string) {
  const url = sourceUrl(raw);
  return url && !new URL(url).port ? url : null;
}
function detail(raw: string, spec = false) {
  const path = new URL(raw).pathname;
  return (
    path !== "/" &&
    !/(?:^|\/)(?:search|category|categories|collections)(?:\/|$)/i.test(path) &&
    (spec || !/(?:^|\/)(?:manual|support)(?:\/|$)/i.test(path))
  );
}
function objects(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(objects);
  if (value && typeof value === "object")
    return [value, ...Object.values(value).flatMap(objects)];
  return [];
}
function entity(code: number) {
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
}
function decode(text: string) {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&#(?:x([\da-f]+)|(\d+));/gi, (_, hex: string, decimal: string) =>
      entity(parseInt(hex || decimal, hex ? 16 : 10)),
    );
}
function passage(text: string) {
  return decode(text).normalize("NFC").replace(/\s+/gu, " ").trim();
}
function productText(html: string, includeSpecRows = false) {
  const clean = html
    .replace(/<(script|style|nav|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(
      /<([a-z][\w-]*)\b[^>]*(?:id|class)=["'][^"']*(?:recommend|related|carousel)[^"']*["'][^>]*>[\s\S]*?<\/\1>/gi,
      " ",
    );
  const title = clean.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const main = clean.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? clean;
  const visible = passage(`${title} ${main}`.replace(/<[^>]*>/g, " "));
  if (!includeSpecRows) return visible;
  const rows = [...main.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((row) =>
    [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
      .map((cell) => passage(cell[1].replace(/<[^>]*>/g, " ")))
      .join(" | "),
  );
  return [visible, ...rows].join("\n");
}
function productImages(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(productImages);
  const image = z.object({ url: z.string() }).safeParse(value);
  return image.success ? [image.data.url] : [];
}
function inspect(html: string, model: string) {
  const products = [
    ...html.matchAll(
      /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ]
    .flatMap((match) => {
      try {
        return objects(JSON.parse(match[1]));
      } catch {
        return [];
      }
    })
    .flatMap((value) => {
      const parsed = productSchema.safeParse(value);
      if (!parsed.success) return [];
      const type = parsed.data["@type"];
      return (Array.isArray(type) ? type : [type]).includes("Product")
        ? [parsed.data]
        : [];
    });
  const same = products.filter((product) =>
    matches(
      [
        product.name,
        typeof product.model === "string" ? product.model : product.model?.name,
        product.sku,
      ]
        .filter(Boolean)
        .join(" "),
      model,
    ),
  );
  const title = decode(
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "",
  );
  if ((products.length && !same.length) || (title && !matches(title, model)))
    return null;
  const visible = productText(html);
  if (!same.length && !matches(title || visible, model)) return null;
  const offers = same
    .flatMap((product) => objects(product.offers))
    .flatMap((value) => {
      const parsed = offerSchema.safeParse(value);
      return parsed.success ? [parsed.data] : [];
    });
  if (
    offers.some((offer) =>
      /OutOfStock|SoldOut|Discontinued/i.test(offer.availability ?? ""),
    )
  )
    return null;
  if (
    /สินค้าหมด(?:ชั่วคราว)?|สินค้าหมดสต็อก|หมดสต๊อก|สินค้าขาดจำหน่าย|out of stock|sold out/i.test(
      visible,
    )
  )
    return null;
  const prices = [
    ...new Set(
      offers
        .filter((offer) => offer.priceCurrency.toUpperCase() === "THB")
        .map((offer) => Number(String(offer.price).replace(/,/g, "")))
        .filter((price) => Number.isFinite(price) && price > 0),
    ),
  ];
  if (!prices.length) {
    const metadata = [...html.matchAll(/<meta\b[^>]*>/gi)].map(
      (match) => match[0],
    );
    const price = metadata
      .find((tag) =>
        /(?:property|name)=["'](?:product:price:amount|og:price:amount)["']/i.test(
          tag,
        ),
      )
      ?.match(/content=["']([\d,.]+)["']/i)?.[1];
    const currency = metadata.some(
      (tag) =>
        /(?:product:price:currency|og:price:currency)/i.test(tag) &&
        /content=["']THB["']/i.test(tag),
    );
    if (
      price &&
      currency &&
      Number.isFinite(Number(price.replace(/,/g, ""))) &&
      Number(price.replace(/,/g, "")) > 0
    )
      prices.push(Number(price.replace(/,/g, "")));
    else {
      const amounts = [
        ...visible.matchAll(/(?:฿|THB)\s*([\d,]+(?:\.\d{2})?)/gi),
      ]
        .filter(
          (match) =>
            !/ผ่อน|เดือน|installment|month|คูปอง|ส่วนลด|ค่าจัดส่ง|ส่งฟรี|coupon|shipping|cashback|สมาชิกรับ/i.test(
              visible.slice(
                Math.max(0, match.index - 50),
                match.index + match[0].length + 50,
              ),
            ),
        )
        .map((match) => Number(match[1].replace(/,/g, "")));
      if (new Set(amounts).size === 1 && amounts[0] > 0)
        prices.push(amounts[0]);
    }
  }
  return {
    image: same.flatMap((product) => productImages(product.image)).map(safeUrl).find((url) => url !== null),
    price: prices.length === 1 ? prices[0] : null,
    inStock: offers.some((offer) =>
      /\/InStock$/i.test(offer.availability ?? ""),
    ),
  };
}

export async function verifyProductPages(
  candidates: SearchCandidate[],
  sources: Set<string>,
  signal?: AbortSignal,
): Promise<SearchCandidate[]> {
  signal?.throwIfAborted();
  const normalizedSources = new Set(
    [...sources].map(safeUrl).filter((url) => url !== null),
  );
  const cache = new Map<string, Promise<Page>>();
  const counts = new Map<string, number>();
  const deadline = Date.now() + 15_000;
  async function fetchPage(raw: string): Promise<Page> {
    const initial = safeUrl(raw);
    if (!initial || !normalizedSources.has(initial) || !detail(initial, true))
      return { kind: "invalid" };
    const existing = cache.get(initial);
    if (existing) return existing;
    const request = async (): Promise<Page> => {
      const controller = new AbortController();
      const abort = () => controller.abort(signal?.reason);
      signal?.addEventListener("abort", abort, { once: true });
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        let current = initial;
        for (let hop = 0; hop < 4; hop++) {
          signal?.throwIfAborted();
          const host = new URL(current).hostname.replace(/^www\./, "");
          if (Date.now() >= deadline || (counts.get(host) ?? 0) >= 8)
            return { kind: "unavailable" };
          counts.set(host, (counts.get(host) ?? 0) + 1);
          const response = await fetch(current, {
            redirect: "manual",
            signal: controller.signal,
            headers: { Accept: "text/html" },
          });
          if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get("location");
            const next = location && safeUrl(new URL(location, current).href);
            await response.body?.cancel();
            if (
              !next ||
              !normalizedSources.has(next) ||
              new URL(next).hostname.replace(/^www\./, "") !== host ||
              !detail(next, true)
            )
              return { kind: "invalid" };
            current = next;
            continue;
          }
          if (response.status === 404 || response.status === 410) {
            await response.body?.cancel();
            return { kind: "invalid" };
          }
          if (!response.ok) {
            await response.body?.cancel();
            return { kind: "unavailable" };
          }
          if (
            /pdf|image\/|octet-stream/i.test(
              response.headers.get("content-type") ?? "",
            )
          ) {
            await response.body?.cancel();
            return { kind: "unavailable" };
          }
          const reader = response.body?.getReader();
          if (!reader) return { kind: "unavailable" };
          const decoder = new TextDecoder();
          let html = "";
          let bytes = 0;
          for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            bytes += chunk.value.byteLength;
            if (bytes > 1_000_000) {
              await reader.cancel();
              return { kind: "unavailable" };
            }
            html += decoder.decode(chunk.value, { stream: true });
          }
          if (!/<(?:!doctype\s+html|html|title|h1|main)\b/i.test(html))
            return { kind: "unavailable" };
          return { kind: "html", html, url: current };
        }
        return { kind: "invalid" };
      } catch {
        signal?.throwIfAborted();
        return { kind: "unavailable" };
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
      }
    };
    const pending = request();
    cache.set(initial, pending);
    return pending;
  }
  async function verify(
    candidate: SearchCandidate,
  ): Promise<SearchCandidate | null> {
    if (
      candidate.stock.status === "out_of_stock" &&
      normalizedSources.has(safeUrl(candidate.stock.url) ?? "") &&
      matches(candidate.stock.pageModel, candidate.model)
    )
      return null;
    const primaryUrl = safeUrl(candidate.url);
    if (!primaryUrl || !detail(primaryUrl)) return null;
    const primary = await fetchPage(candidate.url);
    if (primary.kind === "invalid") return null;
    const proof =
      primary.kind === "html" ? inspect(primary.html, candidate.model) : null;
    const directEvidence =
      matches(decode(new URL(candidate.url).pathname), candidate.model) &&
      candidate.evidence.some(
        (item) =>
          item.url === candidate.url && matches(item.text, candidate.model),
      );
    if (!proof && (primary.kind === "html" || !directEvidence)) return null;
    let price = null;
    if (candidate.price) {
      const page = await fetchPage(candidate.price.url);
      const priceProof =
        page.kind === "html" ? inspect(page.html, candidate.model) : null;
      if (priceProof?.price)
        price = {
          ...candidate.price,
          baht: priceProof.price,
          currency: "THB",
          pageModel: candidate.model,
        };
    }
    if (proof?.price)
      price = {
        baht: proof.price,
        currency: "THB",
        pageModel: candidate.model,
        url: candidate.url,
      };
    const evidence = [];
    for (const item of candidate.evidence) {
      const evidencePage = await fetchPage(item.url);
      const excerpt = passage(item.excerpt).replace(/\s*\|\s*/g, " | ");
      if (
        excerpt.length >= 3 &&
        evidencePage.kind === "html" &&
        inspect(evidencePage.html, candidate.model) &&
        productText(evidencePage.html, true).includes(excerpt)
      )
        evidence.push(item);
    }
    return {
      ...candidate,
      image: proof?.image,
      evidence,
      pageModel: candidate.model,
      price,
      stock: proof?.inStock
        ? { status: "in_stock", url: candidate.url, pageModel: candidate.model }
        : { status: "unknown", url: candidate.url, pageModel: candidate.model },
    };
  }
  const verified = new Map<number, SearchCandidate>();
  const pending = candidates
    .slice(0, 24)
    .map((candidate, index) => ({ candidate, index }));
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      for (;;) {
        const entry = pending.shift();
        if (!entry) break;
        const result = await verify(entry.candidate);
        if (result) verified.set(entry.index, result);
      }
    }),
  );
  return [...verified]
    .sort(([left], [right]) => left - right)
    .map(([, candidate]) => candidate);
}
