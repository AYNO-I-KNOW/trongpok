import type { CategoryPack, Requirement } from "../types";

export type Answers = Record<string, string | number | (string | number)[]>;

const containers = {
  bottle600: { text: "ขวดพกพา 600 มล.", key: "maxIceCubesBottle600" },
  mainJar: { text: "โถหลัก", key: "maxIceCubesMainJar" },
  grinder: { text: "โถบดแห้ง", key: "maxIceCubesGrinder" },
};

function answerText(value: Answers[string] | undefined) {
  return typeof value === "string" || typeof value === "number" ? String(value).trim().slice(0, 160) : "";
}

function arabicDigits(text: string) {
  return text.replace(/[๐-๙]/g, (digit) => String(digit.charCodeAt(0) - "๐".charCodeAt(0)));
}

function explicitBudget(text: string) {
  const normalized = arabicDigits(text);
  const match = normalized.match(/(?:งบ(?:ประมาณ)?\s*(?:ไม่เกิน)?|ราคาไม่เกิน)\s*(\S+)/)
    ?? normalized.match(/ไม่เกิน\s*(\S+?)(?=\s*บาท)/);
  if (!match) return undefined;
  const token = match[1].replace(/บาท$/, "");
  const rest = normalized.slice((match.index ?? 0) + match[0].length).trim();
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(token) || /^[-–—/\d]/.test(rest)) return undefined;
  const amount = Number(token.replaceAll(",", ""));
  return amount > 0 && amount <= 1_000_000 ? amount : undefined;
}

function blenderRequirements(pack: CategoryPack, answers: Answers, needText: string): Requirement[] {
  const usage = answerText(answers.blenderUsage);
  const cubes = answerText(answers.iceCubes);
  const containerAnswer = answerText(answers.container);
  const container = Object.entries(containers).find(([key]) => key === containerAnswer || (key === "bottle600" && containerAnswer === "ขวดปั่น 600 มล."))?.[1];
  const shopUse = [...needText.matchAll(
    /((?:ยัง)?ไม่(?:ได้|ต้องการ|คิดจะ|อยาก|จะ)?\s*)?(?:เปิดร้าน|ใช้งานในร้าน|ใช้ในร้าน|ปั่น(?:น้ำแข็ง)?ขาย|ทำขาย)/gi,
  )].some(([, negation]) => !negation);
  const requirements: Requirement[] = usage === "ice" && !shopUse
    ? [{ id: "ice", text: "บดน้ำแข็งได้", kind: "must", spec: { key: "iceCrush", op: "==", value: true } }]
    : usage === "ice" || usage === "smoothie"
      ? requirementsFromAnswers(pack, { use: usage === "smoothie" && shopUse ? ["smoothie", "ice"] : usage })
      : [{ id: "custom-usage", text: `การใช้งาน: ${usage || "ยังไม่ระบุ"}`, kind: "must", specOnly: true }];
  const countMatch = arabicDigits(cubes).match(/^(\d{1,4})\s*(?:ก้อน)?$/);
  const count = countMatch ? Number(countMatch[1]) : 0;
  const countText = countMatch ? `${count} ก้อน` : (cubes || "ยังไม่ระบุจำนวน");
  const spec: Requirement["spec"] = container && count > 0 && count <= 1000
    ? { key: container.key, op: ">=", value: count } : undefined;
  requirements.push({
    id: "ice-condition",
    text: `ปั่นน้ำแข็ง ${countText} ใน${container?.text ?? (containerAnswer || "ภาชนะที่ยังไม่ระบุ")}`,
    kind: "must",
    specOnly: true,
    ...(spec ? { spec } : {}),
  });
  const suppliedBudget = requirementsFromAnswers(pack, { budget: answers.budget }).find((requirement) => requirement.kind === "budget");
  const amount = explicitBudget(needText);
  if (suppliedBudget) {
    requirements.push(suppliedBudget);
  } else if (amount !== undefined) {
    requirements.push({ id: "budget", text: `ราคาไม่เกิน ${amount.toLocaleString("th-TH")} บาท`, kind: "budget", value: amount });
  }
  return requirements;
}

export function requirementsFromAnswers(pack: CategoryPack, answers: Answers, needText = ""): Requirement[] {
  if (pack.id === "blender" && ["blenderUsage", "iceCubes", "container"].some((key) => Object.hasOwn(answers, key))) {
    return blenderRequirements(pack, answers, needText);
  }
  return pack.questions.flatMap((question) => {
    const answer = answers[question.id];
    const choices = Array.isArray(answer) ? answer : [answer];
    const selected = question.options.filter((option) => choices.some((choice) =>
      choice !== undefined && choice !== "" && (option.label === String(choice) ||
        (option.requirement?.kind === "budget"
          ? String(option.requirement.value) === String(choice).replaceAll(",", "")
          : option.requirement?.id === String(choice)))));
    return (question.multi ? selected : selected.slice(0, 1))
      .flatMap((option) => option.requirement ? [option.requirement] : []);
  });
}
