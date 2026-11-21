import { existsSync, statSync } from "node:fs";
import { resolve as resolvePath, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

let root;
const sdk = "data:text/javascript," + encodeURIComponent("export default class OpenAI { constructor() { throw new Error('OpenAI must not run during rules verification'); } }");
const formats = "data:text/javascript," + encodeURIComponent("export function zodTextFormat() { throw new Error('LLM formatting must not run during rules verification'); }");

export function initialize(data) {
  root = data.root;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "openai") return { url: sdk, shortCircuit: true };
  if (specifier === "openai/helpers/zod") return { url: formats, shortCircuit: true };
  const base = specifier.startsWith("@/") ? resolvePath(root, "src", specifier.slice(2))
    : specifier.startsWith(".") ? fileURLToPath(new URL(specifier, context.parentURL)) : undefined;
  if (base) {
    for (const candidate of [base, base + ".ts", join(base, "index.ts")]) {
      if (existsSync(candidate) && statSync(candidate).isFile()) return { url: pathToFileURL(candidate).href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}
