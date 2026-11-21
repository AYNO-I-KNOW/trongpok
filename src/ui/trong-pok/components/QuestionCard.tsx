"use client";
import { useRef, useState } from "react";
import QuestionStep from "./QuestionStep";
export type BlenderAnswers = {
  blenderUsage: string;
  iceCubes: string;
  container: string;
};
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
  onConfirm,
  onBack,
}: {
  onConfirm: (answers: BlenderAnswers) => void;
  onBack: () => void;
}) {
  const [direction, setDirection] = useState<"next" | "back">("next");
  const [step, setStep] = useState(0),
    [answers, setAnswers] = useState(["", "", ""]),
    [custom, setCustom] = useState(["", "", ""]);
  const locked = useRef(false);
  const card = cards[step],
    choice = answers[step],
    valid = choice && (choice !== "custom" || custom[step].trim());
  function select(value: string) {
    setAnswers((a) => a.map((old, i) => (i === step ? value : old)));
  }
  function next() {
    if (!valid || locked.current) return;
    if (step < cards.length - 1) {
      setDirection("next");
      setStep(step + 1);
      return;
    }
    locked.current = true;
    const values = answers.map((answer, index) =>
      answer === "custom" ? custom[index].trim() : answer,
    );
    onConfirm({
      blenderUsage: values[0],
      iceCubes: values[1],
      container: values[2],
    });
  }
  return <QuestionStep step={step} total={cards.length} direction={direction}
    title={card.title} description={card.description} action={step === cards.length - 1 ? "เริ่มค้นหาต่อ" : "ถัดไป"}
    disabled={!valid} onNext={next} onBack={() => {
      if (step === 0) { onBack(); return; }
      setDirection("back");
      setStep(step - 1);
    }}>
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
  </QuestionStep>;
}
