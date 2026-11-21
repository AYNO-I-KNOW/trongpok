"use client";

import { EmptyState } from "@/components/ui/shared";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <EmptyState title="เปิดหน้านี้ไม่สำเร็จ" text="ลองเปิดหน้านี้อีกครั้ง" onRetry={reset} />;
}
