"use client";

import type { Product, Ranked } from "@/lib/types";
import type { RunRecord } from "@/lib/ui/contracts";
import { money, outboundLink, safeQuotes, statusText, trustText } from "@/lib/ui/presentation";
import EvidenceSheet from "@/ui/trong-pok/components/EvidenceSheet";

export function ProductEvidence({ product, row, rank, run, onClose }: {
  product: Product;
  row: Ranked;
  rank: number;
  run: RunRecord;
  onClose: () => void;
}) {
  const objections = safeQuotes(product, row.objections);
  return <EvidenceSheet open title={product.title} eyebrow="หลักฐานและรีวิวสังเคราะห์" onClose={onClose}>
    <section className="evidence-decision">
      <h3>เหตุผลอันดับ {rank}</h3>
      <p>เหมาะ {row.fitPct}% · {product.stars.toFixed(1)} ดาว ({money(product.ratingCount)} รีวิว) · ฿{money(product.priceThb)}</p>
      {row.why && <p>{row.why}</p>}
      {row.tradeoff && <p>{row.tradeoff}</p>}
      <p>ความตรงปก: {trustText(product, row)}</p>
      {row.reviewQualityWarning && <p>{row.reviewQualityWarning.message}</p>}
    </section>
    {run.result.requirements.map((requirement) => {
      const assessment = row.requirements.find((item) => item.requirementId === requirement.id);
      const quotes = safeQuotes(product, assessment?.quotes ?? []);
      const spec = requirement.kind === "budget" ? product.priceThb
        : requirement.spec ? product.specs[requirement.spec.key] : undefined;
      const displaySpec = typeof spec === "boolean" ? spec ? "รองรับ" : "ไม่รองรับ"
        : Array.isArray(spec) ? spec.join(", ") : spec;
      return <section className="evidence-card" key={requirement.id}>
        <h3>{requirement.text}</h3>
        <p>{statusText[assessment?.status ?? "unknown"]} · สเปก / ราคา: {displaySpec ?? "ยังไม่มีข้อมูล"}</p>
        {quotes.length ? quotes.slice(0, 3).map((label) => <blockquote key={`${label.reviewId}-${label.subjectId}`}>
          <p>“{label.quote}”</p><footer className="eyebrow">{label.stance === "confirm" ? "สนับสนุนเงื่อนไข" : "ขัดแย้งกับเงื่อนไข"}</footer>
        </blockquote>) : <p className="evidence-gap">ยังไม่มีข้อความรีวิวที่ใช้ยืนยันเงื่อนไขนี้</p>}
      </section>;
    })}
    {objections.length > 0 && <section>
      <h3>ข้อสังเกตจาก Skeptic</h3>
      {objections.map((label) => <p key={`${label.reviewId}-${label.subjectId}`}>“{label.quote}”</p>)}
    </section>}
    <section>
      <h3>คำโฆษณาของสินค้า</h3>
      {product.claims.length ? product.claims.map((claim) => <div key={claim.id}>
        <p>{claim.text}</p><p className="evidence-gap">{claim.checkable ? "ยังไม่มีผลตรวจคำโฆษณาแยกรายข้อในรอบนี้" : "ตรวจสอบจากรีวิวไม่ได้"}</p>
      </div>) : <p className="evidence-gap">ไม่มีคำโฆษณาที่นำมาตรวจในข้อมูลรอบนี้</p>}
    </section>
    <section>
      <h3>ข้อมูลร้านค้า</h3>
      <p>{product.shop.name} · เปิดมาแล้ว {product.shop.years} ปี</p>
      <p>อัตรารีวิวไม่ดี {product.shop.badRatePct}% · อัตราตอบแชต {product.shop.chatResponsePct}%</p>
      <p>{product.shop.official ? "ร้านทางการ" : product.shop.preferredPlus ? "Preferred Plus" : product.shop.verified ? "ยืนยันแล้ว" : "สถานะร้าน: ไม่ระบุ"}</p>
      {!run.preview && <a href={outboundLink(product)} target="_blank" rel="noopener noreferrer">ดูสินค้าที่ Shopee ↗</a>}
    </section>
  </EvidenceSheet>;
}
