import localFont from "next/font/local";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

const lineSeed = localFont({
  src: [
    { path: "./assets/line-seed/line-seed-0.woff2", weight: "400" },
    { path: "./assets/line-seed/line-seed-1.woff2", weight: "700" },
  ],
  display: "swap",
  variable: "--font-line-seed",
  adjustFontFallback: false,
  fallback: ["Sukhumvit Set", "system-ui", "sans-serif"],
});

export const metadata: Metadata = {
  title: "Trong Pok · ตรงปก",
  description: "เลือกสินค้าจากความต้องการ พร้อมหลักฐานจากสเปกและรีวิว",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="th">
      <body className={lineSeed.variable}>{children}</body>
    </html>
  );
}
