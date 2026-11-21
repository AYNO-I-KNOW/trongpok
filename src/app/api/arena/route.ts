import { ArenaRequestSchema, runArenaRequest } from "../../../lib/agents/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let input;
  try {
    input = ArenaRequestSchema.parse(await request.json());
  } catch {
    return Response.json({ error: "ข้อมูลคำขอไม่ถูกต้อง" }, { status: 400 });
  }
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, value: unknown) => controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`));
      try {
        const result = await runArenaRequest(input, (event) => send("agent", event));
        send("result", result);
      } catch {
        send("error", { error: "ไม่สามารถประมวลผลคำขอได้" });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" } });
}
