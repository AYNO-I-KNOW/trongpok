import type { WebProductPick } from "../product-search/contract";
import {
  isDetailUrl,
  sourceUrl,
  matchesProductModel,
  type SearchCandidate,
  type SearchGoal,
} from "../product-search/domain";

type RankedProduct = WebProductPick & { fit: NonNullable<WebProductPick["fit"]> };

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

export function rankProducts(
  candidates: SearchCandidate[],
  goal: SearchGoal,
  sources: Set<string>,
  observedAt: string,
  titles = new Map<string, string>(),
): RankedProduct[] {
  const checks = new Map<string, "must" | "nice">();
  for (const need of goal.must) checks.set(need, "must");
  for (const need of goal.nice) if (!checks.has(need)) checks.set(need, "nice");
  const budgetPoints = goal.budget === null ? 0 : 2;
  let totalPoints = budgetPoints;
  for (const kind of checks.values()) totalPoints += kind === "must" ? 2 : 1;

  const models = new Map<string, SearchCandidate[]>();
  for (const offer of candidates) {
    const key = identity(offer.model);
    const url = sourceUrl(offer.url);
    if (
      !key ||
      !url ||
      !sources.has(url) ||
      !isDetailUrl(url) ||
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
    group.push(url === offer.url ? offer : { ...offer, url });
    models.set(key, group);
  }

  const ranked: { pick: RankedProduct; points: number; family: string }[] = [];
  for (const [key, offers] of models) {
    const positiveEvidence: SearchCandidate["evidence"] = [];
    const stances = new Map<string, "yes" | "no">();
    for (const offer of offers) {
      for (const item of offer.evidence) {
        if (
          item.stance === "unknown" ||
          (item.requirement !== goal.category && !checks.has(item.requirement)) ||
          !item.text.trim() ||
          identity(item.pageModel) !== key ||
          !sources.has(sourceUrl(item.url) ?? "")
        ) continue;
        const previous = stances.get(item.requirement);
        if (item.stance === "no") {
          stances.set(item.requirement, "no");
        } else if (previous !== "no") {
          if (!previous) stances.set(item.requirement, "yes");
          positiveEvidence.push(item);
        }
      }
    }
    const caveats: string[] = [];
    let featurePoints = 0;
    let meetsMust = true;
    for (const [need, kind] of checks) {
      const stance = stances.get(need);
      if (stance === "yes") {
        featurePoints += kind === "must" ? 2 : 1;
      } else {
        if (kind === "must") meetsMust = false;
        caveats.push(`${stance === "no" ? "ไม่ตรงความต้องการ" : "ข้อมูลไม่พอ"} · ${need}`);
      }
    }

    for (const offer of offers) {
      const stock =
        sources.has(sourceUrl(offer.stock.url) ?? "") && identity(offer.stock.pageModel) === key
          ? offer.stock.status
          : "unknown";
      if (stock === "out_of_stock") continue;
      const { price: amount, url } = offer;
      if (
        !amount ||
        amount.currency !== "THB" ||
        !Number.isFinite(amount.baht) ||
        amount.baht <= 0 ||
        sourceUrl(amount.url) !== url ||
        identity(amount.pageModel) !== key
      )
        continue;
      const excess = goal.budget === null ? 0 : amount.baht - goal.budget;
      const withinBudget = excess <= 0;
      const points = featurePoints + (withinBudget ? budgetPoints : 0);
      const fit = {
        percent: totalPoints ? Math.round((points * 100) / totalPoints) : 100,
        meetsRequired: meetsMust && withinBudget,
      };
      const unknowns = [...caveats];
      if (!withinBudget) unknowns.push(`เกินงบ ${excess.toLocaleString("th-TH")} บาท`);
      if (stock === "unknown") unknowns.push("ร้านยังไม่ยืนยันว่ามีสินค้าพร้อมขาย");
      const reasons = new Map<string, { text: string; url: string }>();
      for (const item of positiveEvidence) {
        if (stances.get(item.requirement) === "no") continue;
        if (!reasons.has(item.requirement) || sourceUrl(item.url) === url)
          reasons.set(item.requirement, { text: item.text, url: item.url });
      }
      ranked.push({
        points,
        family: modelKey(offer),
        pick: {
          model: offer.model,
          ...(offer.image && sourceUrl(offer.image) ? { image: offer.image } : {}),
          url,
          price: { baht: amount.baht, url, observedAt },
          fit,
          unknowns,
          reasons: reasons.size
            ? [...reasons.values()]
            : [
                {
                  text: `หน้าสินค้ายืนยันว่าเป็น${goal.category} รุ่น ${offer.model}`,
                  url,
                },
              ],
        },
      });
    }
  }
  ranked.sort(
    (a, b) =>
      Number(b.pick.fit.meetsRequired) - Number(a.pick.fit.meetsRequired) ||
      b.points - a.points ||
      a.pick.price.baht - b.pick.price.baht ||
      a.pick.model.localeCompare(b.pick.model) ||
      a.pick.url.localeCompare(b.pick.url),
  );
  const seenModels = new Set<string>();
  const seenPages = new Set<string>();
  const picks: RankedProduct[] = [];
  for (const { pick, family } of ranked) {
    if (seenModels.has(family) || seenPages.has(pick.url)) continue;
    seenModels.add(family);
    seenPages.add(pick.url);
    picks.push(pick);
    if (picks.length === 3) break;
  }
  return picks;
}
