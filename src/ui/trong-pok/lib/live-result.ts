import type { ProductSearchResult } from "@/lib/product-search/contract";
import type { ResearchResult } from "./types";

export function liveResult(
  query: string,
  response: Extract<ProductSearchResult, { kind: "web" | "demo" }>,
): ResearchResult {
  const demo = response.kind === "demo";
  const observed = (value: string) =>
    new Intl.DateTimeFormat("th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Bangkok",
    }).format(new Date(value));
  return {
    plan: {
      raw: query,
      target: null,
      supported: true,
      ice: false,
      conditions: {
        cubes: null,
        container: "unknown",
        pulse: null,
        budget: null,
      },
      needsContext: false,
    },
    mock: false,
    searchKind: response.kind,
    headline: response.picks[0]
      ? "แนะนำ " + response.picks[0].model
      : "ยังไม่มีรุ่นที่ยืนยันได้",
    reason: [
      demo ? "โหมดกฎ · ข้อมูลเดโม" : "ค้นจากเว็บ",
      `พบ ${response.picks.length} รุ่นสำหรับ “${query}”`,
      response.note,
    ]
      .filter(Boolean)
      .join(" · "),
    items: response.picks.map((pick, index) => ({
      product: {
        id: `search-${index}`,
        name: pick.model,
        ...(pick.image ? { image: pick.image } : {}),
        option: "",
        price: pick.price?.baht ?? null,
        priceText: "ยังไม่ยืนยันราคา",
        store: demo ? "แคตตาล็อกเดโม" : "หน้าสินค้า",
        storeUrl: pick.url,
      },
      verdict: "unknown",
      rank: index + 1,
      reason:
        pick.reasons.map((reason) => reason.text).join(" · ") ||
        "ยังไม่มีเหตุผลที่มีแหล่งอ้างอิง",
      limitation:
        pick.unknowns.join(" · ") || "ยังไม่ยืนยันความเหมาะสมกับการใช้งานจริง",
      evidence: [
        ...pick.reasons.map((reason) => ({
          category: "ข้อมูล" as const,
          summary: reason.text,
          url: reason.url,
          label: "ดูแหล่งข้อมูล",
        })),
        ...(pick.price
          ? [
              {
                category: "ร้าน" as const,
                summary: `${demo ? "ราคาในชุดเดโม" : "ราคาที่ตรวจพบ"} ฿${pick.price.baht.toLocaleString("th-TH")} · ${observed(pick.price.observedAt)}`,
                url: pick.price.url,
                label: "ดูที่มาของราคา",
              },
            ]
          : []),
      ],
      sourceDetails: {
        fitFor: "ยังไม่ยืนยัน",
        valueAdded: "ยังไม่มีข้อมูลเปรียบเทียบ",
        capacityText:
          pick.reasons.map((reason) => reason.text).join(" · ") ||
          "ยังไม่มีข้อมูลจำเพาะที่ยืนยันได้",
        method: "ยังไม่ยืนยันวิธีใช้",
        conditions: "ตรวจเงื่อนไขจากแหล่งข้อมูล",
        photo: pick.image
          ? "ภาพตรงรุ่นจากหน้าสินค้าที่ตรวจสอบแล้ว"
          : "ยังไม่มีภาพตรงรุ่นที่ยืนยันได้",
        clip: "ยังไม่มีวิดีโอที่ยืนยันได้",
        returns: "ยังไม่ยืนยันเงื่อนไขคืนสินค้า",
        warranty: "ยังไม่ยืนยันประกัน",
        priceSource: pick.price
          ? `${demo ? "ราคาในชุดเดโม" : "ตรวจราคาเมื่อ"} ${observed(pick.price.observedAt)}`
          : "ยังไม่ยืนยันราคา",
      },
    })),
  };
}
