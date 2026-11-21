import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, expect, it, vi } from "vitest";
import { buildReport } from "./metrics";
import { getEvalReportResponse } from "./report";

let root: string;
afterEach(async () => { vi.restoreAllMocks(); if (root) await rm(root, { recursive: true, force: true }); });
it("renders all methods and unmeasured values from a fixture report", async () => {
  root = await mkdtemp(join(tmpdir(), "eval-view-"));
  await mkdir(join(root, "data/cache"), { recursive: true });
  vi.spyOn(process, "cwd").mockReturnValue(root);
  const report = buildReport([]);
  report.meanSavingsVsStars = -125;
  const path = join(root, "data/cache/eval-report.json");
  await writeFile(path, JSON.stringify(report));
  const response = await getEvalReportResponse();
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toContain('<html lang="th">');
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

it("serves the actual GET endpoint as HTML or validated JSON", async () => {
  root = await mkdtemp(join(tmpdir(), "eval-view-"));
  await mkdir(join(root, "data/cache"), { recursive: true });
  vi.spyOn(process, "cwd").mockReturnValue(root);
  const { GET } = await import("../../app/api/eval/route");
  await mkdir(join(root, "data/cache"), { recursive: true });
  const cwd = vi.spyOn(process, "cwd").mockReturnValue(root);
  try {
    const request = (accept: string) => new Request("http://localhost/api/eval", { headers: { accept } });
    expect(await (await GET(request("application/json"))).json()).toMatchObject({ report: null });
    const report = buildReport([]);
    await writeFile(join(root, "data/cache/eval-report.json"), JSON.stringify(report));
    expect(await (await GET(request("application/json"))).json()).toEqual({ report });
    expect((await GET(request("text/html"))).headers.get("content-type")).toContain("text/html");
    await writeFile(join(root, "data/cache/eval-report.json"), "{}");
    expect((await GET(request("application/json"))).status).toBe(500);
  } finally {
    cwd.mockRestore();
  }
});
