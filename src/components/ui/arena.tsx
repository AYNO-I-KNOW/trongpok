"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { AgentEvent } from "@/lib/types";
import type { PendingRun } from "@/lib/ui/contracts";
import { agentInfo, safeAgentEvent } from "@/lib/ui/presentation";
import { consumeArena } from "@/lib/ui/arena-response";
import { readPending, saveRun } from "@/lib/ui/storage";
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
          linkedProductId: request.linkedProductId, result });
        setDone(true);
        timer = setTimeout(() => router.push(`/results?run=${encodeURIComponent(id)}`), 550);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "วิเคราะห์ไม่สำเร็จ ลองอีกครั้งได้");
      }
    }
    void start();
    return () => { controller.abort(); if (timer) clearTimeout(timer); };
  }, [attempt, router]);

  if (loaded && !pending) return <EmptyState title="เริ่มจากความต้องการของคุณก่อน" text="เลือกหมวดและตอบคำถามสั้น ๆ เพื่อให้ผู้ช่วยเปรียบเทียบได้ตรงโจทย์" />;
  const completed = Object.keys(agentInfo).filter((agent) => (agent === "verifier" && pending && !pending.linkedProductId) || events.some((event) => event.agent === agent && event.type === "done")).length;
  return <main className={`arena-main ${done ? "arena-complete" : ""}`}><Link className="text-button back-link" href="/" onClick={() => controllerRef.current?.abort()}>← เลือกความต้องการใหม่</Link>
    <div className="flow-heading"><div><p className="eyebrow">เบื้องหลังคำตอบของคุณ</p><h1>{done ? "เจอตัวเลือกของคุณแล้ว" : "ให้ทุกมุมมองช่วยกันเลือก"}</h1><p>ตรวจให้ครบ ทั้งความเหมาะสม ราคา และสิ่งที่ควรระวัง</p></div><ModeBadge preview={pending?.preview ?? false} mode={mode} /></div>
    <div className="arena-progress"><span style={{ width: `${done ? 100 : completed * 25}%` }} /></div>
    <div className="arena-context">{pending?.input.requirements?.map((requirement) => <span className="chip" key={requirement.id}>{requirement.text}</span>)}</div>
    <div className="arena-grid">{Object.entries(agentInfo).map(([agent, info]) => {
      const laneEvents = events.filter((event) => event.agent === agent);
      const last = laneEvents.at(-1);
      const skipped = agent === "verifier" && Boolean(pending && !pending.linkedProductId);
      const finished = skipped || last?.type === "done";
      const active = laneEvents.length > 0 && !finished && !error;
      return <section key={agent} className={`agent-lane ${active ? "active" : ""} ${finished ? "finished" : ""}`} aria-label={info.name}>
        <div className="lane-top"><span className={`agent-mark ${agent}`}>{info.mark}</span><span className={`lane-status ${active ? "working" : ""}`}>{skipped ? "ไม่มีลิงก์ให้ตรวจ" : finished ? "เรียบร้อย ✓" : active ? "กำลังทำงาน" : "รอเริ่ม"}</span></div>
        <h2>{info.title}</h2><span className="agent-name">{info.name}</span><p className="agent-goal">{info.goal}</p>
        <ol className="agent-events">{laneEvents.map((event, index) => <li className={`agent-event ${event.type}`} key={`${index}-${event.type}`}><span className="event-dot" /><p>{event.text}</p>{event.productId && <span className="candidate-chip">{pending?.products.find((product) => product.id === event.productId)?.title ?? event.productId}</span>}{event.quote && <blockquote>“{event.quote}”</blockquote>}</li>)}{!laneEvents.length && <li className="waiting-event">{skipped ? "เริ่มจากความต้องการ จึงข้ามการตรวจสินค้าต้นทาง" : agent === "skeptic" ? "เริ่มหลังจากมีตัวเลือกให้ตรวจ" : "กำลังเตรียมข้อมูล…"}</li>}</ol>
      </section>;
    })}</div>
    <div className="arena-live-status" role="status">{done ? "กำลังเปิดผลเปรียบเทียบ…" : error ? "การเปรียบเทียบหยุดลง" : `เสร็จแล้ว ${completed} จาก 4 มุมมอง`}</div>
    {error && <div className="error-panel" role="alert"><h2>ยังส่งผลลัพธ์ไม่ได้</h2><p>{error}</p><div className="button-row"><button className="button primary" onClick={() => setAttempt((value) => value + 1)}>ลองอีกครั้ง</button><Link href="/" className="button secondary">กลับไปเลือก / ลองข้อมูลตัวอย่าง</Link></div></div>}
  </main>;
}
