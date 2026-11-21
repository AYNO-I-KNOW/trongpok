import { z } from "zod";
import type { Persona } from "../personas";

export const methods = ["ours", "ours-rules", "stars", "popular", "plain-llm"] as const;
export type Method = typeof methods[number];
const nullableRatio = z.number().min(0).max(1).nullable();
const methodSchema = z.object({
  n: z.number().int().nonnegative(),
  top1HitRate: nullableRatio,
  meanTop3Overlap: z.number().min(0).max(3).nullable(),
  mustFailureRate: nullableRatio,
});
export const EvalReportSchema = z.object({
  n: z.number().int().nonnegative(),
  interLabelerTop1Agreement: nullableRatio,
  methods: z.record(z.enum(methods), methodSchema),
  meanSavingsVsStars: z.number().nullable(),
  savingsN: z.number().int().nonnegative(),
});
export type EvalReport = z.infer<typeof EvalReportSchema>;
export type EvaluationRow = {
  persona: Persona;
  rankings: Record<Method, string[] | null>;
  prices: Record<string, number>;
};
const ids = (text: string) => text.split("|").map((id) => id.trim()).filter(Boolean);
const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

export function buildReport(rows: EvaluationRow[]): EvalReport {
  const summaries = Object.fromEntries(methods.map((method) => {
    const measured = rows.filter((row) => row.rankings[method] !== null);
    const hits: number[] = [], overlaps: number[] = [], failures: number[] = [];
    for (const row of measured) {
      const picks = row.rankings[method] ?? [];
      const human = ids(row.persona.human_top3).slice(0, 3);
      hits.push(Number(Boolean(picks[0]) && picks[0] === human[0]));
      overlaps.push(new Set(picks.slice(0, 3).filter((id) => human.includes(id))).size);
      const notedIds: string[] = row.persona.must_notes.match(/[a-z0-9]+(?:-[a-z0-9]+)*/gi) ?? [];
      failures.push(Number(Boolean(picks[0]) && notedIds.includes(picks[0])));
    }
    return [method, { n: measured.length, top1HitRate: mean(hits), meanTop3Overlap: mean(overlaps), mustFailureRate: mean(failures) }];
  }));
  const agreement = rows.flatMap(({ persona }) => {
    const a = ids(persona.labeler_a_top3)[0], b = ids(persona.labeler_b_top3)[0];
    return a && b ? [Number(a === b)] : [];
  });
  const savings = rows.flatMap((row) => {
    const ours = row.rankings.ours?.[0], stars = row.rankings.stars?.[0];
    return ours && stars && Object.hasOwn(row.prices, ours) && Object.hasOwn(row.prices, stars)
      ? [row.prices[stars] - row.prices[ours]] : [];
  });
  return EvalReportSchema.parse({ n: rows.length, methods: summaries,
    interLabelerTop1Agreement: mean(agreement), meanSavingsVsStars: mean(savings), savingsN: savings.length });
}
