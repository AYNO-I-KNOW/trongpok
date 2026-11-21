"use client";
import { useState, type ReactNode } from "react";
import Image from "next/image";
import type { ArenaResult } from "@/lib/types";
import FitPill from "./FitPill";
export type CatalogProduct = {
  id: string;
  title: string;
  priceThb: number;
  imageUrl: string;
  shopeeUrl: string;
  outboundUrl: string;
  stars: number;
  ratingCount: number;
  shopName: string;
};
const statusText = {
  pass: "ผ่าน",
  fail: "ไม่ผ่าน",
  contradicted: "มีหลักฐานขัดแย้ง",
  mixed: "หลักฐานผสม",
  "spec-only": "ยืนยันเฉพาะสเปก",
  unknown: "ข้อมูลไม่พอ",
};
export default function ArenaResults({
  result,
  products,
  onBack,
  onReset,
}: {
  result: ArenaResult;
  products: CatalogProduct[];
  onBack: () => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const items = result.ranked.slice(0, 3).map((ranked) => ({
    ranked,
    product: products.find((product) => product.id === ranked.productId),
  }));
  function row(
    label: string,
    render: (item: (typeof items)[number]) => ReactNode,
  ) {
    return (
      <tbody key={label}>
        <tr className="row-label">
          <td colSpan={items.length}>{label}</td>
        </tr>
        <tr>
          {items.map((item) => (
            <td key={item.ranked.productId}>{render(item)}</td>
          ))}
        </tr>
      </tbody>
    );
  }
  function section(key: string, title: string, content: ReactNode) {
    const expanded = open === key;
    return (
      <tbody className="result-section-toggle">
        <tr>
          <td colSpan={items.length}>
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={"result-panel-" + key}
              onClick={() => setOpen(expanded ? null : key)}
            >
              {title}
              <span aria-hidden="true">⌄</span>
            </button>
          </td>
        </tr>
        <tr>
          <td colSpan={items.length}>
            <div
              id={"result-panel-" + key}
              className="result-detail-panel"
              data-expanded={expanded}
              inert={!expanded}
            >
              <div className="result-detail-clip">
                <table className="comparison" aria-label={title}>
                  {content}
                </table>
              </div>
            </div>
          </td>
        </tr>
      </tbody>
    );
  }
  return (
    <section className="results results-compare">
      <nav className="result-topbar" aria-label="การนำทางผลลัพธ์">
        <button
          className="back"
          type="button"
          onClick={onBack}
          aria-label="กลับหน้าแรก"
        >
          ←
        </button>
        <button
          className="result-reset"
          type="button"
          onClick={onReset}
          aria-label="เริ่มใหม่"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
            <path d="M3 3v5h5" />
          </svg>
        </button>
      </nav>
      <header className="result-heading">
        <h1>เครื่องปั่นที่เหมาะกับคุณ</h1>
        <p>เรียงตามความเหมาะกับโจทย์และหลักฐานรีวิว</p>
        <span className="demo-label">
          {result.mode === "rules"
            ? "โหมดกฎ"
            : result.mode === "cache"
              ? "ผลจากแคช"
              : "โหมด AI"}
        </span>
      </header>
      {!items.length ? (
        <p>ยังไม่มีสินค้าที่ประเมินได้ ลองแก้โจทย์อีกครั้ง</p>
      ) : (
        <table className="comparison" aria-label="เปรียบเทียบรุ่นตามโจทย์">
          <thead>
            <tr>
              {items.map(({ ranked, product }, index) => (
                <th
                  scope="col"
                  key={ranked.productId}
                  data-product-id={ranked.productId}
                  data-recommendation-rank={index + 1}
                >
                  <div className="rank-slot">
                    <Image
                      className="rank-mascot"
                      src={
                        "/assets/trong-pok-agent-rank-" + (index + 1) + ".svg"
                      }
                      alt={"อันดับ " + (index + 1)}
                      width={92}
                      height={80}
                    />
                  </div>
                  <div className="product-image">
                    {product?.imageUrl ? (
                      <Image
                        src={product.imageUrl}
                        alt={product.title}
                        width={104}
                        height={120}
                        unoptimized
                      />
                    ) : (
                      <span>ไม่มีภาพสินค้า</span>
                    )}
                  </div>
                  <h2>{product?.title ?? ranked.productId}</h2>
                  <div className="header-price">
                    {product
                      ? "฿" + product.priceThb.toLocaleString("th-TH")
                      : "ข้อมูลไม่พอ"}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="fit-label">
            <tr className="fit-score-row">
              {items.map(({ ranked }, index) => (
                <td key={ranked.productId} data-product-id={ranked.productId}>
                  <FitPill
                    value={ranked.fitPct}
                    tone={
                      index === 0 ? "high" : index === 2 ? "low" : "pending"
                    }
                    label={"เหมาะ " + ranked.fitPct + " เปอร์เซ็นต์"}
                  />
                </td>
              ))}
            </tr>
          </tbody>
          <tbody className="purchase-section">
            <tr className="purchase-row">
              {items.map(({ ranked, product }) => (
                <td key={ranked.productId}>
                  {product?.outboundUrl ? (
                    <a
                      className="product-action"
                      href={product.outboundUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {product.shopeeUrl ? "ดูสินค้า" : "ค้นหาบน Shopee"} ↗
                    </a>
                  ) : (
                    <span className="purchase-note">ไม่มีลิงก์ซื้อ</span>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
          {row("เหตุผล", ({ ranked }) => ranked.why || "ข้อมูลไม่พอ")}
          {row("ข้อแลกเปลี่ยน", ({ ranked }) => ranked.tradeoff || "ข้อมูลไม่พอ")}
          {row("ตรงปก", ({ ranked }) =>
            ranked.trust === null
              ? "ข้อมูลไม่พอ"
              : Math.round(ranked.trust * 100) + "%",
          )}
          {row("ประหยัดเทียบรุ่นอ้างอิง", ({ ranked }) =>
            ranked.savings === null
              ? "ข้อมูลไม่พอ"
              : "฿" + ranked.savings.toLocaleString("th-TH"),
          )}
          {section(
            "usage",
            "วิธีใช้และข้อจำกัด",
            <>
              {result.requirements.map((requirement) =>
                row(requirement.text, ({ ranked }) => {
                  const evidence = ranked.requirements.find(
                    (item) => item.requirementId === requirement.id,
                  );
                  return (
                    <>
                      <strong>
                        {evidence ? statusText[evidence.status] : "ข้อมูลไม่พอ"}
                      </strong>
                      {evidence?.message && <p>{evidence.message}</p>}
                      {evidence?.quotes.map((quote, index) => (
                        <blockquote key={index}>{quote.quote}</blockquote>
                      ))}
                    </>
                  );
                }),
              )}
              {row("ปริมาณตามคู่มือ", () => "ข้อมูลไม่พอ")}
              {row("เงื่อนไขที่ต้องทำตาม", () => "ข้อมูลไม่พอ")}
            </>,
          )}
          {section(
            "evidence",
            "เหตุผลและหลักฐาน",
            <>
              {row("ข้อทักท้วงจาก Skeptic", ({ ranked }) =>
                ranked.objections.length
                  ? ranked.objections.map((quote, index) => (
                      <blockquote key={index}>{quote.quote}</blockquote>
                    ))
                  : "ไม่มีข้อทักท้วงในหลักฐานที่ตรวจได้",
              )}
              {row(
                "คุณภาพรีวิว",
                ({ ranked }) =>
                  ranked.reviewQualityWarning?.message || "ไม่มีคำเตือนเพิ่มเติม",
              )}
              {row("หลักฐานจากคู่มือ", () => "ข้อมูลไม่พอ")}
              {row("คลิป: สิ่งที่เห็นและยังไม่ยืนยัน", () => "ข้อมูลไม่พอ")}
              {row("สิ่งที่เห็นในรูป", () => "ข้อมูลไม่พอ")}
            </>,
          )}
          {section(
            "stores",
            "ร้านค้า ประกัน และรีวิว",
            <>
              {row("ร้านค้า", ({ product }) => product?.shopName || "ข้อมูลไม่พอ")}
              {row("คะแนนและจำนวนรีวิวในชุดข้อมูล", ({ product }) =>
                product
                  ? `${product.stars} / 5 · ${product.ratingCount} รีวิว`
                  : "ข้อมูลไม่พอ",
              )}
              {[
                "ที่มาของราคา",
                "การคืนสินค้า",
                "ประกัน",
                "รีวิวสินค้า",
                "รีวิวบริการ",
                "รีวิวจัดส่ง",
              ].map((label) => row(label, () => "ข้อมูลไม่พอ"))}
            </>,
          )}
        </table>
      )}
    </section>
  );
}
