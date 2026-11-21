import { findByLink, loadPacks } from "@/lib/catalog";
import { ArenaRequestSchema, runArenaRequest } from "@/lib/agents/service";
import { createFitHandler } from "@/lib/ui/fit-handler";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return createFitHandler({
    packs: loadPacks,
    find: findByLink,
    run: async (input, signal) => Response.json(await runArenaRequest(ArenaRequestSchema.parse(input), undefined, { signal, replayDelayMs: 0 })),
  })(request);
}
