import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import { GET as getEvalApi } from "../../app/api/eval/route";
import { GET as getEvalPage } from "../../app/eval/route";
import { buildReport } from "./metrics";
import { getEvalReportResponse } from "./report";

let root: string;
afterEach(async () => { vi.restoreAllMocks(); if (root) await rm(root, { recursive: true, force: true }); });
it("renders all methods and unmeasured values from a fixture report", async () => {
  root = await mkdtemp(join(tmpdir(), "eval-view-"));
  await mkdir(join(root, "data/cache"), { recursive: true });
  vi.spyOn(process, "cwd").mockReturnValue(root);
  const report = buildReport([{
    persona: { persona_id: "demo", category: "blender", need_text: "", answers: "", human_top3: "a", labeler_a_top3: "a", labeler_b_top3: "a", must_notes: "" },
    prices: { a: 225, b: 100 },
    rankings: { ours: ["a"], "ours-rules": ["a"], stars: ["b"], popular: ["b"], "plain-llm": null },
  }], "demo-rules");
  const path = join(root, "data/cache/eval-report.json");
  await writeFile(path, JSON.stringify(report));
  const response = await getEvalReportResponse();
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toContain('<html lang="th">');
  expect(html).toContain("ข้อมูลสังเคราะห์");
  expect(html).toContain("โหมดกฎเท่านั้น");
  expect(html).toContain("ไม่ใช่สถิติจากร้านค้าจริง");
  expect(html).toContain("ยังไม่มีข้อมูล");
  expect(html).toContain("-125");
  expect(html.match(/scope="row"/g)).toHaveLength(5);
});
it("distinguishes a missing report from invalid stored data", async () => {
  root = await mkdtemp(join(tmpdir(), "eval-view-"));
  await mkdir(join(root, "data/cache"), { recursive: true });
  vi.spyOn(process, "cwd").mockReturnValue(root);
  const path = join(root, "data/cache/eval-report.json");
  expect(await (await getEvalReportResponse()).text()).toContain("ยังไม่มีผลประเมิน");
  await writeFile(path, "{}");
  expect((await getEvalReportResponse()).status).toBe(500);
});

it("serves the same report from /eval and from the negotiated /api/eval endpoint", async () => {
  root = await mkdtemp(join(tmpdir(), "eval-view-"));
  await mkdir(join(root, "data/cache"), { recursive: true });
  vi.spyOn(process, "cwd").mockReturnValue(root);
  const request = (accept: string) => new Request("http://localhost/api/eval", { headers: { accept } });
  expect(await (await getEvalApi(request("application/json"))).json()).toMatchObject({ report: null });
  const report = buildReport([], "configured-cache");
  await writeFile(join(root, "data/cache/eval-report.json"), JSON.stringify(report));
  const json = await (await getEvalApi(request("application/json"))).json();
  expect(json).toEqual({ report });
  expect(json.report.provenance).toEqual({ dataset: "synthetic", mode: "configured-cache" });
  const response = await getEvalApi(request("text/html"));
  expect(response.headers.get("content-type")).toContain("text/html");
  const html = await response.text();
  expect(await (await getEvalPage()).text()).toBe(html);
  expect(html).toContain("ข้อมูลสังเคราะห์");
  expect(html).toContain("ผลที่บันทึกไว้");
  expect(html).not.toContain("โหมดกฎเท่านั้น");
  await writeFile(join(root, "data/cache/eval-report.json"), "{}");
  expect((await getEvalApi(request("application/json"))).status).toBe(500);
});
