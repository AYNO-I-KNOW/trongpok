import { describe, expect, it } from "vitest";
import { liveResult } from "./live-result";

describe("liveResult", () => {
  it("keeps source facts, fit, and caveats for a near match", () => {
    const result = liveResult("นาฬิกา", {
      kind: "web",
      picks: [
        {
          model: "Watch A",
          url: "https://www.jib.co.th/product/watch",
          price: {
            baht: 2500,
            url: "https://www.jib.co.th/product/watch",
            observedAt: "2026-11-21T03:00:00Z",
          },
          reasons: [{ text: "แบตเตอรี่ 7 วัน", url: "https://www.jib.co.th/product/watch" }],
          unknowns: ["ข้อมูลไม่พอ · GPS"],
          fit: { percent: 67, meetsRequired: false },
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
      storeUrl: "https://www.jib.co.th/product/watch",
    });
    expect(item.product.image).toBeUndefined();
    expect(item.rank).toBe(1);
    expect(item.verdict).toBe("unknown");
    expect(item.fit).toEqual({ percent: 67, meetsRequired: false });
    expect(item.reason).toBe("แบตเตอรี่ 7 วัน");
    expect(result.headline).toMatch(/^ตัวเลือกใกล้เคียง/);
    expect(result.reason).toContain("พบ 1 รุ่นสำหรับ “นาฬิกา”");
    expect(item.sourceDetails?.capacityText).toBe("แบตเตอรี่ 7 วัน");
    expect(item.limitation).toBe("ข้อมูลไม่พอ · GPS");
    expect(item.evidence).toContainEqual({
      category: "ข้อมูล",
      summary: "แบตเตอรี่ 7 วัน",
      url: "https://www.jib.co.th/product/watch",
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
});

it("displays a verified product photo and identifies its source", () => {
  const image = "https://www.jib.co.th/images/watch.jpg";
  const result = liveResult("Watch", {
    kind: "web",
    picks: [{
      model: "Watch",
      url: "https://www.jib.co.th/product/watch",
      image,
      price: {
        baht: 2500,
        url: "https://www.jib.co.th/product/watch",
        observedAt: "2026-11-21T03:00:00Z",
      },
      reasons: [],
      unknowns: [],
    }],
    note: "", searchCalls: 1, searchRounds: 1,
  });
  expect(result.items[0].product.image).toBe(image);
  expect(result.items[0].sourceDetails?.photo).toBe("ภาพตรงรุ่นจากหน้าสินค้าที่ตรวจสอบแล้ว");
});
