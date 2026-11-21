"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="empty-state"><h1>เปิดหน้านี้ไม่สำเร็จ</h1><p>ลองโหลดใหม่อีกครั้ง หากยังไม่สำเร็จ ให้ตรวจชุดข้อมูลและการเชื่อมต่อของระบบ</p><button className="button primary" onClick={reset}>ลองอีกครั้ง</button></main>;
}
