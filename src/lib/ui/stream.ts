export type StreamFrame = { event: string; data: string };

export class EventDecoder {
  private buffer = "";

  push(text: string, final = false): StreamFrame[] {
    this.buffer += text;
    if (final) this.buffer += "\n\n";
    const frames: StreamFrame[] = [];
    let separator: RegExpExecArray | null;
    while ((separator = /\r?\n\r?\n/.exec(this.buffer))) {
      const block = this.buffer.slice(0, separator.index);
      this.buffer = this.buffer.slice(separator.index + separator[0].length);
      let event = "message";
      const data: string[] = [];
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
      }
      if (data.length) frames.push({ event, data: data.join("\n") });
    }
    return frames;
  }
}

export async function readEventStream(
  body: ReadableStream<Uint8Array>,
  onFrame: (frame: StreamFrame) => void,
  signal?: AbortSignal,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const events = new EventDecoder();
  const abort = () => { void reader.cancel(); };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      signal?.throwIfAborted();
      const { done, value } = await reader.read();
      for (const frame of events.push(decoder.decode(value, { stream: !done }), done)) onFrame(frame);
      if (done) break;
    }
    signal?.throwIfAborted();
  } finally {
    signal?.removeEventListener("abort", abort);
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
