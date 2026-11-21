"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { CategoryPack, Product, Requirement } from "@/lib/types";
import { prefillSelection, requirementsFromSelection, toggleAnswer, type Answers } from "@/lib/ui/needs";
import { savePending } from "@/lib/ui/storage";
import { money } from "@/lib/ui/presentation";
import { ModeBadge, ProductArt } from "./shared";
import { splitNeedInput } from "@/lib/ui/input";

type Props = { packs: CategoryPack[]; products: Product[]; previews: Record<string, Product[]>; initialText?: string; initialPackId?: string; initialProduct?: Product; initialError?: string };
const kinds = { must: "จำเป็น", nice: "มีก็ดี", budget: "งบประมาณ" };

export function NeedFlow({ packs, products, previews, initialText = "", initialPackId = "", initialProduct, initialError = "" }: Props) {
  const initialPack = packs.find((item) => item.id === initialPackId);
  const router = useRouter();
  const [stage, setStage] = useState<"entry" | "questions" | "review">(initialPack ? "questions" : "entry");
  const [text, setText] = useState(initialText);
  const [packId, setPackId] = useState(initialPackId);
  const [answers, setAnswers] = useState<Answers>(() => initialPack ? prefillSelection(initialPack, splitNeedInput(initialText).needText) : {});
  const [changes, setChanges] = useState<Record<string, Requirement["kind"] | null>>({});
  const [linked, setLinked] = useState<Product | null>(initialProduct ?? null);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  const pack = packs.find((item) => item.id === packId);
  const requirements = pack ? requirementsFromSelection(pack, answers).flatMap((requirement) =>
    changes[requirement.id] === null ? [] : [{ ...requirement, kind: changes[requirement.id] ?? requirement.kind }]) : [];

  async function begin(event?: FormEvent, selectedId?: string, usePreview = false) {
    event?.preventDefault();
    setError(""); setBusy(true);
    try {
      let selected = packs.find((item) => item.id === selectedId);
      let product: Product | null = null;
      const parsedInput = splitNeedInput(text);
      if (parsedInput.link && !usePreview) {
        const response = await fetch("/api/ui/resolve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ link: parsedInput.link }) });
        if (!response.ok) throw new Error("ตรวจลิงก์ไม่ได้ กรุณาลองอีกครั้ง");
        const resolved = await response.json();
        if (resolved.status !== "found") throw new Error("ลิงก์นี้ยังไม่อยู่ในชุดเดโม ลองเลือกหมวดหรืออธิบายความต้องการแทน");
        product = resolved.product;
        selected = packs.find((item) => item.id === product?.category);
      }
      selected ??= packs.find((item) => item.keywords.some((keyword) => text.toLocaleLowerCase().includes(keyword.toLocaleLowerCase())))
        ?? packs.find((item) => Object.values(prefillSelection(item, text)).some((values) => values.length > 0));
      if (!selected) throw new Error("เลือกหมวดสินค้าด้านล่าง เพื่อให้เราถามได้ตรงความต้องการ");
      setPreview(usePreview); setPackId(selected.id); setLinked(product); setChanges({});
      setAnswers(prefillSelection(selected, parsedInput.needText)); setStage("questions");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "เริ่มไม่ได้ กรุณาลองอีกครั้ง"); }
    finally { setBusy(false); }
  }

  function launch() {
    if (!pack || !requirements.length) { setError("เลือกความต้องการอย่างน้อยหนึ่งข้อก่อนเริ่ม"); return; }
    try {
      const parsedInput = splitNeedInput(text);
      savePending({ input: { category: pack.id, answers, needText: parsedInput.needText,
        ...(linked ? { link: parsedInput.link } : {}), requirements }, preview, pack,
        products: preview ? previews[pack.id] ?? [] : products.filter((product) => product.category === pack.id),
        ...(linked ? { linkedProductId: linked.id } : {}),
      });
      router.push("/arena");
    } catch { setError("บันทึกการเลือกไม่ได้ กรุณาอนุญาตพื้นที่เก็บข้อมูลของเบราว์เซอร์ แล้วลองใหม่"); }
  }

  if (stage === "entry") return <>
    <section className="hero">
      <div className="hero-copy"><div className="eyebrow"><span className="status-dot" /> AI ช่วยเลือก จากความต้องการของคุณ</div>
        <h1>ดาวเยอะ<br />ไม่ได้แปลว่า<span className="highlight">เหมาะกับเรา<span className="spark" aria-hidden="true">✳</span></span></h1>
        <p className="hero-description">บอกว่าจะเอาไปใช้ทำอะไร ให้ผู้ช่วย 4 มุมมองช่วยเทียบสเปก อ่านรีวิว และมองหาข้อเสีย ก่อนคุณตัดสินใจ</p>
        <form onSubmit={(event) => void begin(event)} className="search-form"><label className="sr-only" htmlFor="need-input">ลิงก์สินค้าหรือความต้องการ</label>
          <span className="input-symbol" aria-hidden="true">⌕</span><input id="need-input" value={text} maxLength={2000} onChange={(event) => setText(event.target.value)} placeholder="วางลิงก์ Shopee หรือบอกว่าอยากได้อะไร" />
          <button className="button primary" disabled={busy} type="submit">{busy ? "กำลังตรวจ…" : "หาให้ตรงใจ"}<span aria-hidden="true">↗</span></button></form>
        <div className="category-row"><span>เริ่มจากหมวด</span>{packs.map((item) => <button disabled={busy} className="chip" key={item.id} onClick={() => void begin(undefined, item.id)}>{item.id === "blender" ? "◒" : "◷"} {item.name} <span aria-hidden="true">↗</span></button>)}</div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="demo-prompt"><span>อยากเห็นภาพก่อน?</span><button className="text-button" disabled={busy} onClick={() => void begin(undefined, "blender", true)}>ลองข้อมูลตัวอย่าง <span aria-hidden="true">→</span></button><small>สินค้าและรีวิวจำลอง</small></div>
      </div>
      <div className="hero-visual" aria-label="ตัวอย่างแนวคิดการเปรียบเทียบสินค้า"><div className="orbit orbit-one" /><div className="orbit orbit-two" />
        <span className="floating-note note-top">✳ เริ่มจากสิ่งที่คุณต้องการ</span><div className="example-card"><div className="example-top"><span>ตัวอย่างผลลัพธ์</span><span>↗</span></div>
          {previews.blender?.[1] && <ProductArt product={previews.blender[1]} large />}
          <div className="example-title">ตัวที่เหมาะกับการใช้งานคุณ</div><div className="example-metrics"><span>สเปกตรงโจทย์</span><span>✓ มีหลักฐานให้ตรวจ</span></div></div>
        <span className="floating-note note-bottom"><span className="note-icon">◈</span> ไม่มองแค่ดาว แต่หาข้อเสียด้วย</span><span className="visual-spark" aria-hidden="true">✳</span>
      </div>
    </section>
    <section id="how" className="how-section"><div><p className="eyebrow">เลือกอย่างมีเหตุผล</p><h2>หนึ่งความต้องการ<br />มองให้ครบ 4 ด้าน</h2><p>เห็นทั้งข้อดี ข้อเสีย และสิ่งที่ยังไม่รู้</p></div>
      <div className="how-grid">{[{ mark: "◎", name: "ตรวจให้ชัวร์", detail: "เช็กสินค้าที่เล็งกับทุกเงื่อนไข" }, { mark: "✳", name: "หาให้เหมาะ", detail: "เทียบตัวเลือกกับการใช้งานจริง" }, { mark: "↘", name: "เลือกให้คุ้ม", detail: "หาตัวที่ผ่านโจทย์ในราคาที่ดี" }, { mark: "◈", name: "มองอีกด้าน", detail: "อ่านรีวิวที่ขัดแย้งให้ด้วย" }].map((item) => <div className="how-item" key={item.name}><span>{item.mark}</span><div><h3>{item.name}</h3><p>{item.detail}</p></div></div>)}</div>
    </section><footer className="site-footer"><span>ตรงปก. เหมาะกับเราไหม</span><span>คุณเป็นคนตัดสินใจ เราช่วยให้เห็นข้อมูล</span></footer>
  </>;

  return <main className="flow-main"><button className="text-button back-link" onClick={() => { setStage(stage === "review" ? "questions" : "entry"); setError(""); }}>← {stage === "review" ? "แก้คำตอบ" : "กลับหน้าแรก"}</button>
    <div className="flow-heading"><div><p className="eyebrow">{pack?.name} · ขั้นที่ {stage === "review" ? 2 : 1} จาก 2</p><h1>{stage === "review" ? "เข้าใจตรงกันก่อนเริ่ม" : "แบบไหนที่เหมาะกับคุณ"}</h1><p>{stage === "review" ? "ปรับสิ่งที่จำเป็น สิ่งที่มีก็ดี หรือลบเงื่อนไขได้" : "เลือกได้ตามการใช้งานจริง ข้ามข้อที่ยังไม่แน่ใจได้"}</p></div><ModeBadge preview={preview} /></div>
    {linked && <div className="linked-card"><ProductArt product={linked} /><div><small>สินค้าที่คุณเล็ง</small><strong>{linked.title}</strong><span>฿{money(linked.priceThb)}</span></div></div>}
    {stage === "questions" ? <><div className="question-grid">{pack?.questions.map((question, index) => <fieldset key={question.id} className="question-card"><legend><span className="question-number">0{index + 1}</span>{question.text}</legend><small>{question.multi ? "เลือกได้มากกว่าหนึ่งข้อ" : "เลือกได้หนึ่งข้อ"}</small><div className="question-options">{question.options.map((option) => <button type="button" aria-pressed={answers[question.id]?.includes(option.label) ?? false} key={option.label} className={`option ${answers[question.id]?.includes(option.label) ? "selected" : ""}`} onClick={() => { setAnswers(toggleAnswer(answers, question.id, option.label, question.multi)); setChanges({}); setError(""); }}><span>{option.label}</span><span className="option-check" aria-hidden="true">{answers[question.id]?.includes(option.label) ? "✓" : "+"}</span></button>)}</div></fieldset>)}</div><div className="flow-actions"><span>{requirements.length} เงื่อนไขที่เลือก</span><button className="button primary" disabled={!requirements.length} onClick={() => { setStage("review"); setError(""); }}>ตรวจความต้องการ <span aria-hidden="true">→</span></button></div></> : <><div className="requirements-review">{requirements.map((requirement) => <div className="requirement-edit" key={requirement.id}><span className={`kind-badge ${requirement.kind}`}>{kinds[requirement.kind]}</span><strong>{requirement.text}</strong>{requirement.kind !== "budget" && <button className="text-button" onClick={() => setChanges({ ...changes, [requirement.id]: requirement.kind === "must" ? "nice" : "must" })}>เปลี่ยนเป็น{kinds[requirement.kind === "must" ? "nice" : "must"]}</button>}<button className="remove-button" aria-label={`ลบ ${requirement.text}`} onClick={() => setChanges({ ...changes, [requirement.id]: null })}>×</button></div>)}</div><div className="info-panel"><span aria-hidden="true">◎</span><p>รีวิวที่ขัดแย้งจะแสดงพร้อมหลักฐาน ข้อมูลที่ยังยืนยันไม่ได้จะระบุไว้ชัดเจน</p></div><div className="flow-actions"><span>พร้อมให้ผู้ช่วยทั้ง 4 มุมมองเปรียบเทียบ</span><button className="button primary" disabled={!requirements.length} onClick={launch}>เริ่มเปรียบเทียบ <span aria-hidden="true">↗</span></button></div></>}
    {error && <p className="form-error" role="alert">{error}</p>}
  </main>;
}
