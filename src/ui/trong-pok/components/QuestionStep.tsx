"use client";

import { useId, type CSSProperties, type ReactNode } from "react";

export default function QuestionStep({ step, total, direction, title, description, children, action, disabled, onBack, onNext }: {
  step: number;
  total: number;
  direction: "next" | "back";
  title: string;
  description: string;
  children: ReactNode;
  action: string;
  disabled?: boolean;
  onBack: () => void;
  onNext: () => void;
}) {
  const formId = useId();
  return <section className="clarify">
    <nav className="question-nav" aria-label="ความคืบหน้าคำถาม">
      <button type="button" className="back" onClick={onBack} aria-label="ย้อนกลับ">←</button>
      <div className="question-progress" role="progressbar" aria-label="คำถามเพิ่มเติม"
        aria-valuemin={0} aria-valuemax={total} aria-valuenow={step + 1}>
        <span className="question-progress-fill" style={{ transform: `scaleX(${(step + 1) / total})` }} />
      </div>
      <span>{step + 1} จาก {total}</span>
    </nav>
    <div className="question-step" key={step} style={{ "--question-enter-x": direction === "next" ? "8px" : "-8px" } as CSSProperties}>
      <div className="question-copy"><h1>{title}</h1><p>{description}</p></div>
      <form id={formId} onSubmit={(event) => { event.preventDefault(); if (!disabled) onNext(); }}>
        {children}
      </form>
    </div>
    <div className="question-footer">
      <button className="primary" type="submit" form={formId} disabled={disabled}>{action}</button>
    </div>
  </section>;
}
