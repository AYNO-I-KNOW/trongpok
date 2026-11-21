"use client";

import Link from "next/link";
import { money, outboundLink, safeQuotes, statusText, trustText } from "@/lib/ui/presentation";
import { useSavedRun } from "./results";
import { EmptyState, EvidenceFooter, ModeBadge, ProductArt } from "./shared";

export function ProductDetail({ id, runId }: { id: string; runId: string }) {
  const { run, loaded } = useSavedRun(runId);
  if (!loaded) return <main className="loading-state" role="status">กำลังเปิดหลักฐาน…</main>;
  const product = run?.products.find((item) => item.id === id);
  const row = run?.result.ranked.find((item) => item.productId === id);
  if (!run || !product || !row) return <EmptyState title="ไม่พบสินค้านี้ในผลเปรียบเทียบ" text="เปิดรายละเอียดจากหน้าผลเปรียบเทียบในแท็บเดิม หรือเริ่มเปรียบเทียบใหม่" />;
  return <main className="detail-main"><Link className="text-button back-link" href={`/results?run=${encodeURIComponent(run.id)}`}>← กลับไปดูตัวเลือกทั้งหมด</Link><div className="detail-header"><ProductArt product={product} /><div><ModeBadge preview={run.preview} mode={run.result.mode} /><h1>{product.title}</h1><div className="detail-price"><strong>฿{money(product.priceThb)}</strong><span className="star-rating">★ {product.stars.toFixed(1)} ({money(product.ratingCount)})</span><span className="fit-pill">เหมาะ {row.fitPct}%</span></div><p>ความตรงปก: <strong>{trustText(product, row)}</strong></p>{!run.preview && <a className="text-button" href={outboundLink(product)} target="_blank" rel="noopener noreferrer">ดูสินค้าที่ Shopee ↗</a>}</div></div>
    {run.preview && <p className="preview-notice">หลักฐานด้านล่างเป็นรีวิวจำลองสำหรับทดลองหน้าจอ ไม่ใช่ประสบการณ์ของผู้ซื้อจริง</p>}
    <section className="evidence-section"><p className="eyebrow">ดูที่มาของคำตอบ</p><h2>ตรงกับความต้องการแค่ไหน</h2><div className="evidence-list">{row.requirements.map((item) => {
      const requirement = run.result.requirements.find((candidate) => candidate.id === item.requirementId);
      const quotes = safeQuotes(product, item.quotes);
      const spec = requirement?.kind === "budget" ? product.priceThb : requirement?.spec ? product.specs[requirement.spec.key] : undefined;
      const displaySpec = typeof spec === "boolean" ? spec ? "รองรับ" : "ไม่รองรับ" : Array.isArray(spec) ? spec.join(", ") : spec;
      return <article className="evidence-card" key={item.requirementId}><div className="evidence-heading"><div><small>{requirement?.kind === "must" ? "จำเป็น" : requirement?.kind === "budget" ? "งบประมาณ" : "มีก็ดี"}</small><h3>{requirement?.text ?? item.requirementId}</h3></div><span className={`status-chip ${item.status}`}>{statusText[item.status]}</span></div><div className="evidence-metrics"><span>สเปก / ราคา: <strong>{displaySpec ?? "ยังไม่มีข้อมูล"}</strong></span><span>ยืนยัน <strong>{quotes.filter((label) => label.stance === "confirm").length}</strong></span><span>ขัดแย้ง <strong>{quotes.filter((label) => label.stance === "contradict").length}</strong></span></div>{quotes.length ? <div className="review-quotes">{quotes.slice(0, 3).map((label) => <blockquote key={`${label.reviewId}-${label.subjectId}`} className={label.stance === "contradict" ? "negative" : ""}><p>“{label.quote}”</p><footer><span>★ {product.reviews.find((review) => review.id === label.reviewId)?.stars}/5</span><span>{label.stance === "confirm" ? "สนับสนุนเงื่อนไข" : "ขัดแย้งกับเงื่อนไข"}</span></footer></blockquote>)}</div> : <p className="no-evidence">ยังไม่มีข้อความรีวิวที่ใช้ยืนยันเงื่อนไขนี้</p>}</article>;
    })}</div></section>
    <div className="detail-bottom-grid"><section className="detail-panel"><h2>คำโฆษณาของสินค้า</h2>{product.claims.length ? product.claims.map((claim) => <div className="claim-row" key={claim.id}><strong>{claim.text}</strong><small>ที่มา: {claim.source}</small><span>{claim.checkable ? "ยังไม่มีผลตรวจคำโฆษณาแยกรายข้อในผลรอบนี้" : "ตรวจสอบจากรีวิวไม่ได้"}</span></div>) : <p>ไม่มีคำโฆษณาที่นำมาตรวจในข้อมูลรอบนี้</p>}</section><section className="detail-panel"><h2>ข้อมูลร้านค้า</h2><h3>{product.shop.name}</h3><dl className="shop-breakdown"><div><dt>เปิดมาแล้ว</dt><dd>{product.shop.years} ปี</dd></div><div><dt>อัตรารีวิวไม่ดีของร้าน</dt><dd>{product.shop.badRatePct}%</dd></div><div><dt>อัตราตอบแชต</dt><dd>{product.shop.chatResponsePct}%</dd></div><div><dt>สถานะร้าน</dt><dd>{product.shop.official ? "ร้านทางการ" : product.shop.preferredPlus ? "Preferred Plus" : product.shop.verified ? "ยืนยันแล้ว" : "ไม่ระบุ"}</dd></div></dl></section></div><EvidenceFooter />
  </main>;
}
