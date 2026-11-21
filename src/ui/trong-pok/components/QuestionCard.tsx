"use client";
import { useRef, useState } from "react";
import type { CategoryPack } from "@/lib/types";
import { requirementsFromAnswers, type Answers } from "@/lib/needs/answers";

const requirementGroups = [
  ["must", "ต้องมี"],
  ["nice", "อยากได้"],
  ["budget", "งบประมาณ"],
] as const;

const cards = [
  {
    title: "อยากใช้ปั่นอะไร?",
    description: "เลือกการใช้งานที่ใกล้กับคุณ",
    label: "สิ่งที่ต้องการปั่น",
    placeholder: "เช่น สมูทตี้ใส่น้ำแข็ง",
    choices: [
      ["smoothie", "สมูทตี้ใส่น้ำแข็ง"],
      ["ice", "บดน้ำแข็ง"],
    ],
  },
  {
    title: "ใช้น้ำแข็งกี่ก้อน?",
    description: "จำนวนที่ต้องการปั่นในหนึ่งรอบ",
    label: "จำนวนก้อนที่ใช้",
    placeholder: "เช่น 8 ก้อน",
    choices: [
      ["5", "4–5 ก้อน"],
      ["8", "8 ก้อน"],
      ["12", "12 ก้อน"],
    ],
  },
  {
    title: "ใช้ภาชนะไหน?",
    description: "เลือกภาชนะที่ต้องการใช้กับเครื่อง",
    label: "ภาชนะที่ใช้",
    placeholder: "เช่น ขวดปั่น 600 มล.",
    choices: [
      ["bottle600", "ขวดปั่น 600 มล."],
      ["mainJar", "โถปั่นหลัก"],
      ["grinder", "โถบด"],
    ],
  },
];
export default function QuestionCard({
  pack,
  needText,
  onConfirm,
  onBack,
}: {
  pack: CategoryPack;
  needText: string;
  onConfirm: (answers: Answers) => void;
  onBack: () => void;
}) {
  const [direction, setDirection] = useState<"next" | "back">("next");
  const [step, setStep] = useState(0),
    [answers, setAnswers] = useState(["", "", ""]),
    [custom, setCustom] = useState(["", "", ""]);
  const locked = useRef(false);
  const reviewing = step === cards.length;
  const card = cards[step],
    choice = answers[step],
    valid = choice && (choice !== "custom" || custom[step].trim());
  function select(value: string) {
    setAnswers((a) => a.map((old, i) => (i === step ? value : old)));
  }
  function next() {
    if (!valid) return;
    setDirection("next");
    setStep(step + 1);
  }
  function resolve(index: number) {
    return answers[index] === "custom" ? custom[index].trim() : answers[index];
  }
  const resolved = reviewing ? {
    blenderUsage: resolve(0),
    iceCubes: resolve(1),
    container: resolve(2),
  } : null;
  const requirements = resolved && requirementsFromAnswers(pack, resolved, needText);
  function confirm() {
    if (locked.current || !resolved) return;
    locked.current = true;
    onConfirm(resolved);
  }
  return (
    <section className={"clarify" + (reviewing ? " arena-requirements" : "")}>
      <nav className="question-nav" aria-label="ความคืบหน้าคำถาม">
        <button
          type="button"
          className="back"
          onClick={() => {
            if (step) {
              setDirection("back");
              setStep(step - 1);
            } else onBack();
          }}
          aria-label="ย้อนกลับ"
        >
          ←
        </button>
        <div
          className="question-progress"
          role="progressbar"
          aria-label="คำถามเพิ่มเติม"
          aria-valuemin={0}
          aria-valuemax={cards.length}
          aria-valuenow={Math.min(step + 1, cards.length)}
        >
          <span
            className="question-progress-fill"
            style={{ transform: `scaleX(${Math.min(step + 1, cards.length) / cards.length})` }}
          />
        </div>
        <span>
          {reviewing ? "สรุปโจทย์" : `${step + 1} จาก ${cards.length}`}
        </span>
      </nav>
      {requirements && (
        <div className="question-step" key="requirements">
          <div className="question-copy">
            <h1>เงื่อนไขที่จะใช้เปรียบเทียบ</h1>
            <p>ตรวจโจทย์ก่อนเริ่มเปรียบเทียบจากชุดเดโม</p>
          </div>
          <div className="arena-requirement-groups">
            {requirementGroups.map(([kind, title]) => {
              const entries = requirements.filter((requirement) => requirement.kind === kind);
              if (!entries.length) return null;
              return (
                <section key={kind}>
                  <h2>{title}</h2>
                  <ul>
                    {entries.map((requirement) => (
                      <li key={requirement.id} data-kind={kind}>{requirement.text}</li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      )}
      {!reviewing && (
        <div
          className="question-step"
          key={step}
          style={
            {
              "--question-enter-x": direction === "next" ? "8px" : "-8px",
            } as React.CSSProperties
          }
        >
          <div className="question-copy">
            <h1>{card.title}</h1>
            <p>{card.description}</p>
          </div>
          <form
            id="question-form"
            onSubmit={(e) => {
              e.preventDefault();
              next();
            }}
          >
            <fieldset>
              <legend className="sr-only">{card.title}</legend>
              {[...card.choices, ["custom", "กรอกเอง"]].map(([value, label]) => (
                <label
                  key={value}
                  className={"choice " + (choice === value ? "selected" : "")}
                >
                  <input
                    type="radio"
                    name={"answer-" + step}
                    value={value}
                    checked={choice === value}
                    onChange={() => select(value)}
                  />
                  <span className="check" aria-hidden="true">
                    {choice === value ? "✓" : ""}
                  </span>
                  <span>{label}</span>
                </label>
              ))}
            </fieldset>
            {choice === "custom" && (
              <label className="custom-label">
                {card.label}
                <textarea
                  autoFocus
                  rows={1}
                  value={custom[step]}
                  onChange={(e) =>
                    setCustom((a) =>
                      a.map((old, i) => (i === step ? e.target.value : old)),
                    )
                  }
                  placeholder={card.placeholder}
                />
              </label>
            )}
          </form>
        </div>
      )}
      <div className="question-footer">
        {reviewing ? (
          <button className="primary" type="button" onClick={confirm}>เริ่มค้นหาต่อ</button>
        ) : (
          <button className="primary" type="submit" form="question-form" disabled={!valid}>
            {step === cards.length - 1 ? "ดูสรุปเงื่อนไข" : "ถัดไป"}
          </button>
        )}
      </div>
    </section>
  );
}
