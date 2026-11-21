import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "ตรงปก · เหมาะกับเราไหม",
  description: "เลือกสินค้าจากความต้องการ พร้อมหลักฐานจากสเปกและรีวิว",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
