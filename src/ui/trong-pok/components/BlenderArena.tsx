"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  ArenaResultSchema,
  type AgentEvent,
  type CategoryPack,
} from "@/lib/types";
import type { Answers } from "@/lib/needs/answers";
import { findSourceReview } from "@/ui/trong-pok/lib/arena-evidence";
import { readArenaStream } from "@/ui/trong-pok/lib/arena-stream";
import { detectInputLinks } from "@/ui/trong-pok/lib/input-link";
import HomeForm from "./HomeForm";
import Mascot from "./Mascot";
import QuestionCard from "./QuestionCard";
import ArenaResults, { type CatalogProduct } from "./ArenaResults";
const SavedSchema = z.array(
  z.object({ query: z.string(), result: ArenaResultSchema.omit({ events: true }) }),
);
type Saved = z.infer<typeof SavedSchema>[number];
type Screen =
  | { kind: "home" }
  | { kind: "clarify" }
  | { kind: "search"; events: AgentEvent[] }
  | { kind: "result"; result: Saved["result"] }
  | { kind: "error"; answers: Answers; message: string };
const historyKey = "trong-pok-arena-history-v2";
const demoPrompt = "เครื่องปั่นไว้ปั่นน้ำแข็งเปิดร้าน งบ 3,000 บาท";
const agentNames = {
  verifier: "ผู้ตรวจสอบ",
  fit: "ผู้หาความเหมาะสม",
  value: "ผู้หาความคุ้มค่า",
  skeptic: "ผู้ทักท้วง",
  judge: "ผู้สรุป",
};

function eventText(event: AgentEvent, products: CatalogProduct[]) {
  if (event.type !== "objection") return event.text;
  const product = products.find(({ id }) => id === event.productId);
  if (event.agent !== "skeptic" || !product) return "ยังยืนยันหลักฐานทักท้วงไม่ได้";
  const hasSource = event.objections?.some((label) =>
    label.stance === "contradict" && label.target === "product" &&
    findSourceReview(product, product.id, label)
  );
  return hasSource ? `พบข้อทักท้วงของ ${product.title}` : "ยังยืนยันหลักฐานทักท้วงไม่ได้";
}

export default function BlenderArena({
  pack,
  fontTheme = "ibm",
  products,
}: {
  pack: CategoryPack;
  fontTheme?: "ibm" | "line";
  products: CatalogProduct[];
}) {
  const [screen, setScreen] = useState<Screen>({ kind: "home" });
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState<Saved[]>([]);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const parsed = SavedSchema.safeParse(
          JSON.parse(localStorage.getItem(historyKey) || "[]"),
        );
        if (parsed.success) setSaved(parsed.data.slice(0, 3));
      } catch {}
    });
    return () => {
      cancelAnimationFrame(frame);
      controller.current?.abort();
    };
  }, []);
  function back() {
    controller.current?.abort();
    controller.current = null;
    setScreen({ kind: "home" });
    requestAnimationFrame(() => {
      document.getElementById("query")?.focus();
    });
  }
  function reset() {
    back();
    setQuery("");
  }
  function submit(raw: string) {
    if (!raw.trim()) return;
    controller.current?.abort();
    setQuery(raw);
    setScreen({ kind: "clarify" });
  }
  async function run(answers: Answers) {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setScreen({ kind: "search", events: [] });
    try {
      const link = detectInputLinks(query)[0]?.url;
      const response = await fetch("/api/arena", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: pack.id,
          needText: query,
          ...(link ? { link } : {}),
          answers,
        }),
        signal: current.signal,
      });
      const { requirements, ranked, mode, cachedMode, modelContributed } = await readArenaStream(response, (event) => {
        if (controller.current !== current || current.signal.aborted ||
          (!link && event.agent === "verifier")) return;
        setScreen((previous) =>
          previous.kind === "search"
            ? { ...previous, events: [...previous.events, event] }
            : previous,
        );
      });
      if (controller.current !== current || current.signal.aborted) return;
      const result = { requirements, ranked, mode, cachedMode, modelContributed };
      setScreen({ kind: "result", result });
      const next = [
        { query, result },
        ...saved.filter((entry) => entry.query !== query),
      ].slice(0, 3);
      setSaved(next);
      try {
        localStorage.setItem(historyKey, JSON.stringify(next));
      } catch {}
    } catch (error) {
      if (controller.current === current && !current.signal.aborted)
        setScreen({
          kind: "error",
          answers,
          message:
            error instanceof z.ZodError || error instanceof SyntaxError
              ? "ข้อมูลผลลัพธ์ไม่ถูกต้อง กรุณาลองอีกครั้ง"
              : error instanceof Error
                ? error.message
                : "ตรวจข้อมูลไม่สำเร็จ",
        });
    }
  }
  const phase = screen.kind;
  return (
    <main className={"phone " + phase} data-font={fontTheme}>
      <Mascot phase={phase} />
      {screen.kind === "home" && (
        <HomeForm
          initial={query}
          onSubmit={submit}
          introAction={
            <div className="arena-intro">
              <button className="evidence-link arena-entry" type="button" onClick={() => submit(demoPrompt)}>
                ลองโจทย์ตัวอย่าง
              </button>
              <p>{demoPrompt}</p>
            </div>
          }
          history={saved.length > 0 && (
            <section className="arena-history">
              <h2>ผลล่าสุด</h2>
              <div className="history-list">
                {saved.map((entry) => (
                  <button
                    type="button"
                    key={entry.query}
                    onClick={() => {
                      setQuery(entry.query);
                      setScreen({ kind: "result", result: entry.result });
                    }}
                  >
                    {entry.query}
                  </button>
                ))}
              </div>
            </section>
          )}
        />
      )}{" "}
      {screen.kind === "clarify" && (
        <QuestionCard
          pack={pack}
          needText={query}
          onConfirm={(answers) => void run(answers)}
          onBack={back}
        />
      )}{" "}
      {screen.kind === "search" && (
        <section className="search-copy">
          <button
            className="back"
            type="button"
            onClick={back}
            aria-label="ยกเลิกและกลับหน้าแรก"
          >
            ←
          </button>
          <div role="status">
            <h1>กำลังเปรียบเทียบเครื่องปั่นจากชุดเดโม</h1>
            <p>{screen.events.length
              ? eventText(screen.events[screen.events.length - 1], products)
              : "กำลังเริ่มตรวจสอบ"}</p>
          </div>
          <ol className="arena-events" aria-label="ความคืบหน้าตัวแทน">
            {screen.events.slice(-8).map((event, index) => (
              <li key={index}>
                <strong>{agentNames[event.agent]}</strong>
                {" · "}{eventText(event, products)}
              </li>
            ))}
          </ol>
        </section>
      )}{" "}
      {screen.kind === "result" && (
        <ArenaResults
          result={screen.result}
          products={products}
          onBack={back}
          onReset={reset}
        />
      )}{" "}
      {screen.kind === "error" && (
        <section className="arena-error" aria-labelledby="arena-error-heading">
          <h1 id="arena-error-heading">ตรวจข้อมูลไม่สำเร็จ</h1>
          <p role="alert">{screen.message}</p>
          <div className="arena-error-actions">
            <button
              className="primary"
              type="button"
              onClick={() => void run(screen.answers)}
            >
              ลองอีกครั้ง
            </button>
            <button className="primary secondary" type="button" onClick={back}>
              กลับไปแก้โจทย์
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
