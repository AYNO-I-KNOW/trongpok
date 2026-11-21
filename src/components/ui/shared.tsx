import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/lib/types";

export function Header() {
  return <header className="site-header"><Link href="/" className="brand" aria-label="ตรงปก หน้าแรก"><span className="brand-mark">ต<span>✓</span></span>ตรงปก<span className="brand-dot">.</span></Link><span className="header-caption">เลือกให้ตรงกับคุณ</span><a className="header-link" href="/compare">เลือกหมวดสินค้า <span aria-hidden="true">↗</span></a></header>;
}

export function ModeBadge({ preview, mode }: { preview: boolean; mode?: string }) {
  const text = preview ? "ข้อมูลตัวอย่าง · สินค้าและรีวิวจำลอง" : mode === "rules" ? "โหมดกฎ" : mode === "cache" ? "เล่นซ้ำจาก cache" : "วิเคราะห์จากข้อมูลสินค้า";
  return <span className={`mode-badge ${preview ? "preview" : ""}`}><span className="status-dot" />{text}</span>;
}

export function EvidenceFooter() {
  return <p className="evidence-footer">วัดจากรีวิวของผู้ซื้อก่อนหน้าเท่านั้น</p>;
}

export function ProductArt({ product, large = false }: { product: Product; large?: boolean }) {
  if (product.imageUrl.startsWith("https://")) return <div className={`product-art ${large ? "large" : ""}`}><Image src={product.imageUrl} alt={product.title} fill unoptimized sizes={large ? "400px" : "200px"} style={{ objectFit: "contain" }} /></div>;
  const tone = ["#778c79", "#d2ab8c", "#9da8ad", "#4d6560"][product.id.charCodeAt(product.id.length - 1) % 4];
  return <div className={`product-art ${large ? "large" : ""}`}>
    <svg viewBox="0 0 240 240" role="img" aria-label={`ภาพประกอบ${product.category === "blender" ? "เครื่องปั่น" : "นาฬิกา"}`}>
      <ellipse cx="122" cy="215" rx="64" ry="9" fill="#000" opacity=".07" />
      {product.category === "blender" ? <g>
        <path d="M85 42h78l-8 105H94z" fill="#ecf3ed" stroke="#b1beb6" strokeWidth="3" />
        <path d="M164 59h12c25 0 19 61-17 61" fill="none" stroke="#b1beb6" strokeWidth="9" />
        <path d="M90 87h68l-5 53H95z" fill={tone} opacity=".32" />
        <path d="M80 37q43-12 88 0v11H80z" fill={tone} /><path d="M115 22h20v14h-20z" fill={tone} />
        <path d="M91 145h67l13 57q1 9-9 9H86q-10 0-8-9z" fill={tone} />
        <circle cx="124" cy="178" r="14" fill="#f5f4ed" /><path d="M124 168v10" stroke={tone} strokeWidth="3" strokeLinecap="round" />
        <path d="M112 137h24m-12-8v13" stroke="#73847a" strokeWidth="3" /><path d="M103 58l-4 47" stroke="white" strokeWidth="5" opacity=".85" />
      </g> : <g>
        <rect x="94" y="13" width="53" height="214" rx="18" fill={tone} /><rect x="80" y="65" width="83" height="110" rx="25" fill="#333e39" />
        <rect x="85" y="70" width="73" height="100" rx="21" fill="#132720" /><rect x="164" y="100" width="6" height="22" rx="3" fill="#81938a" />
        <circle cx="122" cy="114" r="24" fill="none" stroke="#9dcc7f" strokeWidth="7" strokeDasharray="112 40" />
        <path d="M122 98v17l12 7" stroke="#e8efdf" fill="none" strokeWidth="3" strokeLinecap="round" /><rect x="106" y="149" width="31" height="4" rx="2" fill="#819c8f" />
      </g>}
    </svg><span className="art-caption">{product.brand === "รุ่นสมมติ" ? "รุ่นสมมติ · ภาพประกอบ" : "ภาพประกอบ"}</span>
  </div>;
}

export function EmptyState({ title, text }: { title: string; text: string }) {
  return <section className="empty-state"><span className="empty-mark" aria-hidden="true">◎</span><h1>{title}</h1><p>{text}</p><Link className="button primary" href="/compare">เริ่มเลือกสินค้าใหม่ <span aria-hidden="true">↗</span></Link></section>;
}
