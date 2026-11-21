import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { ArenaResultSchema, type ArenaResult, type CategoryPack, type Product } from "../types";

export function cacheHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function readArenaCache(root: string, key: string) {
  try {
    return ArenaResultSchema.parse(JSON.parse(await readFile(join(root, key + ".json"), "utf8")));
  } catch {
    return null;
  }
}

export async function writeArenaCache(root: string, key: string, result: ArenaResult, strict = false) {
  const temporary = join(root, key + "." + randomUUID() + ".tmp");
  try {
    await mkdir(root, { recursive: true });
    await writeFile(temporary, JSON.stringify(result));
    await rename(temporary, join(root, key + ".json"));
  } catch (error) {
    await unlink(temporary).catch(() => {});
    if (strict || !(error instanceof Error && "code" in error && ["EROFS", "EACCES", "EPERM"].includes(String(error.code)))) throw error;
  }
}

export async function readRequestCache(root: string, key: string) {
  try {
    const target = (await readFile(join(root, key + ".ref"), "utf8")).trim();
    if (!/^[a-f0-9]{64}$/.test(target)) return null;
    return readArenaCache(root, target);
  } catch {
    return null;
  }
}

export async function writeRequestCache(root: string, key: string, target: string, strict = false) {
  const temporary = join(root, key + "." + randomUUID() + ".tmp");
  try {
    await mkdir(root, { recursive: true });
    await writeFile(temporary, target);
    await rename(temporary, join(root, key + ".ref"));
  } catch (error) {
    await unlink(temporary).catch(() => {});
    if (strict || !(error instanceof Error && "code" in error && ["EROFS", "EACCES", "EPERM"].includes(String(error.code)))) throw error;
  }
}

export function requestCacheKey(request: unknown, packs: CategoryPack[], products: Product[]) {
  return cacheHash(["request", request, cacheHash([packs, products])]);
}
