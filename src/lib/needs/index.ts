import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
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
  const requirements: Requirement[] = usage === "ice"
    ? [{ id: "ice", text: "บดน้ำแข็งได้", kind: "must", spec: { key: "iceCrush", op: "==", value: true } }]
    : usage === "smoothie"
      ? requirementsFromAnswers(pack, { use: usage })
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

const extractionSchema = z.object({
  choices: z.array(z.object({ questionId: z.string(), optionIndex: z.number().int().nonnegative() })),
  extraNeeds: z.array(z.string()),
});

function rules(pack: CategoryPack, text: string) {
  const normalized = text.toLocaleLowerCase();
  const amounts = [...normalized.replaceAll(",", "").matchAll(/\d+(?:\.\d+)?/g)]
    .map((match) => Number(match[0]));
  const answers: Answers = {};
  const segmenter = new Intl.Segmenter("th", { granularity: "word" });
  for (const question of pack.questions) {
    const matches = question.options.filter((option) => {
      if (option.requirement?.kind === "budget") {
        return amounts.includes(option.requirement.value ?? -1);
      }
      const tokens = [...segmenter.segment(option.label.toLocaleLowerCase())]
        .filter((part) => part.isWordLike && part.segment.length >= 3)
        .map((part) => part.segment);
      return tokens.some((token) => normalized.includes(token));
    });
    answers[question.id] = (question.multi ? matches : matches.slice(0, 1))
      .map((option) => option.label);
  }
  return requirementsFromAnswers(pack, answers);
}

export async function requirementsFromText(pack: CategoryPack, text: string): Promise<Requirement[]> {
  if (!text.trim()) return [];
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  if (!apiKey || !model) return rules(pack, text);
  try {
    const response = await new OpenAI({ apiKey, timeout: 6_000, maxRetries: 0 }).responses.parse({
      model,
      reasoning: { effort: "low" },
      instructions: "เลือกเฉพาะตัวเลือกที่ตรงความต้องการ ระบุ questionId และ optionIndex เริ่มที่ศูนย์ เพิ่ม extraNeeds ได้ไม่เกินสองข้อความ ห้ามสร้างคะแนนหรืออันดับ",
      input: JSON.stringify({ pack, text }),
      text: { format: zodTextFormat(extractionSchema, "requirements") },
    });
    const parsed = extractionSchema.parse(response.output_parsed);
    if (parsed.extraNeeds.length > 2) throw new Error("Too many additional requirements");
    const answers: Answers = {};
    for (const choice of parsed.choices) {
      const question = pack.questions.find((item) => item.id === choice.questionId);
      const option = question?.options[choice.optionIndex];
      if (!question || !option) throw new Error("Invalid category choice");
      const previous = answers[question.id];
      if (!question.multi && previous !== undefined) throw new Error("Multiple single-choice answers");
      answers[question.id] = [...(Array.isArray(previous) ? previous : []), option.label];
    }
    return [
      ...requirementsFromAnswers(pack, answers),
      ...parsed.extraNeeds.filter((text) => text.trim()).map((text, index): Requirement => ({
        id: `free-${index + 1}`, text, kind: "nice",
      })),
    ];
  } catch {
    return rules(pack, text);
  }
}
