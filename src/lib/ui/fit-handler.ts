import type { CategoryPack, Product } from "../types";
import { RunInputSchema } from "./contracts";
import { validateSelection } from "./needs";
import { consumeArena } from "./arena-response";

type FitDependencies = {
  packs: () => Promise<CategoryPack[]>;
  find: (link: string) => Promise<{ status: "found"; product: Product } | { status: "not-in-demo" }>;
  run: (input: unknown, signal: AbortSignal) => Promise<Response>;
};

export function createFitHandler(deps: FitDependencies) {
  return async (request: Request) => {
    const parsed = RunInputSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: "กรุณาระบุ category และ answers หรือ needText" }, { status: 400 });
    const input = parsed.data;
    const pack = (await deps.packs()).find((item) => item.id === input.category);
    if (!pack || (input.answers && !validateSelection(pack, input.answers))) {
      return Response.json({ error: "หมวดสินค้าหรือคำตอบไม่ถูกต้อง" }, { status: 422 });
    }
    if (input.link) {
      const linked = await deps.find(input.link);
      if (linked.status === "not-in-demo") return Response.json({ error: "not-in-demo" }, { status: 404 });
      if (linked.product.category !== input.category) return Response.json({ error: "สินค้าจากลิงก์อยู่คนละหมวด" }, { status: 422 });
    }
    try {
      const result = await consumeArena(await deps.run(input, request.signal), () => undefined, request.signal);
      const { events, ...answer } = result;
      void events;
      return Response.json({ ...answer, measuredFrom: "earlier buyers' reviews", scoringDoc: "docs/scoring.md" }, { headers: { "Cache-Control": "no-store" } });
    } catch {
      return Response.json({ error: "Arena ยังไม่พร้อมหรือส่งผลลัพธ์ไม่สำเร็จ กรุณาลองอีกครั้ง" }, { status: 503 });
    }
  };
}
