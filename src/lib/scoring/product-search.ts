import type { ProductPick } from "../product-search/contract";
import {
  sourceUrl,
  matchesProductModel,
  type SearchCandidate,
  type SearchGoal,
} from "../product-search/domain";

function identity(name: string) {
  return name
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]/gu, "");
}

function modelKey(offer: SearchCandidate) {
  const name = offer.model.trim();
  const family = offer.modelFamily?.trim();
  const brand = name.split(/\s+/)[0];
  if (
    family &&
    identity(family).startsWith(identity(brand)) &&
    family.length > brand.length &&
    identity(name).includes(identity(family))
  )
    return identity(family);
  return identity(
    name.replace(
      /(?:\s+|-)(?:black|white|blue|red|silver|grey|gray|pink|green|graphite|rose|lavender|sand|สีดำ|สีขาว|สีแดง|สีน้ำเงิน|สีชมพู|สีเขียว)$/i,
      "",
    ),
  );
}

function isProductPage(raw: string): boolean {
  const url = new URL(raw);
  return (
    url.pathname.length > 1 &&
    !/(?:^|\/)(?:search|searchresult|category|categories|manuals?|support)(?:\/|$)/i.test(
      url.pathname,
    ) &&
    !url.searchParams.has("search") &&
    !url.searchParams.has("q")
  );
}

export function rankProducts(
  candidates: SearchCandidate[],
  goal: SearchGoal,
  sources: Set<string>,
  observedAt: string,
  titles = new Map<string, string>(),
): ProductPick[] {
  const sourced = (raw: string) => sources.has(sourceUrl(raw) ?? "");
  const models = new Map<string, SearchCandidate[]>();
  for (const offer of candidates) {
    const key = identity(offer.model);
    const url = sourceUrl(offer.url);
    if (
      !key ||
      !url ||
      !sourced(url) ||
      !isProductPage(url) ||
      offer.pageKind !== "product"
    )
      continue;
    if (
      identity(offer.category) !== identity(goal.category) ||
      identity(offer.pageModel) !== key
    )
      continue;
    const title = titles.get(url);
    if (title && !matchesProductModel(title, offer.model)) continue;
    const group = models.get(key) ?? [];
    group.push(offer);
    models.set(key, group);
  }

  const ranked: { pick: ProductPick; preferences: number; family: string }[] =
    [];
  for (const [key, offers] of models) {
    const evidence = offers
      .flatMap((offer) => offer.evidence)
      .filter(
        (item) =>
          sourced(item.url) &&
          identity(item.pageModel) === key &&
          item.text.trim(),
      );
    const supports = (requirement: string) =>
      evidence.some(
        (item) => item.requirement === requirement && item.stance === "yes",
      );
    const contradicts = (requirement: string) =>
      evidence.some(
        (item) => item.requirement === requirement && item.stance === "no",
      );
    if (
      goal.must.some(
        (requirement) => !supports(requirement) || contradicts(requirement),
      )
    )
      continue;
    const met = goal.nice.filter(
      (requirement) => supports(requirement) && !contradicts(requirement),
    );
    const relevant = new Set([goal.category, ...goal.must, ...met]);
    const reasons = new Map(
      evidence
        .filter(
          (item) => relevant.has(item.requirement) && item.stance === "yes",
        )
        .map((item) => [item.requirement, { text: item.text, url: item.url }]),
    );

    for (const offer of offers) {
      const stock =
        sourced(offer.stock.url) && identity(offer.stock.pageModel) === key
          ? offer.stock.status
          : "unknown";
      if (stock === "out_of_stock") continue;
      const amount = offer.price;
      const price =
        amount &&
        amount.currency === "THB" &&
        amount.baht > 0 &&
        Number.isFinite(amount.baht) &&
        sourced(amount.url) &&
        identity(amount.pageModel) === key
          ? { baht: amount.baht, url: amount.url, observedAt }
          : null;
      if (goal.budget !== null && (!price || price.baht > goal.budget))
        continue;
      const unknowns = goal.nice
        .filter((need) => !met.includes(need))
        .map((need) =>
          contradicts(need)
            ? `ไม่ตรงความต้องการ · ${need}`
            : `ข้อมูลไม่พอ · ${need}`,
        );
      if (stock === "unknown") unknowns.push("ร้านยังไม่ยืนยันว่ามีสินค้าพร้อมขาย");
      ranked.push({
        preferences: met.length,
        family: modelKey(offer),
        pick: {
          model: offer.model,
          ...(offer.image && sourceUrl(offer.image) ? { image: offer.image } : {}),
          url: offer.url,
          price,
          unknowns,
          reasons: reasons.size
            ? [...reasons.values()]
            : [
                {
                  text: `หน้าสินค้ายืนยันว่าเป็น${goal.category} รุ่น ${offer.model}`,
                  url: offer.url,
                },
              ],
        },
      });
    }
  }
  ranked.sort(
    (a, b) =>
      b.preferences - a.preferences ||
      (a.pick.price?.baht ?? Infinity) - (b.pick.price?.baht ?? Infinity) ||
      a.pick.model.localeCompare(b.pick.model) ||
      a.pick.url.localeCompare(b.pick.url),
  );
  const seenModels = new Set<string>();
  const seenPages = new Set<string>();
  const picks: ProductPick[] = [];
  for (const { pick, family } of ranked) {
    const page = sourceUrl(pick.url) ?? pick.url;
    if (seenModels.has(family) || seenPages.has(page)) continue;
    seenModels.add(family);
    seenPages.add(page);
    picks.push(pick);
    if (picks.length === 3) break;
  }
  return picks;
}
