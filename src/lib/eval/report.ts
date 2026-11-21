import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { EvalReportSchema, methods, type EvalReport, type Method } from "./metrics";

const names: Record<Method, string> = {
  ours: "ระบบจากผลที่บันทึกไว้",
  "ours-rules": "จัดอันดับด้วยกฎโดยตรง",
  stars: "เรียงตามดาว",
  popular: "เรียงตามจำนวนรีวิว",
  "plain-llm": "โมเดลเลือกโดยตรง",
};
const number = (value: number | null) => value === null ? "ยังไม่มีข้อมูล" : value.toLocaleString("th-TH", { maximumFractionDigits: 2 });
const percent = (value: number | null) => value === null ? "ยังไม่มีข้อมูล" : number(value * 100) + "%";
const styles = `
  * { box-sizing: border-box }
  html { background: #f3f2f0; color: #303030; font: 400 16px/1.6 "IBM Plex Sans Thai", system-ui, sans-serif }
  body { margin: 0 }
  main { max-width: 48rem; min-height: 100vh; margin: 0 auto; padding: clamp(1rem, 4vw, 2rem); background: #fff }
  h1 { margin: 0 0 1rem; color: #613825; font-size: clamp(1.5rem, 5vw, 2rem) }
  .comparison { overflow-x: auto }
  table { width: 100%; min-width: 32rem; border-collapse: collapse; font-size: .875rem }
  caption { padding: 0 0 .5rem; text-align: left; font-weight: 600 }
  th, td { padding: .5rem; border-bottom: 1px solid #e8e8ed; text-align: left; vertical-align: top }
  thead { background: #ffe6e0; color: #613825 }
  small { color: #756b66 }
  @media (min-width: 35rem) { .scroll-hint { display: none } }
`;

function renderReport(report: EvalReport) {
  const demo = report.provenance.mode === "demo-rules";
  const mode = demo
    ? "โหมดกฎเท่านั้น สร้างผล Arena ใหม่ทุกโจทย์โดยไม่เรียก OpenAI และไม่ใช้แคชเดิม"
    : "การประเมินตามการตั้งค่า ใช้ผล Arena ที่บันทึกไว้ซึ่งอาจมีโมเดลร่วมประเมิน";
  const rows = methods.map((method) => {
    const result = report.methods[method];
    const name = demo && method === "ours" ? "ระบบ Arena โหมดกฎ" : names[method];
    return `<tr><th scope="row">${name}</th><td>${result.n}</td><td>${percent(result.top1HitRate)}</td><td>${number(result.meanTop3Overlap)}</td><td>${percent(result.mustFailureRate)}<br><small>${result.mustFailureN} โจทย์</small></td></tr>`;
  }).join("");
  const savings = report.meanSavingsVsStars === null ? number(null) : `${number(report.meanSavingsVsStars)} บาท`;
  return `
    <p><strong>ข้อมูลสังเคราะห์ชุดเดโม</strong> ผลนี้ไม่ใช่สถิติจากร้านค้าจริง</p>
    <p>${mode}</p>
    <p>จำนวนโจทย์ ${report.n}</p>
    <p class="scroll-hint"><small>เลื่อนตารางเพื่อดูทุกคอลัมน์</small></p>
    <div class="comparison" role="region" aria-labelledby="comparison-caption" tabindex="0">
      <table><caption id="comparison-caption">เปรียบเทียบวิธีเลือกสินค้า</caption><thead><tr><th scope="col">วิธี</th><th scope="col">จำนวนที่วัด</th><th scope="col">อันดับหนึ่งตรงกับอันดับอ้างอิง</th><th scope="col">จำนวนสินค้าที่ตรงในสามอันดับแรก</th><th scope="col">อันดับหนึ่งไม่ผ่านข้อจำเป็น</th></tr></thead><tbody>${rows}</tbody></table>
    </div>
    <p>วัดการไม่ผ่านข้อจำเป็นเฉพาะโจทย์ที่มีบันทึกและมีสินค้าอันดับหนึ่งให้เทียบ</p>
    <p>อันดับหนึ่งจากสองคอลัมน์ผู้ประเมินตรงกัน ${percent(report.interLabelerTop1Agreement)} จาก ${report.interLabelerN} โจทย์ที่มีอันดับทั้งสองช่อง</p>
    <p>ส่วนต่างราคาเฉลี่ย ${savings} จาก ${report.savingsN} คู่ (ราคาอันดับหนึ่งเมื่อเรียงตามดาว ลบราคาอันดับหนึ่งของ Arena)</p>
  `;
}

function html(content: string, status = 200) {
  return new Response(`<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ผลประเมินตรงปก</title><style>${styles}</style></head><body><main><h1>ผลประเมินตรงปก</h1>${content}</main></body></html>`, {
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
  return json ? Response.json({ report: parsed.data }, { headers: { "Cache-Control": "no-store" } }) : html(renderReport(parsed.data));
}
