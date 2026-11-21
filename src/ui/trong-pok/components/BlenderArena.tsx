"use client";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import {
  ArenaResultSchema,
  type AgentEvent,
  type ArenaResult,
} from "@/lib/types";
import type { Plan } from "@/ui/trong-pok/lib/types";
import { manufacturerExample } from "@/ui/trong-pok/lib/research";
import { readArenaStream } from "@/ui/trong-pok/lib/arena-stream";
import { detectInputLinks } from "@/ui/trong-pok/lib/input-link";
import {
  readHistory,
  historyResult,
  type HistoryEntry,
} from "@/ui/trong-pok/lib/history";
import Mascot from "./Mascot";
import HomeForm from "./HomeForm";
import QuestionCard, { type BlenderAnswers } from "./QuestionCard";
import Results from "./Results";
import ArenaResults, { type CatalogProduct } from "./ArenaResults";
import HomeHistory from "./HomeHistory";
const SavedSchema = z.array(
  z.object({ query: z.string(), result: ArenaResultSchema }),
);
type Saved = z.infer<typeof SavedSchema>[number];
type Screen =
  | { kind: "home" }
  | { kind: "clarify"; plan: Plan }
  | { kind: "search"; answers: BlenderAnswers; events: AgentEvent[] }
  | { kind: "result"; result: ArenaResult }
  | { kind: "error"; answers: BlenderAnswers; message: string }
  | { kind: "preview"; entry: HistoryEntry | null };
const historyKey = "trong-pok-arena-history-v1";
export default function BlenderArena({
  rankingDemo,
  fontTheme = "ibm",
  products,
}: {
  rankingDemo: boolean;
  fontTheme?: "ibm" | "line";
  products: CatalogProduct[];
}) {
  const [screen, setScreen] = useState<Screen>(
    rankingDemo ? { kind: "preview", entry: null } : { kind: "home" },
  );
  const [query, setQuery] = useState(""),
    [saved, setSaved] = useState<Saved[]>([]),
    [legacy, setLegacy] = useState<HistoryEntry[]>([]);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setLegacy(readHistory());
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
    const url = new URL(window.location.href);
    url.searchParams.delete("demo");
    window.history.replaceState(
      window.history.state,
      "",
      url.pathname + url.search + url.hash,
    );
  }
  function reset() {
    back();
    setQuery("");
  }
  function submit(raw: string) {
    if (!raw.trim()) return;
    controller.current?.abort();
    setQuery(raw);
    setScreen({
      kind: "clarify",
      plan: {
        raw,
        target: null,
        supported: true,
        ice: false,
        conditions: {
          cubes: null,
          container: "unknown",
          pulse: null,
          budget: null,
        },
        needsContext: true,
      },
    });
  }
  async function run(answers: BlenderAnswers) {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setScreen({ kind: "search", answers, events: [] });
    try {
      const link = detectInputLinks(query)[0]?.url;
      const response = await fetch("/api/arena", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category: "blender",
          needText: query,
          ...(link ? { link } : {}),
          answers,
        }),
        signal: current.signal,
      });
      const result = await readArenaStream(response, (event) => {
        if (controller.current !== current || current.signal.aborted) return;
        setScreen((previous) =>
          previous.kind === "search"
            ? { ...previous, events: [...previous.events, event] }
            : previous,
        );
      });
      if (controller.current !== current || current.signal.aborted) return;
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
  const phase = screen.kind === "preview" ? "result" : screen.kind;
  return (
    <main className={"phone " + phase} data-font={fontTheme}>
      <Mascot phase={phase} />
      {screen.kind === "home" && (
        <HomeForm
          initial={query}
          onSubmit={submit}
          history={
            <>
              {saved.length > 0 && (
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
              {legacy.length > 0 && (
                <section>
                  <p>ประวัติแบบจำลองการออกแบบ</p>
                  <HomeHistory
                    items={legacy}
                    onOpen={(entry) => setScreen({ kind: "preview", entry })}
                  />
                </section>
              )}
            </>
          }
        />
      )}{" "}
      {screen.kind === "clarify" && (
        <QuestionCard
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
            <h1>กำลังวิเคราะห์สินค้าของคุณ..</h1>
            <p>{screen.events.at(-1)?.text || "กำลังเริ่มตัวแทนตรวจสอบ"}</p>
          </div>
          <ol className="arena-events" aria-label="ความคืบหน้าตัวแทน">
            {screen.events.slice(-8).map((event, index) => (
              <li key={index}>
                <strong>
                  {
                    {
                      verifier: "ผู้ตรวจสอบ",
                      fit: "ผู้หาความเหมาะสม",
                      value: "ผู้หาความคุ้มค่า",
                      skeptic: "ผู้ทักท้วง",
                      judge: "ผู้สรุป",
                    }[event.agent]
                  }
                </strong>{" "}
                · {event.text}
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
      {screen.kind === "preview" && (
        <>
          <span className="demo-label">ตัวอย่างการออกแบบ</span>
          <Results
            result={
              screen.entry ? historyResult(screen.entry) : manufacturerExample()
            }
            onBack={back}
            onReset={reset}
            onConditions={() => {}}
          />
        </>
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
