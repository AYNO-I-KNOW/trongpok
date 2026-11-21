import { loadPacks } from "@/lib/catalog";
import { RunInputSchema } from "@/lib/ui/contracts";
import { requirementsFromSelection, prefillSelection, validateSelection } from "@/lib/ui/needs";
import { previewArena } from "@/lib/ui/preview";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const input = RunInputSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return Response.json({ error: "รูปแบบคำขอไม่ถูกต้อง" }, { status: 400 });
  if (input.data.link) return Response.json({ error: "โหมดตัวอย่างไม่ตรวจสอบสินค้าจากลิงก์จริง" }, { status: 422 });
  const pack = (await loadPacks()).find((item) => item.id === input.data.category);
  if (!pack) return Response.json({ error: "ไม่พบหมวดสินค้า" }, { status: 422 });
  const answers = input.data.answers ?? prefillSelection(pack, input.data.needText ?? "");
  if (!validateSelection(pack, answers)) return Response.json({ error: "คำตอบไม่ตรงกับหมวดสินค้า" }, { status: 422 });
  const requirements = input.data.requirements ?? requirementsFromSelection(pack, answers);
  if (!requirements.length) return Response.json({ error: "เลือกความต้องการอย่างน้อยหนึ่งข้อ" }, { status: 422 });
  const result = previewArena(pack, requirements);
  const encoder = new TextEncoder();
  let index = 0;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (cancelled) return;
      if (request.signal.aborted) { controller.close(); return; }
      if (index < result.events.length) {
        await new Promise((resolve) => setTimeout(resolve, 180));
        if (cancelled) return;
        controller.enqueue(encoder.encode(`event: agent\ndata: ${JSON.stringify(result.events[index++])}\n\n`));
      } else {
        controller.enqueue(encoder.encode(`event: result\ndata: ${JSON.stringify(result)}\n\n`));
        controller.close();
      }
    },
    cancel() { cancelled = true; },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
}
