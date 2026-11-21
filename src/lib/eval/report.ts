import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { EvalReportSchema, methods, type EvalReport, type Method } from "./metrics";

const names: Record<Method, string> = {
  ours: "ระบบจากผลที่บันทึกไว้",
  "ours-rules": "ระบบโหมดกฎ",
  stars: "เรียงตามดาว",
  popular: "เรียงตามจำนวนรีวิว",
  "plain-llm": "โมเดลเลือกโดยตรง",
};
const number = (value: number | null) => value === null ? "ยังไม่มีข้อมูล" : value.toLocaleString("th-TH", { maximumFractionDigits: 2 });
const percent = (value: number | null) => value === null ? "ยังไม่มีข้อมูล" : number(value * 100) + "%";

function table(report: EvalReport) {
  const rows = methods.map((method) => {
    const result = report.methods[method];
    return `<tr><th scope="row">${names[method]}</th><td>${result.n}</td><td>${percent(result.top1HitRate)}</td><td>${number(result.meanTop3Overlap)}</td><td>${percent(result.mustFailureRate)}</td></tr>`;
  }).join("");
  return `<p>จำนวนโจทย์ ${report.n}</p><div style="overflow-x:auto"><table><caption>เปรียบเทียบวิธีเลือกสินค้า</caption><thead><tr><th scope="col">วิธี</th><th scope="col">จำนวนที่วัด</th><th scope="col">อันดับหนึ่งตรงกับคน</th><th scope="col">จำนวนสินค้าที่ตรงในสามอันดับแรก</th><th scope="col">อันดับหนึ่งไม่ผ่านข้อจำเป็น</th></tr></thead><tbody>${rows}</tbody></table></div><p>ผู้ประเมินเลือกอันดับหนึ่งตรงกัน ${percent(report.interLabelerTop1Agreement)}</p><p>ประหยัดเฉลี่ยเทียบกับการเรียงดาว ${number(report.meanSavingsVsStars)} บาท จาก ${report.savingsN} คู่</p>`;
}

function html(content: string, status = 200) {
  return new Response(`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ผลประเมินตรงปก</title></head><body><main><h1>ผลประเมินตรงปก</h1>${content}</main></body></html>`, {
    status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function getEvalReportResponse(json = false) {
  const message = (text: string, status = 200) => json
    ? Response.json({ report: null, message: text }, { status, headers: { "Cache-Control": "no-store" } })
    : html("<p>" + text + "</p>", status);
  let contents: string;
  try {
    contents = await readFile(join(process.cwd(), "data", "cache", "eval-report.json"), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return message("ยังไม่มีผลประเมิน รอข้อมูลและการประเมินชุดเดโม");
    }
    return message("อ่านผลประเมินไม่ได้", 500);
  }
  const parsed = (() => {
    try { return EvalReportSchema.safeParse(JSON.parse(contents)); }
    catch { return null; }
  })();
  if (!parsed?.success) return message("ข้อมูลผลประเมินไม่ถูกต้อง", 500);
  return json ? Response.json({ report: parsed.data }, { headers: { "Cache-Control": "no-store" } }) : html(table(parsed.data));
}
