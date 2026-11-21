"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  productSearchResultSchema,
  type ProductSearchResult,
} from "@/lib/product-search/contract";
import { liveResult } from "@/ui/trong-pok/lib/live-result";
import HomeForm from "./HomeForm";
import Mascot from "./Mascot";
import Results from "./Results";

type SearchState =
  | { kind: "home" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "result"; result: ProductSearchResult };

export default function SearchHome({
  fontTheme,
  initialQuery = "",
  autoSearch = false,
  history,
  onSearchComplete,
}: {
  fontTheme: "ibm" | "line";
  initialQuery?: string;
  autoSearch?: boolean;
  history?: ReactNode;
  onSearchComplete?: (query: string, response: Extract<ProductSearchResult, { kind: "web" }>) => void;
}) {
  const [state, setState] = useState<SearchState>({
    kind: initialQuery && autoSearch ? "loading" : "home",
  });
  const [query, setQuery] = useState(initialQuery);
  const [answer, setAnswer] = useState("");
  const onComplete = useRef(onSearchComplete);
  useEffect(() => { onComplete.current = onSearchComplete; }, [onSearchComplete]);
  const activeRequest = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (state.kind !== "loading") {
      heading.current?.focus();
      return;
    }
    const controller = new AbortController();
    activeRequest.current = controller;
    async function load() {
      let next: SearchState;
      try {
        const response = await fetch("/api/product-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
          signal: controller.signal,
        });
        const data: unknown = await response.json();
        next = { kind: "result", result: productSearchResultSchema.parse(data) };
      } catch {
        next = { kind: "error", message: "เชื่อมต่อการค้นหาไม่ได้ กรุณาลองอีกครั้ง" };
      }
      if (!controller.signal.aborted) {
        if (next.kind === "result" && next.result.kind === "web" && next.result.picks.length)
          onComplete.current?.(query, next.result);
        setState((current) => (current === state ? next : current));
      }
    }
    void load();
    return () => controller.abort();
  }, [state, query]);

  function edit() {
    activeRequest.current?.abort();
    setState({ kind: "home" });
    setAnswer("");
    requestAnimationFrame(() => document.getElementById("query")?.focus());
  }

  function reset() {
    setQuery("");
    edit();
  }

  function search(raw: string) {
    const next = raw.trim();
    if (!next) return;
    activeRequest.current?.abort();
    setQuery(next);
    setAnswer("");
    setState({ kind: "loading" });
  }

  const result = state.kind === "result" ? state.result : null;
  const phase = state.kind === "home" ? "home"
    : state.kind === "loading" ? "search"
    : result?.kind === "clarify" ? "clarify"
    : result?.kind === "web" || result?.kind === "demo" ? "result"
    : "unsupported";

  return (
    <main className={"phone " + phase} data-font={fontTheme}>
      <Mascot phase={phase} />
      {phase === "home" && <HomeForm initial={query} history={history} onSubmit={search}
        action={<Link className="evidence-link" href={fontTheme === "line" ? "/compare?font=line" : "/compare"}>
          เปรียบเทียบจากรีวิวใน Arena →
        </Link>} />}
      {phase === "search" && <>
        <button className="edit-result" type="button" onClick={edit}>← แก้โจทย์</button>
        <section className="search-copy" role="status">
          <h1>กำลังวิเคราะห์สินค้าของคุณ..</h1>
          <p>กรุณารอสักครู่</p>
        </section>
      </>}
      {result?.kind === "clarify" && <section className="clarify">
        <nav className="question-nav" aria-label="ความคืบหน้าคำถาม">
          <button type="button" className="back" onClick={edit} aria-label="ย้อนกลับ">←</button>
          <div className="question-progress" role="progressbar" aria-label="คำถามเพิ่มเติม" aria-valuemin={0} aria-valuemax={1} aria-valuenow={1}>
            <span className="question-progress-fill" style={{ transform: "scaleX(1)" }} />
          </div>
          <span>1 จาก 1</span>
        </nav>
        <div className="question-step">
          <div className="question-copy">
            <h1 ref={heading} tabIndex={-1}>{result.question}</h1>
            <p>ขอข้อมูลเพิ่มอีกนิดเพื่อค้นหาให้ตรงกับคุณ</p>
          </div>
          <form id="question-form" onSubmit={(event) => {
            event.preventDefault();
            if (answer.trim()) search(query + "\n" + result.question + "\nคำตอบ: " + answer.trim());
          }}>
            <label className="custom-label">คำตอบของคุณ
              <textarea autoFocus rows={1} value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="พิมพ์คำตอบของคุณ" required />
            </label>
          </form>
        </div>
        <div className="question-footer">
          <button className="primary" type="submit" form="question-form" disabled={!answer.trim()}>เริ่มค้นหาต่อ</button>
        </div>
      </section>}
      {(result?.kind === "web" || result?.kind === "demo") && <Results result={liveResult(query, result)} onReset={reset} onBack={edit} onConditions={() => {}} />}
      {phase === "unsupported" && <section className="unsupported">
        <h1 ref={heading} tabIndex={-1}>ยังตรวจเรื่องนี้ไม่ได้</h1>
        <p role={state.kind === "error" ? "alert" : undefined}>{state.kind === "error" ? state.message : result?.kind === "unavailable" ? result.message : "ยังไม่พบข้อมูลที่ยืนยันได้"}</p>
        <button className="primary" onClick={() => search(query)}>ลองค้นอีกครั้ง</button>
        <button className="primary secondary" onClick={edit}>แก้โจทย์</button>
      </section>}
    </main>
  );
}
