"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  productSearchResultSchema,
  type ProductSearchResult,
  type ProductPick,
} from "@/lib/product-search/contract";
import Image from "next/image";
import HomeForm from "./HomeForm";
import Mascot from "./Mascot";
import "./product-search.css";

type SearchState =
  | { kind: "home" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "result"; result: ProductSearchResult };

function Pick({
  pick,
  rank,
  demo,
}: {
  pick: ProductPick;
  rank: number;
  demo: boolean;
}) {
  const price = pick.price;
  return (
    <article className="product-pick">
      <span className="pick-rank">อันดับ {rank}</span>
      <h2>
        <a href={pick.url} target="_blank" rel="noreferrer">
          {pick.model} ↗
        </a>
      </h2>
      {price ? (
        <div className="pick-price">
          <a href={price.url} target="_blank" rel="noreferrer">
            ฿{price.baht.toLocaleString("th-TH")} ·{" "}
            {demo ? "ดูข้อมูลเดโม" : "ดูแหล่งราคา"} ↗
          </a>
          {demo ? (
            <p>ราคาในชุดข้อมูลสังเคราะห์สำหรับเดโม</p>
          ) : (
            <>
              <p>
                พบราคาเมื่อ{" "}
                {new Date(price.observedAt).toLocaleString("th-TH", {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
            </>
          )}
        </div>
      ) : (
        <p className="pick-unknown">ราคา · ข้อมูลไม่พอ</p>
      )}
      <h3>เหตุผลที่ตรงโจทย์</h3>
      {pick.reasons.length ? (
        <ul>
          {pick.reasons.map((reason, index) => (
            <li key={index}>
              {reason.text}{" "}
              <a href={reason.url} target="_blank" rel="noreferrer">
                {demo ? "ดูข้อมูลเดโม" : "แหล่งข้อมูล"} ↗
              </a>
            </li>
          ))}
        </ul>
      ) : (
        <p>ยังไม่มีหลักฐานยืนยันเหตุผลรายข้อ</p>
      )}
      {pick.unknowns.length > 0 && (
        <>
          <h3>ข้อจำกัดและข้อมูลที่ยังขาด</h3>
          <ul>
            {pick.unknowns.map((unknown, index) => (
              <li key={index}>{unknown}</li>
            ))}
          </ul>
        </>
      )}
      <p className="pick-review">หลักฐานรีวิว · ข้อมูลไม่พอ</p>
    </article>
  );
}

export default function SearchHome({
  fontTheme,
  initialQuery = "",
  history,
}: {
  fontTheme: "ibm" | "line";
  initialQuery?: string;
  history?: ReactNode;
}) {
  const [state, setState] = useState<SearchState>({
    kind: initialQuery ? "loading" : "home",
  });
  const [query, setQuery] = useState(initialQuery);
  const [answer, setAnswer] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (state.kind !== "loading") {
      heading.current?.focus();
      return;
    }
    const controller = new AbortController();
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
        next = {
          kind: "result",
          result: productSearchResultSchema.parse(data),
        };
      } catch {
        next = { kind: "error", message: "เชื่อมต่อการค้นหาไม่ได้ กรุณาลองอีกครั้ง" };
      }
      if (!controller.signal.aborted)
        setState((current) => (current === state ? next : current));
    }
    void load();
    return () => controller.abort();
  }, [state, query]);

  function edit() {
    setState({ kind: "home" });
    setAnswer("");
  }
  function search(raw: string) {
    const next = raw.trim();
    if (!next) return;
    setQuery(next);
    setAnswer("");
    setState({ kind: "loading" });
  }
  const result = state.kind === "result" ? state.result : null;
  return (
    <main
      className={
        "phone product-search " +
        (state.kind === "home" ? "home" : "search-detail")
      }
      data-font={fontTheme}
    >
      {state.kind === "home" ? (
        <>
          <Mascot phase="home" />
          <HomeForm initial={query} history={history} onSubmit={search} />
        </>
      ) : (
        <div className="search-content">
          <button className="search-edit" type="button" onClick={edit}>
            ← แก้โจทย์
          </button>
          <p className="search-query">{query}</p>
          {state.kind === "loading" && (
            <section className="search-progress">
              <Image src="/assets/search.png" width="120" height="120" alt="" />
              <div role="status">
                <h1>กำลังค้นหาสินค้าจากเว็บ</h1>
                <p>กำลังตรวจรุ่น ราคา และหลักฐานที่ตรงโจทย์</p>
              </div>
              <button
                className="primary secondary"
                type="button"
                onClick={edit}
              >
                ยกเลิกการค้นหา
              </button>
            </section>
          )}
          {state.kind === "error" && (
            <section className="search-message">
              <h1 ref={heading} tabIndex={-1}>
                ค้นหายังไม่สำเร็จ
              </h1>
              <p role="alert">{state.message}</p>
              <button className="primary" onClick={() => search(query)}>
                ลองค้นอีกครั้ง
              </button>
            </section>
          )}
          {result?.kind === "clarify" && (
            <section className="search-message">
              <h1 ref={heading} tabIndex={-1}>
                ขอข้อมูลเพิ่มอีกนิด
              </h1>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  if (answer.trim())
                    search(
                      query +
                        "\n" +
                        result.question +
                        "\nคำตอบ: " +
                        answer.trim(),
                    );
                }}
              >
                <label htmlFor="search-answer">{result.question}</label>
                <textarea
                  id="search-answer"
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  rows={3}
                  required
                />
                <button className="primary" disabled={!answer.trim()}>
                  ค้นหาตามคำตอบนี้
                </button>
              </form>
            </section>
          )}
          {result?.kind === "unavailable" && (
            <section className="search-message">
              <h1 ref={heading} tabIndex={-1}>
                ยังค้นหาโจทย์นี้ไม่ได้
              </h1>
              <p>{result.message}</p>
              <button className="primary" onClick={() => search(query)}>
                ลองค้นอีกครั้ง
              </button>
            </section>
          )}
          {(result?.kind === "web" || result?.kind === "demo") && (
            <section className="search-results">
              <span className="search-mode">
                {result.kind === "web" ? "ค้นจากเว็บ" : "โหมดกฎ · ข้อมูลเดโม"}
              </span>
              <h1 ref={heading} tabIndex={-1}>
                {result.picks.length
                  ? `พบ ${result.picks.length} รุ่นที่มีหลักฐาน`
                  : "ยังไม่พบรุ่นที่ยืนยันได้"}
              </h1>
              <p className="search-note">{result.note}</p>
              <div className="product-picks">
                {result.picks.map((pick, index) => (
                  <Pick
                    key={pick.url + pick.model}
                    pick={pick}
                    rank={index + 1}
                    demo={result.kind === "demo"}
                  />
                ))}
              </div>
              <button className="primary secondary" onClick={edit}>
                ปรับโจทย์แล้วค้นหาใหม่
              </button>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
