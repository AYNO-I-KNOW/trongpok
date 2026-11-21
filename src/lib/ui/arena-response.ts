import { AgentEventSchema, ArenaResultSchema, type AgentEvent, type ArenaResult } from "../types";
import { readEventStream, type StreamFrame } from "./stream";

export async function consumeArena(response: Response, onEvent: (event: AgentEvent) => void, signal?: AbortSignal, onMode?: (mode: ArenaResult["mode"]) => void): Promise<ArenaResult> {
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? (response.status === 404 ? "ระบบวิเคราะห์ยังไม่พร้อม ลองโหมดตัวอย่างได้จากหน้าแรก" : "ยังวิเคราะห์ไม่ได้ กรุณาลองอีกครั้ง"));
  }
  if (response.headers.get("content-type")?.includes("application/json")) {
    const payload = await response.json();
    const result = ArenaResultSchema.parse(payload.result ?? payload);
    onMode?.(result.mode);
    return result;
  }
  if (!response.body) throw new Error("ไม่ได้รับข้อมูลจาก Arena");
  let result: ArenaResult | undefined;
  await readEventStream(response.body, (frame: StreamFrame) => {
    if (frame.data === "[DONE]") return;
    if (["ping", "heartbeat"].includes(frame.event)) return;
    const payload: unknown = JSON.parse(frame.data);
    if (frame.event === "error") throw new Error("Arena หยุดทำงาน กรุณาลองใหม่");
    const wrapped = typeof payload === "object" && payload !== null && "result" in payload ? payload.result : payload;
    const parsed = ArenaResultSchema.safeParse(wrapped);
    if (parsed.success) { result = parsed.data; onMode?.(parsed.data.mode); return; }
    if (typeof payload === "object" && payload !== null && "mode" in payload && ["llm", "rules", "cache"].includes(String(payload.mode))) {
      onMode?.(payload.mode as ArenaResult["mode"]);
    }
    const eventPayload = typeof payload === "object" && payload !== null && "event" in payload ? payload.event : payload;
    const event = AgentEventSchema.safeParse(eventPayload);
    if (event.success) onEvent(event.data);
    else if (frame.event === "result") throw new Error("รูปแบบผลลัพธ์จาก Arena ไม่ถูกต้อง");
  }, signal);
  if (!result) throw new Error("การเชื่อมต่อจบก่อนส่งผลลัพธ์ ลองอีกครั้งได้โดยไม่ต้องตอบคำถามใหม่");
  return result;
}
