import { useEffect, useRef, useState } from "react";

type Props = {
  question: string;
  choices: string[];
  onAnswer: (answer: string) => void;
  onBack: () => void;
};

export default function SearchQuestion({ question, choices, onAnswer, onBack }: Props) {
  const [selected, setSelected] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const isOther = selected === choices.length;
  const answer = selected === null ? "" : isOther ? custom.trim() : choices[selected];

  useEffect(() => { heading.current?.focus(); }, []);

  return (
    <section className="clarify">
      <nav className="question-nav" aria-label="ความคืบหน้าคำถาม">
        <button type="button" className="back" onClick={onBack} aria-label="ย้อนกลับ">←</button>
        <div className="question-progress" role="progressbar" aria-label="คำถามเพิ่มเติม" aria-valuemin={0} aria-valuemax={1} aria-valuenow={1}>
          <span className="question-progress-fill" />
        </div>
        <span>1 จาก 1</span>
      </nav>
      <div className="question-step">
        <div className="question-copy">
          <h1 ref={heading} tabIndex={-1}>{question}</h1>
          <p>ขอข้อมูลเพิ่มอีกนิดเพื่อค้นหาให้ตรงกับคุณ</p>
        </div>
        <form id="question-form" onSubmit={(event) => {
          event.preventDefault();
          if (answer) onAnswer(answer);
        }}>
          <fieldset>
            <legend className="sr-only">{question}</legend>
            {[...choices, "อื่น ๆ"].map((label, index) => (
              <label key={label} className={selected === index ? "choice selected" : "choice"}>
                <input type="radio" name="answer" value={label} checked={selected === index} onChange={() => setSelected(index)} />
                <span className="check" aria-hidden="true">{selected === index ? "✓" : ""}</span>
                <span>{label}</span>
              </label>
            ))}
          </fieldset>
          {isOther && (
            <label className="custom-label">คำตอบของคุณ
              <textarea autoFocus rows={1} value={custom} onChange={(event) => setCustom(event.target.value)} placeholder="พิมพ์คำตอบของคุณ" required />
            </label>
          )}
        </form>
      </div>
      <div className="question-footer">
        <button className="primary" type="submit" form="question-form" disabled={!answer}>เริ่มค้นหาต่อ</button>
      </div>
    </section>
  );
}
