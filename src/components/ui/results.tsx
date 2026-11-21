"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Product, Ranked } from "@/lib/types";
import type { RunRecord } from "@/lib/ui/contracts";
import { comparisonProduct, money, outboundLink, safeQuotes, statusText, trustText } from "@/lib/ui/presentation";
import { readRun } from "@/lib/ui/storage";
import { EmptyState, EvidenceFooter, ModeBadge, ProductArt } from "./shared";

export function useSavedRun(id: string) {
  const [state, setState] = useState<{ loaded: boolean; run: RunRecord | null }>({ loaded: false, run: null });
  useEffect(() => {
    let alive = true;
    void Promise.resolve().then(() => { if (alive) setState({ loaded: true, run: readRun(id) }); });
    return () => { alive = false; };
  }, [id]);
  return state;
}

function MustBadge({ row }: { row: Ranked }) {
  const uncertain = row.requirements.some((requirement) => ["unknown", "mixed", "spec-only"].includes(requirement.status));
  return <span className={`must-badge ${row.mustOk ? "ok" : "no"}`}>{row.mustOk ? uncertain ? "ยังไม่พบข้อจำเป็นที่ไม่ผ่าน · มีข้อมูลรอยืนยัน" : "✓ ผ่านเงื่อนไขจำเป็น" : "มีเงื่อนไขจำเป็นที่ไม่ผ่าน"}</span>;
}

function TopPick({ product, row, run }: { product: Product; row: Ranked; run: RunRecord }) {
  const comparison = comparisonProduct(run.products, product);
  const objections = safeQuotes(product, row.objections);
  const uncertain = row.requirements.filter((item) => item.status === "unknown" || item.status === "spec-only");
  return <article className="top-pick"><div className="top-product-visual"><span className="pick-tag">01 / ตัวเลือกที่เหมาะที่สุดในรอบนี้</span><ProductArt product={product} large /><div className="visual-price"><span>{product.brand}</span><strong>฿{money(product.priceThb)}</strong></div></div>
    <div className="top-product-body"><div className="pick-meta"><span className="eyebrow">ตัวเลือกอันดับ 1</span><span className="star-rating">★ {product.stars.toFixed(1)} <small>({money(product.ratingCount)})</small></span></div><h2>{product.title}</h2><MustBadge row={row} />
      <div className="fit-score"><div><strong>{row.fitPct}<span>%</span></strong><span>เหมาะกับโจทย์ของคุณ</span></div><div className="trust-score"><span>ความตรงปก</span><strong>{trustText(product, row)}</strong></div></div>
      <p className="judge-why">{row.why || "เรียงตามความเหมาะสม งบประมาณ และหลักฐานที่มี"}</p>
      <ul className="requirement-summary">{row.requirements.map((item) => <li key={item.requirementId}><span className={`status-indicator ${item.status}`}>{["pass"].includes(item.status) ? "✓" : ["fail", "contradicted"].includes(item.status) ? "×" : "○"}</span><span>{run.result.requirements.find((requirement) => requirement.id === item.requirementId)?.text ?? item.requirementId}</span><small>{statusText[item.status]}</small></li>)}</ul>
      {row.tradeoff && <p className="tradeoff"><strong>สิ่งที่แลกมา</strong> {row.tradeoff}</p>}
      {row.reviewQualityWarning && <p className="preview-notice">{row.reviewQualityWarning.message} ({row.reviewQualityWarning.percent.toFixed(0)}%)</p>}
      {uncertain.length > 0 && <p className="tradeoff"><strong>สิ่งที่ยังต้องเช็ก</strong> {uncertain.map((item) => run.result.requirements.find((requirement) => requirement.id === item.requirementId)?.text).filter(Boolean).join(" · ")}</p>}
      {objections[0] && <div className="objection-box"><span>◈ มองอีกด้าน</span><blockquote>“{objections[0].quote}”</blockquote></div>}
      {row.mustOk && row.savings !== null && row.savings > 0 && comparison && <div className="savings-box"><strong>↘ ประหยัด ฿{money(row.savings)}</strong><span>เมื่อเทียบกับ {comparison.title} รุ่นที่ได้ดาวสูงสุดในตัวเลือกอื่น</span>{row.unusedFeatures.length > 0 && <small>ฟีเจอร์ของรุ่นดาวสูงสุดที่อาจไม่ได้ใช้: {row.unusedFeatures.join(" · ")}</small>}</div>}
      <div className="pick-actions"><Link className="button primary" href={`/p/${product.id}?run=${encodeURIComponent(run.id)}`}>ดูหลักฐานทั้งหมด <span aria-hidden="true">↗</span></Link>{!run.preview && <a className="text-button" href={outboundLink(product)} target="_blank" rel="noopener noreferrer">ดูสินค้าที่ Shopee ↗</a>}</div><EvidenceFooter />
    </div></article>;
}

export function Results({ runId }: { runId: string }) {
  const { run, loaded } = useSavedRun(runId);
  if (!loaded) return <main className="loading-state" role="status">กำลังเปิดผลเปรียบเทียบ…</main>;
  if (!run) return <EmptyState title="ยังไม่พบผลเปรียบเทียบนี้" text="ผลจะเก็บไว้ในแท็บที่เริ่มเปรียบเทียบเป็นเวลา 24 ชั่วโมง กรุณาเริ่มรอบใหม่หากเปิดจากอุปกรณ์หรือแท็บอื่น" />;
  const picks = run.result.ranked.flatMap((row) => {
    const product = run.products.find((item) => item.id === row.productId);
    return product ? [{ row, product }] : [];
  });
  if (!picks.length) return <EmptyState title="ยังไม่มีตัวเลือกที่เปรียบเทียบได้" text="ลองเปลี่ยนหมวดหรือปรับความต้องการ แล้วเปรียบเทียบอีกครั้ง" />;
  const linked = run.products.find((item) => item.id === run.linkedProductId);
  const linkedRow = run.result.ranked.find((row) => row.productId === run.linkedProductId);
  const failed = linkedRow?.requirements.filter((item) => ["fail", "contradicted"].includes(item.status)) ?? [];
  return <main className="results-main"><Link className="text-button back-link" href="/">← เปลี่ยนความต้องการ</Link><div className="flow-heading"><div><p className="eyebrow">คำตอบสำหรับการใช้งานของคุณ</p><h1>เลือกจากความเหมาะ<span className="green-period">.</span></h1><p>เปรียบเทียบแล้ว {picks.length} ตัวเลือก พร้อมเหตุผลที่ตรวจสอบได้</p></div><ModeBadge preview={run.preview} mode={run.result.mode} /></div>
    {run.preview && <p className="preview-notice">นี่คือการทดลองหน้าจอด้วยสินค้า ราคา และรีวิวจำลอง ใช้เพื่อดูการทำงานของระบบเท่านั้น</p>}
    {linked && linked.id !== picks[0].product.id && <aside className="linked-warning"><strong>สินค้าที่คุณเล็ง: {linked.title}</strong><p>{failed.length ? `ยังไม่ผ่าน: ${failed.map((item) => run.result.requirements.find((requirement) => requirement.id === item.requirementId)?.text).filter(Boolean).join(" · ")}` : linkedRow ? "มีตัวเลือกอื่นได้อันดับสูงกว่าตามโจทย์นี้" : "ยังไม่ได้รับผลตรวจสินค้าที่คุณเล็ง จึงยังสรุปว่าผ่านหรือไม่ผ่านไม่ได้"}</p>{linkedRow && safeQuotes(linked, failed.flatMap((item) => item.quotes)).slice(0, 2).map((label) => <blockquote key={`${label.reviewId}-${label.subjectId}`}>“{label.quote}”</blockquote>)}</aside>}
    <TopPick {...picks[0]} run={run} />
    {picks.length > 1 && <section className="alternatives"><div className="section-heading"><h2>ตัวเลือกอื่นที่น่าพิจารณา</h2><span>ความเหมาะสมขึ้นอยู่กับโจทย์ที่คุณเลือก</span></div><div className="alternatives-grid">{picks.slice(1, 4).map(({ row, product }, index) => <article className="small-pick" key={product.id}><div className="small-pick-image"><span className="rank-number">0{index + 2}</span><ProductArt product={product} /></div><div className="small-pick-body"><div className="small-fit"><span>เหมาะ {row.fitPct}%</span><span className="star-rating">★ {product.stars.toFixed(1)}</span></div><h3>{product.title}</h3><strong className="small-price">฿{money(product.priceThb)}</strong><MustBadge row={row} /><p>{row.why || "ดูรายละเอียดเพื่อเทียบหลักฐานแต่ละเงื่อนไข"}</p><Link href={`/p/${product.id}?run=${encodeURIComponent(run.id)}`} className="text-button">ดูรายละเอียด <span aria-hidden="true">↗</span></Link><EvidenceFooter /></div></article>)}</div></section>}
    <p className="results-note">คะแนนนี้สรุปจากเงื่อนไขและหลักฐานที่มีในรอบนี้ ข้อมูลที่ยังไม่รู้ไม่ได้หมายความว่าสินค้าผ่าน คุณเป็นคนตัดสินใจขั้นสุดท้าย</p></main>;
}
