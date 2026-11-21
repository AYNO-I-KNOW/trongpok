import { describe, expect, it } from "vitest";
import fixture from "../../../../data/products/blender-ice-station.json";
import { findSourceReview } from "./arena-evidence";

const label = { reviewId: "r2", quote: "เสียงดังพอควร" };

describe("Arena review sources", () => {
  it("resolves an exact excerpt to the review with its original context", () => {
    expect(findSourceReview(fixture, fixture.id, label)?.text).toBe(
      "ใช้งาน 1 สัปดาห์ เสียงดังพอควร เปิดร้านไหวแต่คอนโดคงรบกวน",
    );
  });

  it("rejects a quote when its product, review ID, or verbatim text does not match", () => {
    expect(findSourceReview(fixture, "blender-signature-max", label)).toBeUndefined();
    expect(findSourceReview(fixture, fixture.id, { ...label, reviewId: "r1" })).toBeUndefined();
    expect(findSourceReview(fixture, fixture.id, { ...label, quote: "เสียงดังมาก" })).toBeUndefined();
    expect(findSourceReview(fixture, fixture.id, { ...label, quote: " " })).toBeUndefined();
    expect(findSourceReview(undefined, fixture.id, label)).toBeUndefined();
  });

  it("does not use template text as evidence even when it matches", () => {
    expect(findSourceReview(fixture, fixture.id, {
      reviewId: "r10",
      quote: "สินค้าคุณภาพดี",
    })).toBeUndefined();
  });
});
