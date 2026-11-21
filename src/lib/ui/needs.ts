import type { CategoryPack, Requirement } from "../types";

export type Answers = Record<string, string[]>;

export function requirementsFromSelection(pack: CategoryPack, answers: Answers): Requirement[] {
  const selected = pack.questions.flatMap((question) => question.options
    .filter((option) => answers[question.id]?.includes(option.label))
    .flatMap((option) => option.requirement ? [option.requirement] : []));
  return [...new Map(selected.map((requirement) => [requirement.id, requirement])).values()];
}

export function prefillSelection(pack: CategoryPack, text: string): Answers {
  const normalized = text.toLocaleLowerCase();
  const aliases: Record<string, string[]> = {
    ice: ["น้ำแข็ง", "เปิดร้าน"], smoothie: ["สมูทตี้", "น้ำผลไม้"], grind: ["เมล็ด", "ถั่ว", "ของแห้ง"],
    quiet: ["เงียบ", "คอนโด"], gps: ["gps", "วิ่ง", "จักรยาน"], swim: ["ว่ายน้ำ"],
    "line-th": ["line", "ภาษาไทย"], "health-basic": ["นับก้าว", "การนอน"], call: ["รับสาย"],
    ios: ["iphone", "ios"], android: ["android", "แอนดรอยด์"], "battery-7d": ["7 วัน", "แบตอึด"],
  };
  return Object.fromEntries(pack.questions.map((question) => {
    const options = question.options.filter((option) => {
      const requirement = option.requirement;
      if (!requirement) return false;
      if (requirement.kind === "budget") return false;
      return normalized.includes(option.label.toLocaleLowerCase()) || (aliases[requirement.id] ?? [])
        .some((keyword) => normalized.includes(keyword));
    });
    return [question.id, (question.multi ? options : options.slice(0, 1)).map((option) => option.label)];
  }));
}

export function toggleAnswer(answers: Answers, questionId: string, label: string, multi: boolean): Answers {
  const current = answers[questionId] ?? [];
  const next = current.includes(label) ? current.filter((item) => item !== label) : multi ? [...current, label] : [label];
  return { ...answers, [questionId]: next };
}

export function validateSelection(pack: CategoryPack, answers: Answers): boolean {
  return Object.entries(answers).every(([id, selected]) => {
    const question = pack.questions.find((item) => item.id === id);
    return question && (question.multi || selected.length <= 1) && new Set(selected).size === selected.length &&
      selected.every((label) => question.options.some((option) => option.label === label));
  });
}
