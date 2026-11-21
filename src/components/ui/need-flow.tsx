"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CategoryPack, Product, Requirement } from "@/lib/types";
import { prefillSelection, requirementsFromSelection, toggleAnswer, type Answers } from "@/lib/ui/needs";
import { savePending } from "@/lib/ui/storage";
import { splitNeedInput } from "@/lib/ui/input";
import DesignerScreen from "@/ui/trong-pok/components/DesignerScreen";
import HomeForm from "@/ui/trong-pok/components/HomeForm";
import QuestionStep from "@/ui/trong-pok/components/QuestionStep";
import { ModeBadge } from "./shared";

type Props = {
  packs: CategoryPack[];
  products: Product[];
  previews: Record<string, Product[]>;
  initialText?: string;
  initialPackId?: string;
  initialProduct?: Product;
  initialError?: string;
  font?: "ibm" | "line";
};
const kinds = { must: "จำเป็น", nice: "มีก็ดี", budget: "งบประมาณ" };

export function NeedFlow({ packs, products, previews, initialText = "", initialPackId = "", initialProduct, initialError = "", font = "ibm" }: Props) {
  const initialPack = packs.find((item) => item.id === initialPackId);
  const router = useRouter();
  const [text, setText] = useState(initialText);
  const [packId, setPackId] = useState(initialPackId);
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<"next" | "back">("next");
  const [answers, setAnswers] = useState<Answers>(() => initialPack ? prefillSelection(initialPack, splitNeedInput(initialText).needText) : {});
  const [changes, setChanges] = useState<Record<string, Requirement["kind"] | null>>({});
  const [linked, setLinked] = useState<Product | null>(initialProduct ?? null);
  const [preview, setPreview] = useState(false);
  const [error, setError] = useState(initialError);
  const [busy, setBusy] = useState(false);
  const pack = packs.find((item) => item.id === packId);
  const question = pack?.questions[step];
  const requirements = pack ? requirementsFromSelection(pack, answers).flatMap((requirement) =>
    changes[requirement.id] === null ? [] : [{ ...requirement, kind: changes[requirement.id] ?? requirement.kind }]) : [];

  async function begin(query: string, selectedId?: string, usePreview = false) {
    if (busy) return;
    setText(query);
    setError("");
    setBusy(true);
    try {
      let selected = packs.find((item) => item.id === selectedId);
      let product: Product | null = null;
      const input = splitNeedInput(query);
      if (input.link && !usePreview) {
        const response = await fetch("/api/ui/resolve", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ link: input.link }),
        });
        if (!response.ok) throw new Error("ตรวจลิงก์ไม่ได้ กรุณาลองอีกครั้ง");
        const resolved = await response.json();
        if (resolved.status === "found") {
          product = resolved.product;
          selected = packs.find((item) => item.id === product?.category);
        } else if (!selected) {
          throw new Error("ลิงก์นี้ยังไม่อยู่ในชุดเดโม ลองเลือกหมวดหรืออธิบายความต้องการแทน");
        }
      }
      selected ??= packs.find((item) => item.keywords.some((keyword) => input.needText.toLocaleLowerCase().includes(keyword.toLocaleLowerCase())))
        ?? packs.find((item) => Object.values(prefillSelection(item, input.needText)).some((values) => values.length > 0));
      if (!selected) throw new Error("เลือกหมวดสินค้า เพื่อให้เราถามได้ตรงความต้องการ");
      setPreview(usePreview);
      setPackId(selected.id);
      setLinked(product);
      setChanges({});
      setAnswers(prefillSelection(selected, input.needText));
      setDirection("next");
      setStep(0);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "เริ่มไม่ได้ กรุณาลองอีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  function launch() {
    if (!pack || !requirements.length) return;
    try {
      const input = splitNeedInput(text);
      savePending({
        input: { category: pack.id, answers, needText: input.needText,
          ...(linked ? { link: input.link } : {}), requirements },
        preview, pack, font, products: preview ? previews[pack.id] ?? [] : products.filter((product) => product.category === pack.id),
        ...(linked ? { linkedProductId: linked.id } : {}),
      });
      router.push("/arena?flow=compare");
    } catch {
      setError("บันทึกการเลือกไม่ได้ กรุณาอนุญาตพื้นที่เก็บข้อมูลของเบราว์เซอร์ แล้วลองใหม่");
    }
  }

  function back() {
    setError("");
    if (step === 0) {
      setPackId("");
      return;
    }
    setDirection("back");
    setStep(step - 1);
  }

  function next() {
    if (!question) {
      launch();
      return;
    }
    setError("");
    setDirection("next");
    setStep(step + 1);
  }

  if (!pack) return <DesignerScreen phase="home" font={font}>
    <HomeForm initial={text} onSubmit={(value) => void begin(value)} onChange={setText} busy={busy} />
    <div className="compare-entry-options">
      {error && <p className="form-error-inline" role="alert">{error}</p>}
      <details className="method" open={Boolean(error) || undefined}>
        <summary>เลือกหมวดสินค้า</summary>
        <div className="evidence-model-list">
          {packs.map((item) => <button type="button" className="evidence-link" key={item.id} disabled={busy}
            onClick={() => void begin(text, item.id)}><span>{item.name}</span><span>เลือก →</span></button>)}
        </div>
      </details>
      <button type="button" className="evidence-link" disabled={busy}
        onClick={() => void begin("", "blender", true)}>ลองข้อมูลตัวอย่าง →</button>
    </div>
  </DesignerScreen>;

  const description = question
    ? question.multi ? "เลือกได้มากกว่าหนึ่งข้อ" : "เลือกคำตอบที่ใกล้กับการใช้งานของคุณ"
    : "ปรับสิ่งที่จำเป็น สิ่งที่มีก็ดี หรือลบเงื่อนไขได้";
  const action = !question ? "เริ่มเปรียบเทียบ" : step + 1 === pack.questions.length ? "ตรวจความต้องการ" : "ถัดไป";

  return <DesignerScreen phase="clarify" font={font}>
    <QuestionStep step={step} total={pack.questions.length + 1} direction={direction}
      title={question?.text ?? "เข้าใจตรงกันก่อนเริ่ม"} description={description}
      action={action} disabled={!question && !requirements.length} onBack={back} onNext={next}>
      {linked && <p className="demo-label">สินค้าที่คุณส่งมา: {linked.title}</p>}
      {question ? <fieldset>
        <legend className="sr-only">{question.text}</legend>
        {question.options.map(({ label }) => {
          const checked = answers[question.id]?.includes(label) ?? false;
          return <label className={checked ? "choice selected" : "choice"} key={label}>
            <input type={question.multi ? "checkbox" : "radio"} checked={checked} name={question.id} value={label}
              onChange={() => {
                setAnswers((current) => toggleAnswer(current, question.id, label, question.multi));
                setChanges({});
                setError("");
              }} />
            <span className="check" aria-hidden="true">{checked ? "✓" : ""}</span><span>{label}</span>
          </label>;
        })}
      </fieldset> : <>
        {requirements.length === 0 && <p className="form-error-inline">ย้อนกลับไปเลือกความต้องการอย่างน้อยหนึ่งข้อก่อนเริ่ม</p>}
        {requirements.map((requirement) => <section className="evidence-decision requirement-edit" key={requirement.id}>
          <p className="eyebrow">{kinds[requirement.kind]}</p><h2>{requirement.text}</h2>
          {requirement.kind !== "budget" && <button type="button" className="evidence-link"
            onClick={() => setChanges((current) => ({ ...current, [requirement.id]: requirement.kind === "must" ? "nice" : "must" }))}>
            เปลี่ยนเป็น{kinds[requirement.kind === "must" ? "nice" : "must"]}
          </button>}
          <button type="button" className="evidence-link" aria-label={`ลบ ${requirement.text}`}
            onClick={() => setChanges((current) => ({ ...current, [requirement.id]: null }))}>ลบ</button>
        </section>)}
      </>}
      <ModeBadge preview={preview} />
      {error && <p className="form-error-inline" role="alert">{error}</p>}
    </QuestionStep>
  </DesignerScreen>;
}
