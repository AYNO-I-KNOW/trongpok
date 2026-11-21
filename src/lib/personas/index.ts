import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";

export const PersonaSchema = z.object({
  persona_id: z.string().min(1), category: z.string().min(1),
  need_text: z.string(), answers: z.string(),
  labeler_a_top3: z.string(), labeler_b_top3: z.string(),
  human_top3: z.string(), must_notes: z.string(),
});
export type Persona = z.infer<typeof PersonaSchema>;

export function parsePersonas(csv: string): Persona[] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let index = 0; index < csv.length; index++) {
    const char = csv[index];
    if (char === '"') {
      if (quoted && csv[index + 1] === '"') { field += '"'; index++; }
      else quoted = !quoted;
    } else if (!quoted && (char === "," || char === "\n")) {
      row.push(field.replace(/\r$/, "")); field = "";
      if (char === "\n") { rows.push(row); row = []; }
    } else field += char;
  }
  if (quoted) throw new Error("Unclosed CSV quote");
  if (field || row.length) rows.push([...row, field.replace(/\r$/, "")]);
  const headers = rows.shift()?.map((name) => name.replace(/^\uFEFF/, "")) ?? [];
  const expected = Object.keys(PersonaSchema.shape);
  if (headers.length !== expected.length || new Set(headers).size !== headers.length ||
    expected.some((name) => !headers.includes(name))) throw new Error("Invalid persona CSV headers");
  const ids = new Set<string>();
  return rows.filter((values) => values.some((value) => value.trim())).map((values) =>
    {
      if (values.length !== headers.length) throw new Error("Invalid persona CSV field count");
      const persona = PersonaSchema.parse(Object.fromEntries(headers.map((name, index) => [name, values[index]])));
      if (ids.has(persona.persona_id)) throw new Error("Duplicate persona id");
      ids.add(persona.persona_id);
      personaAnswers(persona);
      return persona;
    });
}

export async function loadPersonas(dataRoot = join(process.cwd(), "data")) {
  return parsePersonas(await readFile(join(dataRoot, "personas.csv"), "utf8"));
}

export function personaAnswers(persona: Persona) {
  const answers: Record<string, string[]> = {};
  for (const entry of persona.answers.split(";").filter(Boolean)) {
    const match = entry.match(/^([^=;]+)=([^=]*)$/);
    if (!match || Object.hasOwn(answers, match[1])) throw new Error("Invalid persona answers");
    answers[match[1]] = match[2].split("|").filter(Boolean);
  }
  return answers;
}

export function personaRequest(persona: Persona) {
  const answers = personaAnswers(persona);
  return {
    category: persona.category,
    needText: persona.need_text,
    ...(Object.values(answers).some((values) => values.length) ? { answers } : {}),
  };
}
