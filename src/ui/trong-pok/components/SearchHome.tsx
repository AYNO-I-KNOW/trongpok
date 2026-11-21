"use client";

import { useEffect, useRef, useState } from "react";
import {
  productSearchResultSchema,
  type ProductSearchResult,
} from "@/lib/product-search/contract";
import type { SearchHistoryEntry } from "@/ui/trong-pok/lib/history";
import { liveResult } from "@/ui/trong-pok/lib/live-result";
import HomeForm from "./HomeForm";
import HomeHistory from "./HomeHistory";
import Mascot from "./Mascot";
import Results from "./Results";

type SearchState = { query: string } & (
  | { kind: "home" }
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "result"; result: ProductSearchResult }
);

export default function SearchHome({
  fontTheme,
  history,
  onSearchComplete,
}: {
  fontTheme: "ibm" | "line";
  history: SearchHistoryEntry[];
  onSearchComplete: (query: string, response: Extract<ProductSearchResult, { kind: "web" }>) => void;
}) {
  const [state, setState] = useState<SearchState>({ kind: "home", query: "" });
  const [answer, setAnswer] = useState("");
  const activeRequest = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => () => activeRequest.current?.abort(), []);
  useEffect(() => {
    heading.current?.focus();
  }, [state]);

  function goHome(query: string) {
    activeRequest.current?.abort();
    activeRequest.current = null;
    setState({ kind: "home", query });
    setAnswer("");
    requestAnimationFrame(() => document.getElementById("query")?.focus());
  }

  function edit() {
    goHome(state.query);
  }

  async function search(raw: string) {
    const query = raw.trim();
    if (!query) return;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setAnswer("");
    setState({ kind: "loading", query });

    let next: SearchState;
    try {
      const response = await fetch("/api/product-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
        signal: controller.signal,
      });
      const data: unknown = await response.json();
      next = { kind: "result", query, result: productSearchResultSchema.parse(data) };
    } catch {
      next = { kind: "error", query };
    }
    if (controller.signal.aborted) return;
    activeRequest.current = null;
    if (next.kind === "result" && next.result.kind === "web" && next.result.picks.length) {
      onSearchComplete(query, next.result);
    }
    setState(next);
  }

  const { query } = state;
  const result = state.kind === "result" ? state.result : null;
  const searchResult = result?.kind === "web" || result?.kind === "demo" ? result : null;
  const comparison = searchResult?.picks.length ? searchResult : null;
  const recoveryMessage = state.kind === "error"
    ? "เชื่อมต่อการค้นหาไม่ได้ กรุณาลองอีกครั้ง"
    : result?.kind === "unavailable" ? result.message : searchResult?.note;
  const phase = state.kind === "home" ? "home"
    : state.kind === "loading" ? "search"
    : result?.kind === "clarify" ? "clarify"
    : comparison ? "result"
    : "unsupported";

  return (
    <main className={phase === "unsupported" ? "phone" : "phone " + phase} data-font={fontTheme}>
      <Mascot phase={phase} />
      {phase === "home" && (
        <HomeForm
          initial={query}
          onSubmit={search}
          history={history.length > 0 && (
            <HomeHistory
              items={history}
              onOpen={(entry) => setState({ kind: "result", query: entry.query, result: entry.response })}
            />
          )}
        />
      )}
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
            if (answer.trim()) void search(query + "\n" + result.question + "\nคำตอบ: " + answer.trim());
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
      {comparison && <Results result={liveResult(query, comparison)} onReset={() => goHome("")} onBack={edit} onConditions={() => {}} />}
      {phase === "unsupported" && <section className="unsupported">
        <h1 ref={heading} tabIndex={-1}>{searchResult ? "ยังไม่มีรุ่นที่ยืนยันได้" : "ยังตรวจเรื่องนี้ไม่ได้"}</h1>
        {searchResult && <span className="demo-label">{searchResult.kind === "demo" ? "โหมดกฎ · ข้อมูลเดโม" : "ค้นจากเว็บ"}</span>}
        <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>คำค้น: {query}</p>
        {recoveryMessage && <p role={state.kind === "error" ? "alert" : undefined}>{recoveryMessage}</p>}
        <button className="primary" type="button" onClick={() => void search(query)}>ลองค้นอีกครั้ง</button>
        <button className="primary secondary" type="button" onClick={edit}>แก้โจทย์</button>
      </section>}
    </main>
  );
}
