import { expect, it } from "vitest";
import { budgetFromQuery } from "./budget";
import { productSearchResultSchema } from "./contract";
import { demoFallback } from "./demo";

it.each([
  ["เมาส์ DPI 1200 งบไม่เกิน ๘๕๐ บาท", 850],
  ["กาต้มน้ำ งบ 1,000 ถึง 2,500 บาท", 2500],
  ["เครื่องปั่น 1200W ไม่เกิน ฿899", 899],
  ["งบ 2.5 พันบาท", 2500],
  ["budget 500 USD", null],
  ["kettle up to 2 liters", null],
  ["ไม่เกิน 500 กรัม", null],
  ["ขั้นต่ำ 500 บาท", null],
] as const)("parses a baht budget in %s", (query, expected) => {
  expect(budgetFromQuery(query)).toBe(expected);
});

it.each(["เครื่องปั่น", "BLENDER", "สมาร์ทวอทช์"])(
  "asks about intended use before recommending demo products for %s",
  async (query) => {
    expect(await demoFallback(query)).toEqual({
      kind: "clarify",
      question: expect.stringContaining("ใช้"),
    });
  },
);

it("offers only affordable synthetic products and points to their own records", async () => {
  const result = productSearchResultSchema.parse(
    await demoFallback("เครื่องปั่น งบ 999 บาท"),
  );
  expect(result.kind).toBe("demo");
  if (result.kind !== "demo") return;
  expect(result.picks.length).toBeGreaterThan(0);
  expect(
    result.picks.every(
      (pick) =>
        pick.price && pick.price.baht <= 999 && pick.price.url === pick.url,
    ),
  ).toBe(true);
  expect(
    result.picks.every((pick) =>
      pick.url.startsWith("/api/demo-products/blender-"),
    ),
  ).toBe(true);
});

it("keeps an uncatalogued category out of the synthetic results", async () => {
  expect(await demoFallback("เมาส์ไร้สาย")).toMatchObject({
    kind: "unavailable",
  });
});

it("does not substitute a weaker catalog specification for the buyer's measurement", async () => {
  const result = await demoFallback("เครื่องปั่น โถอย่างน้อย 2 ลิตร งบ 3000 บาท");
  expect(result).toMatchObject({
    kind: "demo",
    picks: [],
    note: expect.stringContaining("2 ลิตร"),
  });
});
