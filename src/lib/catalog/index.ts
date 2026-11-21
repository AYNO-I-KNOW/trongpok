import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { CategoryPackSchema, ProductSchema, type Product } from "../types";

const defaultRoot = () => join(process.cwd(), "data");

async function loadFiles<T>(directory: string, schema: z.ZodType<T>, validate?: (value: T) => void): Promise<T[]> {
  const files = (await readdir(directory)).filter((file) => file.endsWith(".json") && !file.startsWith("_")).sort();
  return Promise.all(files.map(async (file) => {
    try {
      const value: unknown = JSON.parse(await readFile(join(directory, file), "utf8"));
      const parsed = schema.parse(value);
      validate?.(parsed);
      return parsed;
    } catch (error) {
      throw new Error(`Invalid data in ${join(directory, file)}`, { cause: error });
    }
  }));
}

export function loadPacks(dataRoot = defaultRoot()) {
  return loadFiles(join(dataRoot, "categories"), CategoryPackSchema);
}

export async function loadProducts(dataRoot = defaultRoot()) {
  const packs = await loadPacks(dataRoot);
  return loadFiles(join(dataRoot, "products"), ProductSchema, (product) => {
    if (!packs.some((pack) => pack.id === product.category)) {
      throw new Error(`Invalid category ${product.category}`);
    }
  });
}

export async function detectCategory(text: string, dataRoot = defaultRoot()) {
  const normalized = text.toLocaleLowerCase();
  return (await loadPacks(dataRoot)).find((pack) => pack.keywords.some((keyword) => normalized.includes(keyword.toLocaleLowerCase()))) ?? null;
}

export async function byCategory(id: string, dataRoot = defaultRoot()) {
  return (await loadProducts(dataRoot)).filter((product) => product.category === id);
}

function linkIdentity(input: string) {
  try {
    const url = new URL(input);
    if (url.hostname !== "shopee.co.th" || !["https:", "http:"].includes(url.protocol)) return null;
    const match = url.pathname.match(/^\/product\/(\d+)\/(\d+)\/?$/) ?? url.pathname.match(/^\/[^/]+-i\.(\d+)\.(\d+)\/?$/);
    return match ? `${match[1]}/${match[2]}` : null;
  } catch {
    return null;
  }
}

export async function findByLink(url: string, dataRoot = defaultRoot()): Promise<{ status: "found"; product: Product } | { status: "not-in-demo" }> {
  const identity = linkIdentity(url);
  if (!identity) return { status: "not-in-demo" };
  const product = (await loadProducts(dataRoot)).find((candidate) => linkIdentity(candidate.shopeeUrl) === identity);
  return product ? { status: "found", product } : { status: "not-in-demo" };
}

export function shopeeLink(product: Product) {
  return product.shopeeUrl || `https://shopee.co.th/search?keyword=${encodeURIComponent(product.title)}`;
}
