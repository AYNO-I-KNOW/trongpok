import { expect, it } from "vitest";
import { buildReport, type EvaluationRow } from "./metrics";

it("measures two personas honestly when a baseline wins", () => {
  const persona = { persona_id: "p1", category: "blender", need_text: "", answers: "", labeler_a_top3: "a|b|c", labeler_b_top3: "a|c|b", human_top3: "a|b|c", must_notes: "a-long: ไม่ผ่าน; b: มอเตอร์ไหม้" };
  const rows: EvaluationRow[] = [
    { persona, prices: { a: 100, b: 200 }, rankings: { ours: ["b", "c", "d"], "ours-rules": ["b"], stars: ["a", "b", "c"], popular: ["c"], "plain-llm": null } },
    { persona: { ...persona, persona_id: "p2", labeler_b_top3: "b|a|c", must_notes: "a-long: ไม่ผ่าน" }, prices: { a: 100, b: 200 }, rankings: { ours: ["a", "d", "e"], "ours-rules": ["b"], stars: ["b", "a", "c"], popular: [], "plain-llm": null } },
  ];
  const report = buildReport(rows, "configured-cache");
  expect(report.n).toBe(2);
  expect(report.methods.ours).toEqual({ n: 2, top1HitRate: 0.5, meanTop3Overlap: 1.5, mustFailureRate: 0.5, mustFailureN: 2 });
  expect(report.methods.stars.meanTop3Overlap).toBe(3);
  expect(report.interLabelerTop1Agreement).toBe(0.5);
  expect(report.interLabelerN).toBe(2);
  expect(report.meanSavingsVsStars).toBe(0);
  expect(report.savingsN).toBe(2);
  expect(report.methods["plain-llm"]).toEqual({ n: 0, top1HitRate: null, meanTop3Overlap: null, mustFailureRate: null, mustFailureN: 0 });
});
it("represents an unmeasured report with null metrics", () => {
  expect(buildReport([], "demo-rules")).toMatchObject({ n: 0, savingsN: 0, meanSavingsVsStars: null, interLabelerTop1Agreement: null, interLabelerN: 0 });
});

it("excludes blank annotations, missing picks, and unpaired labels and prices from their denominators", () => {
  const persona = { persona_id: "p1", category: "blender", need_text: "", answers: "", labeler_a_top3: "a", labeler_b_top3: "a", human_top3: "a", must_notes: "  " };
  const rankings = { ours: ["a"], "ours-rules": [], stars: ["b"], popular: [], "plain-llm": null };
  const report = buildReport([
    { persona, rankings, prices: { a: 250, b: 100 } },
    { persona: { ...persona, persona_id: "p2", labeler_b_top3: "", must_notes: "b: ไม่ผ่าน ต่างจาก a" }, rankings, prices: { a: 10 } },
  ], "demo-rules");

  expect(report.methods.ours).toMatchObject({ n: 2, mustFailureN: 1, mustFailureRate: 0 });
  expect(report.methods.stars).toMatchObject({ n: 2, mustFailureN: 1, mustFailureRate: 1 });
  expect(report.methods["ours-rules"]).toMatchObject({ mustFailureN: 0, mustFailureRate: null });
  expect(report).toMatchObject({ interLabelerTop1Agreement: 1, interLabelerN: 1, meanSavingsVsStars: -150, savingsN: 1 });
});

it("leaves the must-failure rate unmeasured if all annotations are blank", () => {
  const persona = { persona_id: "p1", category: "blender", need_text: "", answers: "", labeler_a_top3: "", labeler_b_top3: "", human_top3: "a", must_notes: "" };
  const report = buildReport([{ persona, prices: { a: 100 }, rankings: { ours: ["a"], "ours-rules": ["a"], stars: ["a"], popular: ["a"], "plain-llm": null } }], "demo-rules");
  expect(report.methods.ours).toMatchObject({ n: 1, mustFailureN: 0, mustFailureRate: null });
});
