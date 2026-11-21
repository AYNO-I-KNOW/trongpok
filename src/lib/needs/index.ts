import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { CategoryPack, Requirement } from "../types";

export type Answers = Record<string, string | number | (string | number)[]>;

export function requirementsFromAnswers(pack: CategoryPack, answers: Answers): Requirement[] {
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
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL;
  if (!apiKey || !model) return rules(pack, text);
  try {
    const response = await new OpenAI({ apiKey, timeout: 20_000, maxRetries: 0 }).responses.parse({
      model,
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
