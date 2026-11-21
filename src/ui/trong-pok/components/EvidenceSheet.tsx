"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

export default function EvidenceSheet({ open, title, eyebrow, children, onClose }: {
  open: boolean;
  title: string;
  eyebrow: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    if (!open && dialog?.open) dialog.close();
  }, [open]);

  return <dialog ref={ref} aria-labelledby={titleId}
    onCancel={(event) => { event.preventDefault(); onClose(); }}
    onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="dialog-content">
      <button className="dialog-close" type="button" onClick={onClose} aria-label="ปิดหลักฐาน">×</button>
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={titleId}>{title}</h2>
      {children}
    </div>
  </dialog>;
}
