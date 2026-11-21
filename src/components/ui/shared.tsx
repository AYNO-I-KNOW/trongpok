import Link from "next/link";
import DesignerScreen from "@/ui/trong-pok/components/DesignerScreen";

export function ModeBadge({ preview, mode }: { preview: boolean; mode?: string }) {
  const modeText = mode === "rules" ? "โหมดกฎ" : mode === "cache" ? "ผลที่บันทึกไว้" : mode === "llm" ? "วิเคราะห์ด้วย AI" : "";
  const provenance = preview ? "ตัวอย่าง · สินค้า ราคา และรีวิวจำลอง" : "ชุดสาธิต · สินค้าและรีวิวสังเคราะห์";
  return <span className="demo-label">{modeText ? `${provenance} · ${modeText}` : provenance}</span>;
}

export function EmptyState({ title, text, onRetry }: { title: string; text: string; onRetry?: () => void }) {
  return <DesignerScreen phase="home"><section className="unsupported">
    <h1>{title}</h1><p>{text}</p>
    {onRetry ? <button type="button" className="primary" onClick={onRetry}>ลองอีกครั้ง</button>
      : <Link className="primary" href="/compare">เริ่มเลือกสินค้าใหม่</Link>}
  </section></DesignerScreen>;
}
