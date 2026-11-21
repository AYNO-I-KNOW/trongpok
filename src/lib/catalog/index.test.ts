import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, it } from "vitest";
import pack from "../../../data/categories/blender.json";
import fixture from "../../../data/products/_example.json";
import { byCategory, detectCategory, findByLink, loadPacks, loadProducts, shopeeLink } from "./index";

let root: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "catalog-"));
  await Promise.all([mkdir(join(root, "categories")), mkdir(join(root, "products"))]);
  await writeFile(join(root, "categories", "blender.json"), JSON.stringify(pack));
  await writeFile(join(root, "products", `${fixture.id}.json`), JSON.stringify({ ...fixture, shopeeUrl: "https://shopee.co.th/product/123/456" }));
});
afterEach(async () => { await rm(root, { recursive: true, force: true }); });

it("loads validated data and skips underscore files", async () => {
  await writeFile(join(root, "products", "_ignored.json"), "invalid");
  expect(await loadProducts(root)).toHaveLength(1);
  expect(await loadPacks(root)).toEqual([pack]);
  expect(await byCategory("blender", root)).toHaveLength(1);
});
it("includes the filename when data is invalid", async () => {
  await writeFile(join(root, "products", "broken.json"), "{}");
  await expect(loadProducts(root)).rejects.toThrow("broken.json");
});
it("rejects categories with no question pack", async () => {
  await writeFile(join(root, "products", `${fixture.id}.json`), JSON.stringify({ ...fixture, category: "missing" }));
  await expect(loadProducts(root)).rejects.toThrow(fixture.id);
});
it("detects keywords and returns null for unmatched text", async () => {
  expect((await detectCategory("BLENDER", root))?.id).toBe("blender");
  expect(await detectCategory("other", root)).toBeNull();
});
it.each(["https://shopee.co.th/product/123/456?x=1", "https://shopee.co.th/name-i.123.456"])("matches identity from %s", async (url) => {
  expect(await findByLink(url, root)).toMatchObject({ status: "found", product: { id: fixture.id } });
});
it.each(["https://s.shopee.co.th/abc", "https://shopee.co.th/product/1/2", "invalid", "https://evil.test/name-i.123.456"])("returns not-in-demo for %s", async (url) => {
  expect(await findByLink(url, root)).toEqual({ status: "not-in-demo" });
});
it("builds a search link when the product has no URL", () => {
  expect(shopeeLink(fixture)).toBe(`https://shopee.co.th/search?keyword=${encodeURIComponent(fixture.title)}`);
});

it("reports the actual filename for an invalid category", async () => {
  await writeFile(join(root, "products", "different-name.json"), JSON.stringify({ ...fixture, category: "missing" }));
  await expect(loadProducts(root)).rejects.toThrow("different-name.json");
});
it.each(["https://shopee.co.th/-i.123.456", "https://shopee.co.th/nested/name-i.123.456"])("rejects invalid slug paths %s", async (url) => {
  expect(await findByLink(url, root)).toEqual({ status: "not-in-demo" });
});
