import { describe, expect, it } from "vitest";
import { liveResult } from "./live-result";

describe("liveResult", () => {
  it("keeps source facts and unknowns without inventing fit scores", () => {
    const result = liveResult("นาฬิกา", {
      kind: "web",
      picks: [
        {
          model: "Watch A",
          url: "https://example.com/watch",
          price: {
            baht: 2500,
            url: "https://example.com/offer",
            observedAt: "2026-11-21T03:00:00Z",
          },
          reasons: [{ text: "แบตเตอรี่ 7 วัน", url: "https://example.com/spec" }],
          unknowns: ["ยังไม่ยืนยัน GPS"],
        },
      ],
      note: "ข้อมูลจากเว็บ",
      searchCalls: 1,
      searchRounds: 1,
    });
    const item = result.items[0];
    expect(item.product).toMatchObject({
      name: "Watch A",
      price: 2500,
      storeUrl: "https://example.com/watch",
    });
    expect(item.product.image).toBeUndefined();
    expect(item.rank).toBe(1);
    expect(item.verdict).toBe("unknown");
    expect(item.reason).toBe("แบตเตอรี่ 7 วัน");
    expect(result.headline).toBe("แนะนำ Watch A");
    expect(result.reason).toContain("พบ 1 รุ่นสำหรับ “นาฬิกา”");
    expect(item.sourceDetails?.capacityText).toBe("แบตเตอรี่ 7 วัน");
    expect(item.limitation).toBe("ยังไม่ยืนยัน GPS");
    expect(item.evidence).toContainEqual({
      category: "ข้อมูล",
      summary: "แบตเตอรี่ 7 วัน",
      url: "https://example.com/spec",
      label: "ดูแหล่งข้อมูล",
    });
    expect(item.sourceDetails?.priceSource).toContain("2569");
    expect(item.sourceDetails?.priceSource).toContain("10:00");
  });
  it("supports no picks and labels catalog data as a rule demo", () => {
    const result = liveResult("เครื่องปั่น", {
      kind: "demo",
      picks: [],
      note: "ข้อมูลสังเคราะห์",
    });
    expect(result.items).toEqual([]);
    expect(result.headline).toBe("ยังไม่มีรุ่นที่ยืนยันได้");
    expect(result.reason).toContain("โหมดกฎ");
    expect(result.reason).toContain("ข้อมูลสังเคราะห์");
  });
  it("leaves an unverified price empty", () => {
    const result = liveResult("Watch", {
      kind: "web",
      picks: [
        {
          model: "Watch",
          url: "https://example.com/watch",
          price: null,
          reasons: [],
          unknowns: [],
        },
      ],
      note: "",
      searchCalls: 1,
      searchRounds: 1,
    });
    expect(result.items[0].product.price).toBeNull();
    expect(result.items[0].evidence).toEqual([]);
    expect(result.items[0].sourceDetails?.priceSource).toBe("ยังไม่ยืนยันราคา");
  });
});

it("displays a verified product photo and identifies its source", () => {
  const image = "https://www.jib.co.th/images/watch.jpg";
  const result = liveResult("Watch", {
    kind: "web",
    picks: [{ model: "Watch", url: "https://www.jib.co.th/product/watch", image, price: null, reasons: [], unknowns: [] }],
    note: "", searchCalls: 1, searchRounds: 1,
  });
  expect(result.items[0].product.image).toBe(image);
  expect(result.items[0].sourceDetails?.photo).toBe("ภาพตรงรุ่นจากหน้าสินค้าที่ตรวจสอบแล้ว");
});
