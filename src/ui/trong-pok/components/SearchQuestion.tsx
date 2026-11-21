import { useEffect, useRef, useState } from "react";
import {
  MAX_SEARCH_TEXT_LENGTH,
  type ClarificationTurn,
  type ProductSearchResult,
} from "@/lib/product-search/contract";

type Question = Extract<ProductSearchResult, { kind: "clarify" }>["questions"][number];
type Draft = { selected: number | null; custom: string };

type Props = {
  questions: readonly Question[];
  onComplete: (answers: ClarificationTurn[]) => void;
  onBack: () => void;
};

export default function SearchQuestion({ questions, onComplete, onBack }: Props) {
  const [step, setStep] = useState(0);
  const [drafts, setDrafts] = useState<Draft[]>(() =>
    questions.map(() => ({ selected: null, custom: "" })),
  );
  const heading = useRef<HTMLHeadingElement>(null);
  const { question, choices } = questions[step];
  const { selected, custom } = drafts[step];
  const isOther = selected === choices.length;
  const isLast = step === questions.length - 1;
  const canAdvance = Boolean(answerFor(questions[step], drafts[step]));

  useEffect(() => { heading.current?.focus(); }, [step]);

  function updateDraft(change: Partial<Draft>) {
    setDrafts((previous) => previous.map((draft, index) =>
      index === step ? { ...draft, ...change } : draft,
    ));
  }

  function back() {
    if (step === 0) onBack();
    else setStep(step - 1);
  }

  function advance() {
    if (!canAdvance) return;
    if (!isLast) {
      setStep(step + 1);
      return;
    }
    onComplete(questions.map((item, index) => ({
      question: item.question,
      answer: answerFor(item, drafts[index]),
    })));
  }

  return (
    <section className="clarify">
      <nav className="question-nav" aria-label="ความคืบหน้าคำถาม">
        <button type="button" className="back" onClick={back} aria-label="ย้อนกลับ">←</button>
        <div className="question-progress" role="progressbar" aria-label="คำถามเพิ่มเติม" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={step + 1}>
          <span className="question-progress-fill" style={{ transform: `scaleX(${(step + 1) / questions.length})` }} />
        </div>
        <span>{step + 1} จาก {questions.length}</span>
      </nav>
      <div className="question-step" key={step}>
        <div className="question-copy">
          <h1 ref={heading} tabIndex={-1}>{question}</h1>
          <p>ขอข้อมูลเพิ่มอีกนิดเพื่อค้นหาให้ตรงกับคุณ</p>
        </div>
        <form id="question-form" onSubmit={(event) => {
          event.preventDefault();
          advance();
        }}>
          <fieldset>
            <legend className="sr-only">{question}</legend>
            {[...choices, "อื่น ๆ"].map((label, index) => (
              <label key={label} className={selected === index ? "choice selected" : "choice"}>
                <input type="radio" name="answer" value={label} checked={selected === index} onChange={() => updateDraft({ selected: index })} />
                <span className="check" aria-hidden="true">{selected === index ? "✓" : ""}</span>
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
          {isOther && (
            <label className="custom-label">คำตอบของคุณ
              <textarea autoFocus rows={1} maxLength={MAX_SEARCH_TEXT_LENGTH} value={custom} onChange={(event) => updateDraft({ custom: event.target.value })} placeholder="พิมพ์คำตอบของคุณ" required />
            </label>
          )}
        </form>
      </div>
      <div className="question-footer">
        <button className="primary" type="submit" form="question-form" disabled={!canAdvance}>
          {isLast ? "เริ่มค้นหาต่อ" : "ถัดไป"}
        </button>
      </div>
    </section>
  );
}

function answerFor({ choices }: Question, { selected, custom }: Draft): string {
  if (selected === null) return "";
  return selected === choices.length ? custom.trim() : choices[selected];
}
