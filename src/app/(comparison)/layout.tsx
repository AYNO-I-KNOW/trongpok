import type { ReactNode } from "react";
import { Header } from "@/components/ui/shared";
import "./comparison.css";

export default function ComparisonLayout({ children }: { children: ReactNode }) {
  return <div className="comparison-app"><Header /><div className="catalog-notice">ชุดข้อมูลสาธิต · สินค้าและรีวิวสังเคราะห์ที่ทีมเตรียมไว้</div>{children}</div>;
}
