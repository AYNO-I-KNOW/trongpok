import { describe, expect, it } from "vitest";
import { readArenaStream } from "./arena-stream";
function response(text: string, split = false) {
  const bytes = new TextEncoder().encode(text);
  return new Response(
    new ReadableStream({
      start(controller) {
        if (split)
          for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
        else controller.enqueue(bytes);
        controller.close();
      },
    }),
  );
}
const result = { requirements: [], ranked: [], events: [], mode: "rules" };
describe("arena stream", () => {
  it("reads split Thai UTF-8 and multiple named events", async () => {
    const events: unknown[] = [];
    const agent = { agent: "fit", type: "step", text: "ตรวจหลักฐาน" };
    const value = await readArenaStream(
      response(
        `event: agent\r\ndata: ${JSON.stringify(agent)}\r\n\r\nevent: result\ndata: ${JSON.stringify(result)}\n\n`,
        true,
      ),
      (event) => events.push(event),
    );
    expect(events).toEqual([agent]);
    expect(value).toEqual(result);
  });
  it("rejects premature EOF", async () => {
    await expect(
      readArenaStream(
        response(
          'event: agent\ndata: {"agent":"fit","type":"start","text":"เริ่ม"}\n\n',
        ),
        () => {},
      ),
    ).rejects.toThrow("สิ้นสุดก่อน");
  });
  it("rejects terminal error", async () => {
    await expect(
      readArenaStream(
        response('event: error\ndata: {"error":"ลองใหม่"}\n\n'),
        () => {},
      ),
    ).rejects.toThrow("ลองใหม่");
  });
  it("validates result payload", async () => {
    await expect(
      readArenaStream(
        response('event: result\ndata: {"mode":"rules"}\n\n'),
        () => {},
      ),
    ).rejects.toThrow();
  });
});
