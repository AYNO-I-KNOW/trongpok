import { z } from "zod";
import type { Persona } from "../personas";

export const methods = ["ours", "ours-rules", "stars", "popular", "plain-llm"] as const;
export type Method = typeof methods[number];
const nullableRatio = z.number().min(0).max(1).nullable();
const count = z.number().int().nonnegative();
const methodSchema = z.object({
  n: count,
  top1HitRate: nullableRatio,
  meanTop3Overlap: z.number().min(0).max(3).nullable(),
  mustFailureRate: nullableRatio,
  mustFailureN: count,
});
export const EvalReportSchema = z.object({
  provenance: z.object({ dataset: z.literal("synthetic"), mode: z.enum(["demo-rules", "configured-cache"]) }),
  n: count,
  interLabelerTop1Agreement: nullableRatio,
  interLabelerN: count,
  methods: z.record(z.enum(methods), methodSchema),
  meanSavingsVsStars: z.number().nullable(),
  savingsN: count,
});
export type EvalReport = z.infer<typeof EvalReportSchema>;
export type EvaluationRow = {
  persona: Persona;
  rankings: Record<Method, string[] | null>;
  prices: Record<string, number>;
};
const ids = (text: string) => text.split("|").map((id) => id.trim()).filter(Boolean);
const mean = (values: number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;

export function buildReport(rows: EvaluationRow[], mode: EvalReport["provenance"]["mode"]): EvalReport {
  const annotated = rows.map((row) => ({
    ...row,
    human: ids(row.persona.human_top3).slice(0, 3),
    failedIds: new Set(row.persona.must_notes.split(";").map((note) => note.split(":", 1)[0].trim()).filter(Boolean)),
  }));
  const summaries = Object.fromEntries(methods.map((method) => {
    const hits: number[] = [], overlaps: number[] = [], failures: number[] = [];
    for (const { rankings, human, failedIds } of annotated) {
      const picks = rankings[method];
      if (picks === null) continue;
      hits.push(Number(Boolean(picks[0]) && picks[0] === human[0]));
      overlaps.push(new Set(picks.slice(0, 3).filter((id) => human.includes(id))).size);
      if (picks[0] && failedIds.size) failures.push(Number(failedIds.has(picks[0])));
    }
    return [method, { n: hits.length, top1HitRate: mean(hits), meanTop3Overlap: mean(overlaps), mustFailureRate: mean(failures), mustFailureN: failures.length }];
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
  return EvalReportSchema.parse({ provenance: { dataset: "synthetic", mode }, n: rows.length, methods: summaries,
    interLabelerTop1Agreement: mean(agreement), interLabelerN: agreement.length, meanSavingsVsStars: mean(savings), savingsN: savings.length });
}
