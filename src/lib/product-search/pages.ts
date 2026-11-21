import { z } from "zod";
import { isDetailUrl, matchesProductModel as matches, sourceUrl, type SearchCandidate } from "./domain";

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
const availabilitySchema = z.object({ availability: z.string() });
const offerSchema = z.object({
  price: z.union([z.string(), z.number()]),
  priceCurrency: z.string(),
  availability: z.string().optional(),
});
type Page =
  | { kind: "html"; html: string; url: string; sourceUrls: string[] }
  | { kind: "unavailable"; retryable?: true }
  | { kind: "invalid"; missingSource?: string };
export function createProductPageCache() {
  return { pages: new Map<string, Promise<Page>>(), unavailableDomains: new Set<string>() };
}
type ProductPageCache = ReturnType<typeof createProductPageCache>;
const visiblePriceRange =
  /(?:฿|THB)\s*[\d,]+(?:\.\d+)?\s*(?:[-–—−~]|ถึง|\bto\b)\s*(?:(?:฿|THB)\s*)?\d|[\d,]+(?:\.\d+)?\s*(?:[-–—−~]|ถึง|\bto\b)\s*(?:฿|THB)\s*\d/i;
const compatibilityText =
  /\b(?:case|cover|mount|charger|adapter|replacement|accessor(?:y|ies)|protector|sleeve|strap)\b.{0,40}\b(?:for|fits|compatible with)\b|(?:เคส|ฝาครอบ|ฟิล์ม|อะไหล่|อะแดปเตอร์|สายชาร์จ|สายรัด|อุปกรณ์เสริม|ซอง).{0,30}(?:สำหรับ|ใช้กับ|รองรับ)/iu;
const productMetadata = /<meta\b(?=[^>]*\bproperty\s*=\s*["']og:type["'])(?=[^>]*\bcontent\s*=\s*["']product["'])[^>]*>/i;
function safeUrl(raw: string) {
  const url = sourceUrl(raw);
  return url && !new URL(url).port ? url : null;
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
  const named: Record<string, string> = {
    quot: '"', amp: "&", nbsp: " ", lt: "<", gt: ">", apos: "'",
    bull: "•", middot: "·", ndash: "–", mdash: "—", hellip: "…",
    times: "×", plusmn: "±", reg: "®", trade: "™", copy: "©",
  };
  return text.replace(/&(#(?:x[\da-f]+|\d+)|[a-z]+);/gi, (match: string, code: string) => {
    if (!code.startsWith("#")) return named[code.toLowerCase()] ?? match;
    return entity(parseInt(code.replace(/^#x?/i, ""), /^#x/i.test(code) ? 16 : 10));
  });
}
function passage(text: string) {
  return decode(text).normalize("NFC").replace(/\s+/gu, " ").trim();
}
function textOnly(html: string) {
  return html.replace(/<\/?[a-z][\w-]*\b(?:[^"'<>]|"[^"]*"|'[^']*')*>|<![^>]*>/gi, " ");
}
function productHtml(html: string) {
  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|nav|footer|aside|template|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  const stack: { tag: string; skip: boolean }[] = [];
  const fragments: string[] = [];
  for (const match of stripped.matchAll(/<\/?([a-z][\w-]*)\b(?:[^"'<>]|"[^"]*"|'[^']*')*>|<![^>]*>|[^<]+/gi)) {
    if (match[0].startsWith("<!")) continue;
    const tag = match[1]?.toLowerCase();
    const parentSkipped = stack.at(-1)?.skip ?? false;
    if (!tag) {
      if (!parentSkipped) fragments.push(match[0]);
      continue;
    }
    if (match[0].startsWith("</")) {
      const index = stack.findLastIndex((entry) => entry.tag === tag);
      if (index >= 0) stack.length = index;
      if (!parentSkipped) fragments.push(match[0]);
      continue;
    }
    const attributes = new Map([...match[0].matchAll(/\s([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)].map((attribute) => [attribute[1].toLowerCase(), attribute[2] ?? attribute[3] ?? attribute[4] ?? ""]));
    const skip = parentSkipped ||
      attributes.has("hidden") || attributes.get("aria-hidden") === "true" ||
      /display\s*:\s*none|visibility\s*:\s*hidden/i.test(attributes.get("style") ?? "") ||
      /recommend|related|carousel|pcompare|product[-_ ]?compare|cross[-_]?sell|upsell/i.test(`${attributes.get("id")} ${attributes.get("class")}`);
    if (!skip) fragments.push(match[0]);
    if (!/^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/.test(tag) && !match[0].endsWith("/>")) stack.push({ tag, skip });
  }
  return fragments.join(" ");
}
function productContent(html: string) {
  const opening = html.match(/<main\b[^>]*>/i) ?? html.match(/<([a-z][\w-]*)\b[^>]*(?:id|class)=["'][^"']*(?:product[-_]?wrap(?:per)?|product[-_]detail[-_](?:container|content)|pdp[-_](?:main|content))[^"']*["'][^>]*>/i);
  if (!opening || opening.index === undefined) return html;
  const tag = opening[1] ?? "main";
  const start = opening.index + opening[0].length;
  let depth = 1;
  for (const match of html.slice(start).matchAll(new RegExp(`<(/?)${tag}\\b[^>]*>`, "gi"))) {
    depth += match[1] ? -1 : 1;
    if (!depth) return html.slice(start, start + (match.index ?? 0));
  }
  return html.slice(start);
}
function productText(html: string, includeSpecRows = false) {
  const clean = productHtml(html);
  const title = clean.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  const main = productContent(clean);
  const visible = passage(textOnly(`${title} ${main}`));
  if (!includeSpecRows) return visible;
  const rows = [...main.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].flatMap((row) => {
    const cells = [...row[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cell) => passage(textOnly(cell[1])));
    return cells.length > 1 ? [cells.join(" | ")] : [];
  });
  return [passage(textOnly(title)), ...rows, visible].join("\n");
}
function productImages(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(productImages);
  const image = z.object({ url: z.string() }).safeParse(value);
  return image.success ? [image.data.url] : [];
}
function structuredProducts(html: string) {
  return [
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
}
function inspect(html: string, model: string) {
  const products = structuredProducts(html);
  const same = products.filter((product) => {
    if (product.isAccessoryOrSparePartFor !== undefined || compatibilityText.test(product.name ?? ""))
      return false;
    const namedModel = typeof product.model === "string" ? product.model : product.model?.name;
    return matches([product.name, namedModel, product.sku].filter(Boolean).join(" "), model);
  });
  const title = decode(
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "",
  );
  if (
    (products.length && !same.length) ||
    (title && (!matches(title, model) || compatibilityText.test(title)))
  ) return null;
  const visible = productText(html);
  if (!same.length && !matches(title || visible, model)) return null;
  const offerObjects = same.flatMap((product) => objects(product.offers));
  const availability = offerObjects.flatMap((value) => {
    const parsed = availabilitySchema.safeParse(value);
    return parsed.success ? [parsed.data.availability] : [];
  });
  const offers = offerObjects.flatMap((value) => {
      const parsed = offerSchema.safeParse(value);
      return parsed.success ? [parsed.data] : [];
    });
  if (
    availability.some((value) =>
      /OutOfStock|SoldOut|Discontinued/i.test(value),
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
  if (!prices.length && !visiblePriceRange.test(visible) && (same.length || productMetadata.test(html))) {
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
    inStock: availability.some((value) =>
      /\/InStock$/i.test(value),
    ),
  };
}

function pageReader(
  sources: Set<string>,
  signal?: AbortSignal,
  context = createProductPageCache(),
) {
  signal?.throwIfAborted();
  const normalizedSources = new Set(
    [...sources].map(safeUrl).filter((url) => url !== null),
  );
  const cache = context.pages;
  const counts = new Map<string, number>();
  const deadline = Date.now() + 15_000;
  async function fetchPage(raw: string): Promise<Page> {
    const initial = safeUrl(raw);
    if (!initial || !normalizedSources.has(initial) || !isDetailUrl(initial, true))
      return { kind: "invalid" };
    const existing = cache.get(initial);
    if (existing) {
      const page = await existing;
      if (page.kind === "invalid" && page.missingSource && normalizedSources.has(page.missingSource)) {
        if (cache.get(initial) === existing) cache.delete(initial);
        return fetchPage(raw);
      }
      return page.kind === "html" && !page.sourceUrls.every((url) => normalizedSources.has(url))
        ? { kind: "invalid" }
        : page;
    }
    const request = async (): Promise<Page> => {
      const controller = new AbortController();
      const abort = () => controller.abort(signal?.reason);
      signal?.addEventListener("abort", abort, { once: true });
      const timer = setTimeout(() => controller.abort(), 5000);
      try {
        let current = initial;
        const sourceUrls = [initial];
        for (let hop = 0; hop < 4; hop++) {
          signal?.throwIfAborted();
          const host = new URL(current).hostname.replace(/^www\./, "");
          if (Date.now() >= deadline || (counts.get(host) ?? 0) >= 8)
            return { kind: "unavailable", retryable: true };
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
            if (next && !normalizedSources.has(next)) return { kind: "invalid", missingSource: next };
            if (
              !next ||
              !normalizedSources.has(next) ||
              new URL(next).hostname.replace(/^www\./, "") !== host ||
              !isDetailUrl(next, true)
            )
              return { kind: "invalid" };
            current = next;
            sourceUrls.push(next);
            continue;
          }
          if (response.status === 404 || response.status === 410) {
            await response.body?.cancel();
            return { kind: "invalid" };
          }
          if (!response.ok) {
            await response.body?.cancel();
            return response.status >= 500 ? { kind: "unavailable", retryable: true } : { kind: "unavailable" };
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
          return { kind: "html", html, url: current, sourceUrls };
        }
        return { kind: "invalid" };
      } catch {
        signal?.throwIfAborted();
        return { kind: "unavailable", retryable: true };
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener("abort", abort);
      }
    };
    const pending = request().then((page) => {
      if (page.kind === "invalid" && page.missingSource) cache.delete(initial);
      if (page.kind === "unavailable") {
        if (page.retryable) cache.delete(initial);
        else context.unavailableDomains.add(new URL(initial).hostname.replace(/^www\./, ""));
      }
      return page;
    });
    cache.set(initial, pending);
    return pending;
  }
  return fetchPage;
}

export async function readProductPages(sources: Set<string>, signal?: AbortSignal, context?: ProductPageCache) {
  const fetchPage = pageReader(sources, signal, context);
  const urls = [...sources].filter((raw) => {
    const url = safeUrl(raw);
    return url && isDetailUrl(url);
  }).slice(0, 20);
  const pages: { url: string; title: string; modelNames: string[]; text: string; offers: { modelName: string; baht: number; currency: string; availability?: string }[] }[] = [];
  await Promise.all(Array.from({ length: 3 }, async () => {
    for (;;) {
      const url = urls.shift();
      if (!url) break;
      const page = await fetchPage(url);
      if (page.kind !== "html" || !isDetailUrl(page.url)) continue;
      const title = passage(page.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
      const products = structuredProducts(page.html);
      const modelNames = products.flatMap((product) => product.name ? [product.name] : []);
      if (!modelNames.length && !/(?:^|\/)(?:p|products?|shop|item)(?:\/|$)/i.test(new URL(page.url).pathname)) continue;
      const offers = products.flatMap((product) => objects(product.offers).flatMap((value) => {
        const offer = offerSchema.safeParse(value);
        if (!offer.success || !product.name) return [];
        const baht = Number(String(offer.data.price).replace(/,/g, ""));
        return Number.isFinite(baht) && baht > 0 && offer.data.priceCurrency.toUpperCase() === "THB"
          ? [{ modelName: product.name, baht, currency: "THB", availability: offer.data.availability }]
          : [];
      }));
      const text = productText(page.html, true);
      if (title && text) pages.push({ url, title, modelNames, offers, text: text.slice(0, 6_000) });
    }
  }));
  return pages;
}

export async function verifyProductPages(
  candidates: SearchCandidate[],
  sources: Set<string>,
  signal?: AbortSignal,
  context?: ProductPageCache,
): Promise<SearchCandidate[]> {
  signal?.throwIfAborted();
  const normalizedSources = new Set([...sources].map(safeUrl).filter((url) => url !== null));
  const fetchPage = pageReader(sources, signal, context);
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
    if (!primaryUrl || !isDetailUrl(primaryUrl)) return null;
    const primary = await fetchPage(primaryUrl);
    if (primary.kind === "invalid") return null;
    let url = primaryUrl;
    let proof = null;
    if (primary.kind === "html") {
      if (!isDetailUrl(primary.url)) return null;
      proof = inspect(primary.html, candidate.model);
      if (!proof) return null;
      url = primary.url;
    }
    const offerUrl = !proof?.price && candidate.price && safeUrl(candidate.price.url);
    if (offerUrl && offerUrl !== primaryUrl && offerUrl !== url && isDetailUrl(offerUrl)) {
      const offer = await fetchPage(offerUrl);
      if (offer.kind === "html" && isDetailUrl(offer.url)) {
        const offerProof = inspect(offer.html, candidate.model);
        if (offerProof?.price) {
          proof = offerProof;
          url = offer.url;
        }
      }
    }
    if (!proof) return null;
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
        evidence.push({ ...item, url: evidencePage.url, pageModel: candidate.model });
    }
    return {
      ...candidate,
      url,
      image: proof.image,
      evidence,
      pageModel: candidate.model,
      price: proof.price === null
        ? null
        : { baht: proof.price, currency: "THB", pageModel: candidate.model, url },
      stock: {
        status: proof.inStock ? "in_stock" : "unknown",
        url,
        pageModel: candidate.model,
      },
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
