"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { AgentEvent } from "@/lib/types";
import type { PendingRun } from "@/lib/ui/contracts";
import { agentInfo, safeAgentEvent } from "@/lib/ui/presentation";
import { consumeArena } from "@/lib/ui/arena-response";
import { readPending, saveRun } from "@/lib/ui/storage";
import DesignerScreen from "@/ui/trong-pok/components/DesignerScreen";
import { EmptyState, ModeBadge } from "./shared";

export function Arena() {
  const router = useRouter();
  const [pending, setPending] = useState<PendingRun | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [mode, setMode] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function start() {
      await Promise.resolve();
      if (controller.signal.aborted) return;
      const request = readPending();
      setPending(request); setLoaded(true); setEvents([]); setError(""); setDone(false); setMode(undefined);
      if (!request) return;
      try {
        const response = await fetch(request.preview ? "/api/ui/preview" : "/api/arena", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request.input), signal: controller.signal,
        });
        const result = await consumeArena(response, (event) => {
          if (!controller.signal.aborted) setEvents((current) => [...current, safeAgentEvent(event, request.products)]);
        }, controller.signal, (value) => { if (!controller.signal.aborted) setMode(value); });
        if (controller.signal.aborted) return;
        if (request.input.requirements) {
          const key = (items: typeof result.requirements) => JSON.stringify(items.toSorted((a, b) => a.id.localeCompare(b.id)));
          if (key(request.input.requirements) !== key(result.requirements)) throw new Error("ระบบยังไม่ยืนยันเงื่อนไขที่คุณแก้ไข กรุณาลองอีกครั้งหรือกลับไปตรวจความต้องการ");
        }
        if (result.ranked.some((row) => !request.products.some((product) => product.id === row.productId))) {
          throw new Error("รายการสินค้าเปลี่ยนไป กรุณากลับไปเริ่มใหม่เพื่อโหลดข้อมูลล่าสุด");
        }
        const id = crypto.randomUUID();
        saveRun({ id, createdAt: Date.now(), preview: request.preview, products: request.products,
          linkedProductId: request.linkedProductId, font: request.font, result });
        setDone(true);
        timer = setTimeout(() => {
          if (!controller.signal.aborted) router.push(`/results?run=${encodeURIComponent(id)}`);
        }, 550);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "วิเคราะห์ไม่สำเร็จ ลองอีกครั้งได้");
      }
    }
    void start();
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [attempt, router]);

  if (loaded && !pending) return <EmptyState title="เริ่มจากความต้องการของคุณก่อน" text="เลือกหมวดและตอบคำถามสั้น ๆ เพื่อให้ผู้ช่วยเปรียบเทียบได้ตรงโจทย์" />;
  const lanes = Object.entries(agentInfo).map(([agent, info]) => {
    const updates = events.filter((event) => event.agent === agent);
    const skipped = agent === "verifier" && Boolean(pending && !pending.linkedProductId);
    const finished = skipped || updates.some((event) => event.type === "done");
    return { agent, info, updates, skipped, finished };
  });
  const completed = lanes.filter((lane) => lane.finished).length;
  return <DesignerScreen phase="search" font={pending?.font}>
    <nav className="question-nav" aria-label="การนำทางระหว่างวิเคราะห์">
      <Link className="back arena-back" href="/" onClick={() => controllerRef.current?.abort()} aria-label="ยกเลิกและกลับหน้าแรก">←</Link>
    </nav>
    <section className="search-copy arena-search">
      <div role="status">
        <h1>{done ? "กำลังเปิดผลเปรียบเทียบ" : error ? "ยังวิเคราะห์ไม่สำเร็จ" : "กำลังวิเคราะห์สินค้าของคุณ.."}</h1>
        <p>{done ? "พบตัวเลือกตามเงื่อนไขแล้ว" : `ตรวจแล้ว ${completed} จาก ${lanes.length} มุมมอง`}</p>
      </div>
      <ModeBadge preview={pending?.preview ?? false} mode={mode} />
      <ul className="arena-agent-status" aria-label="สถานะผู้ช่วยเปรียบเทียบ">
        {lanes.map(({ agent, info, updates, skipped, finished }) => <li key={agent}>
          <span>{info.title}</span><span>{skipped ? "ไม่มีลิงก์ให้ตรวจ" : finished ? "เรียบร้อย" : updates.length ? "กำลังทำงาน" : "รอเริ่ม"}</span>
        </li>)}
      </ul>
      {events.length > 0 && <details className="method">
        <summary>ดูการวิเคราะห์</summary>
        <ol className="arena-log">{events.map((event, index) => <li key={index}>
          {event.text}{event.quote && <blockquote>“{event.quote}”</blockquote>}
        </li>)}</ol>
      </details>}
      {error && <div role="alert"><p className="form-error-inline">{error}</p>
        <button className="primary" type="button" onClick={() => setAttempt((value) => value + 1)}>ลองอีกครั้ง</button>
      </div>}
    </section>
  </DesignerScreen>;
}
