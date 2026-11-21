import { z } from "zod";
import {
  AgentEventSchema,
  ArenaResultSchema,
  type AgentEvent,
  type ArenaResult,
} from "../../../lib/types";

const ErrorSchema = z.object({ error: z.string().min(1) });
export async function readArenaStream(
  response: Response,
  onAgent: (event: AgentEvent) => void,
): Promise<ArenaResult> {
  if (!response.ok) throw new Error("ไม่สามารถเริ่มค้นหาได้ กรุณาลองอีกครั้ง");
  if (!response.body) throw new Error("ไม่ได้รับข้อมูลจากเซิร์ฟเวอร์");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  function consume(block: string): ArenaResult | undefined {
    let name = "";
    const data: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) name = line.slice(6).trim();
      if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
    }
    if (!data.length || !["agent", "result", "error"].includes(name)) return;
    const value: unknown = JSON.parse(data.join("\n"));
    if (name === "error") throw new Error(ErrorSchema.parse(value).error);
    if (name === "agent") onAgent(AgentEventSchema.parse(value));
    if (name === "result") return ArenaResultSchema.parse(value);
  }
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      buffer = buffer.replace(/\r\n/g, "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const result = consume(buffer.slice(0, boundary));
        buffer = buffer.slice(boundary + 2);
        if (result) {
          return result;
        }
        boundary = buffer.indexOf("\n\n");
      }
      if (done) throw new Error("การเชื่อมต่อสิ้นสุดก่อนรับผลครบ กรุณาลองอีกครั้ง");
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
