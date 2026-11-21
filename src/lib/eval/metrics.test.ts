import { expect, it } from "vitest";
import { buildReport, type EvaluationRow } from "./metrics";

it("measures two personas honestly when a baseline wins", () => {
  const persona = { persona_id: "p1", category: "blender", need_text: "", answers: "", labeler_a_top3: "a|b|c", labeler_b_top3: "a|c|b", human_top3: "a|b|c", must_notes: "a-long: ไม่ผ่าน; b: มอเตอร์ไหม้" };
  const rows: EvaluationRow[] = [
    { persona, prices: { a: 100, b: 200 }, rankings: { ours: ["b", "c", "d"], "ours-rules": ["b"], stars: ["a", "b", "c"], popular: ["c"], "plain-llm": null } },
    { persona: { ...persona, persona_id: "p2", labeler_b_top3: "b|a|c", must_notes: "a-long: ไม่ผ่าน" }, prices: { a: 100, b: 200 }, rankings: { ours: ["a", "d", "e"], "ours-rules": ["b"], stars: ["b", "a", "c"], popular: [], "plain-llm": null } },
  ];
  const report = buildReport(rows);
  expect(report.n).toBe(2);
  expect(report.methods.ours).toEqual({ n: 2, top1HitRate: 0.5, meanTop3Overlap: 1.5, mustFailureRate: 0.5 });
  expect(report.methods.stars.meanTop3Overlap).toBe(3);
  expect(report.interLabelerTop1Agreement).toBe(0.5);
  expect(report.meanSavingsVsStars).toBe(0);
  expect(report.savingsN).toBe(2);
  expect(report.methods["plain-llm"]).toEqual({ n: 0, top1HitRate: null, meanTop3Overlap: null, mustFailureRate: null });
});
it("represents an unmeasured report with null metrics", () => {
  expect(buildReport([])).toMatchObject({ n: 0, savingsN: 0, meanSavingsVsStars: null, interLabelerTop1Agreement: null });
});
