import { ArenaRequestSchema, runArenaRequest } from "../../../lib/agents/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const parsed = ArenaRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "ข้อมูลคำขอไม่ถูกต้อง" }, { status: 400 });
  const encoder = new TextEncoder();
  const cancellation = new AbortController();
  const signal = AbortSignal.any([request.signal, cancellation.signal]);
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, value: unknown) => {
        if (!signal.aborted) controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`));
      };
      try {
        const result = await runArenaRequest(parsed.data, (event) => send("agent", event), {
          signal, onMode: (mode) => send("mode", { mode }),
        });
        send("result", result);
      } catch {
        send("error", { error: "ไม่สามารถประมวลผลคำขอได้" });
      } finally {
        if (!cancellation.signal.aborted) controller.close();
      }
    },
    cancel() { cancellation.abort(); },
  });
  return new Response(stream, { headers: {
    "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no",
  } });
}
