"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import FitPill from "./FitPill";

export type ComparisonColumn = {
  id: string;
  title: string;
  price: string;
  image?: string;
  placeholder?: ReactNode;
  rank?: number;
  context?: string;
  fit: { value: number; label: string; tone: "high" | "low" | "pending" };
  action: ReactNode;
};

export function ComparisonResults({ headline, reason, notice, mock, onBack, onReset, children }: {
  headline: string;
  reason: string;
  notice?: ReactNode;
  mock?: boolean;
  onBack: () => void;
  onReset: () => void;
  children: ReactNode;
}) {
  return <section className={`results results-compare${mock ? " mock-result" : ""}`}>
    <nav className="result-topbar" aria-label="การนำทางผลลัพธ์">
      <button className="back" type="button" onClick={onBack} aria-label="กลับหน้าแรก">←</button>
      <button className="result-reset" type="button" onClick={onReset} aria-label="เริ่มใหม่">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
      </button>
    </nav>
    <header className="result-heading"><h1>{headline}</h1><p>{reason}</p>{notice}</header>
    {children}
  </section>;
}

export function ComparisonTable({ columns, children }: { columns: ComparisonColumn[]; children: ReactNode }) {
  const purchaseRow = useRef<HTMLTableSectionElement>(null);
  const [showPinnedProducts, setShowPinnedProducts] = useState(false);

  useEffect(() => {
    const row = purchaseRow.current;
    if (!row || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(([entry]) => {
      setShowPinnedProducts(entry.boundingClientRect.bottom <= (entry.rootBounds?.top ?? 0));
    }, { rootMargin: "-64px 0px 0px" });
    observer.observe(row);
    return () => observer.disconnect();
  }, []);

  return <>
    {showPinnedProducts && <div className="pinned-products" aria-hidden="true">
      {columns.map(({ id, title, price }) => <div className="pinned-product" key={id}>
        <span className="pinned-product-name">{title}</span><span className="pinned-product-price">{price}</span>
      </div>)}
    </div>}
    <table className="comparison" aria-label="เปรียบเทียบรุ่นตามโจทย์">
      <thead><tr>{columns.map(({ id, title, price, rank, context, image, placeholder }, index) => {
        const [brand, ...model] = title.split(" ");
        return <th scope="col" key={id} data-product-id={id} data-recommendation-rank={rank ?? ""}>
          <div className="rank-slot">{index < 3 && <img className="rank-mascot" src={`/assets/trong-pok-agent-rank-${index + 1}.svg`}
            alt={`คอลัมน์ ${index + 1}`} width="92" height="80" />}</div>
          <div className="product-image">{image ? <img src={image} alt={title} width="104" height="120" /> : placeholder}</div>
          <h2>{model.length ? <><span className="product-brand">{brand}</span>{" "}<span className="product-sku">{model.join(" ")}</span></> : title}</h2>
          <div className="header-price">{price}</div><span className="model-context">{context}</span>
        </th>;
      })}</tr></thead>
      <tbody className="fit-label"><tr className="fit-score-row">
        {columns.map(({ id, fit }) => <td key={id} data-product-id={id}><FitPill {...fit} /></td>)}
      </tr></tbody>
      <tbody className="purchase-section" ref={purchaseRow}><tr className="purchase-row">
        {columns.map(({ id, action }) => <td key={id} data-product-id={id}>{action}</td>)}
      </tr></tbody>
      {children}
    </table>
  </>;
}

export function ComparisonDisclosure({ id, title, open, span, onToggle, children }: {
  id: string;
  title: string;
  open: boolean;
  span: number;
  onToggle: () => void;
  children: ReactNode;
}) {
  return <tbody className="result-section-toggle">
    <tr><td colSpan={span}>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={onToggle}>
        {title}
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="m4 6 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </td></tr>
    <tr><td colSpan={span}>
      <div id={id} className="result-detail-panel" data-expanded={open} inert={!open}>
        <div className="result-detail-clip"><table className="comparison" aria-label={title}>{children}</table></div>
      </div>
    </td></tr>
  </tbody>;
}
