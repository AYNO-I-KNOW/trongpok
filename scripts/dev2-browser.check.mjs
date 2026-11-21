import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(join(process.env.PLAYWRIGHT_ROOT, "package.json"));
const { chromium } = require("playwright");
const pack = JSON.parse(readFileSync("data/categories/blender.json", "utf8"));
const options = pack.questions.flatMap((question) => question.options);
const ice = options.find((option) => option.requirement?.id === "ice");
const budget = options.find((option) => option.requirement?.kind === "budget" && option.requirement.value === 3000);
const base = "http://127.0.0.1:3000";
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3000"], { stdio: "inherit" });
let browser;
let page;
const errors = [];

async function answerQuestions(select) {
  for (const [index, question] of pack.questions.entries()) {
    await page.getByRole("heading", { name: question.text, exact: true }).waitFor();
    await select(question);
    const next = index + 1 === pack.questions.length ? "ตรวจความต้องการ" : "ถัดไป";
    await page.getByRole("button", { name: next, exact: true }).click();
  }
  await page.getByRole("heading", { name: "เข้าใจตรงกันก่อนเริ่ม", exact: true }).waitFor();
}

const comparison = () => page.getByRole("table", { name: "เปรียบเทียบรุ่นตามโจทย์", exact: true });

try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw new Error("Production server exited");
    try { ready = (await fetch(base)).ok; } catch {}
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.ok(ready, "Production server did not become ready");
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  page = await context.newPage();
  page.setDefaultTimeout(20000);
  page.on("pageerror", (error) => errors.push(error.message));

  await page.goto(base + "/?demo=ranking");
  await page.getByRole("heading", { name: "เริ่มค้นหาของที่คุณต้องการ", exact: true }).waitFor();
  assert.equal(await page.locator(".prototype-label, .fit-score-row").count(), 0);
  await page.goto(base);
  await page.locator("main.phone.home img[src='/assets/home.png']").waitFor();
  const homeSearch = () => page.getByRole("textbox", { name: "คำถามหรือลิงก์สินค้า", exact: true });
  const submitSearch = () => page.getByRole("button", { name: "เริ่มค้นหา", exact: true }).click();
  const waitForProductSearch = () => page.waitForResponse((response) =>
    new URL(response.url()).pathname === "/api/product-search" && response.request().method() === "POST");
  const initialSearch = waitForProductSearch();
  await homeSearch().fill("เครื่องปั่น");
  await submitSearch();
  assert.equal((await (await initialSearch).json()).kind, "clarify");
  await page.getByRole("heading", { name: "จะเอาไปใช้ทำอะไร", exact: true }).waitFor();
  await page.getByRole("radio", { name: "ปั่นน้ำแข็ง / เปิดร้าน", exact: true }).check();
  const answeredSearch = waitForProductSearch();
  await page.getByRole("button", { name: "เริ่มค้นหาต่อ", exact: true }).click();
  const fallback = await (await answeredSearch).json();
  assert.equal(fallback.kind, "demo", "Answered homepage search falls back to the demo catalog without a key");
  assert.ok(fallback.picks.length > 0);
  await comparison().waitFor();
  assert.equal(await comparison().locator(".fit-score-row").count(), 0);
  await comparison().getByRole("link", { name: /^ดูข้อมูลเดโม / }).first().waitFor();
  const designerWidth = await page.locator("main.phone.result").evaluate((node) => getComputedStyle(node).maxWidth);

  await page.goto(base + "/arena");
  await homeSearch().fill("เครื่องปั่นไว้ปั่นน้ำแข็งเปิดร้าน งบ 3,000 บาท");
  await submitSearch();
  await page.getByRole("radio", { name: "บดน้ำแข็ง", exact: true }).check();
  await page.getByRole("button", { name: "ถัดไป", exact: true }).click();
  await page.getByRole("radio", { name: "8 ก้อน", exact: true }).check();
  await page.getByRole("button", { name: "ถัดไป", exact: true }).click();
  await page.getByRole("radio", { name: "โถปั่นหลัก", exact: true }).check();
  await page.getByRole("button", { name: "ดูสรุปเงื่อนไข", exact: true }).click();
  await page.getByRole("heading", { name: "เงื่อนไขที่จะใช้เปรียบเทียบ" }).waitFor();
  await page.getByText(/งบ.*3,000 บาท/).waitFor();
  await page.getByRole("button", { name: "เริ่มค้นหาต่อ", exact: true }).click();
  await comparison().waitFor();
  await page.locator(".demo-label").filter({ hasText: "ราคาและรีวิวไม่ใช่ข้อมูลจริง" }).waitFor();
  await page.locator(".demo-label").filter({ hasText: "โหมดกฎ" }).waitFor();
  await page.getByRole("button", { name: "เหตุผลและหลักฐาน", exact: true }).click();
  await page.getByRole("button", { name: /^ดูหลักฐาน เครื่องปั่นครอบลดเสียง/ }).click();
  const skeptic = page.getByRole("dialog");
  const sourceLink = await skeptic.getByRole("link", { name: /เปิดข้อมูลต้นทาง/ }).getAttribute("href");
  assert.equal(sourceLink, "/api/demo-products/blender-quiet-daily");
  const catalog = await page.request.get(base + sourceLink);
  assert.ok(catalog.ok());
  const review = (await catalog.json()).product.reviews.find(({ id }) => id === "r5");
  assert.ok(review);
  await skeptic.getByText(/รีวิวต้นทาง r5/).waitFor();
  await skeptic.getByText(review.text, { exact: true }).waitFor();
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.goto(base);
  await page.getByRole("link", { name: /เปรียบเทียบจากรีวิวใน Arena/ }).click();
  await page.waitForURL((url) => url.pathname === "/compare");
  await homeSearch().fill("เครื่องปั่นปั่นน้ำแข็ง");
  await page.getByRole("button", { name: "เริ่มค้นหา", exact: true }).click();
  await page.locator("main.phone.clarify .question-nav").waitFor();
  await answerQuestions(async (question) => {
    if (question.options.includes(ice)) await page.getByRole("checkbox", { name: ice.label, exact: true }).check();
    if (question.options.includes(budget)) await page.getByRole("radio", { name: budget.label, exact: true }).check();
  });
  const reviewedIce = page.locator(".requirement-edit").filter({ hasText: ice.requirement.text });
  await reviewedIce.getByRole("button", { name: "เปลี่ยนเป็นมีก็ดี", exact: true }).click();
  const arenaRequest = (request) => new URL(request.url()).pathname === "/api/arena" && request.method() === "POST";
  const requestPromise = page.waitForRequest(arenaRequest);
  const responsePromise = page.waitForResponse((response) => arenaRequest(response.request()));
  const arenaPage = page.waitForURL((url) => url.pathname === "/arena" && url.searchParams.get("flow") === "compare");
  await page.getByRole("button", { name: "เริ่มเปรียบเทียบ", exact: true }).click();
  await arenaPage;
  const sent = (await requestPromise).postDataJSON();
  assert.equal(sent.requirements.find((item) => item.id === "ice").kind, "nice");
  assert.equal(sent.requirements.find((item) => item.kind === "budget").value, 3000);
  await page.waitForURL((url) => url.pathname === "/results", { timeout: 45000 });
  await comparison().waitFor();
  const stream = await (await responsePromise).text();
  const payload = stream.match(/event: result\r?\ndata: ([^\r\n]+)/);
  assert.ok(payload, "Arena did not return a result event");
  const result = JSON.parse(payload[1]);
  const ranked = result.ranked.slice(0, 3);
  assert.deepEqual(result.events.filter((event) => event.type === "start").map((event) => event.agent),
    ["fit", "value", "skeptic", "judge"]);
  assert.ok(ranked.length > 1, "Expected multiple ranked options");
  const headers = comparison().getByRole("columnheader");
  assert.deepEqual(await headers.evaluateAll((items) => items.map((item) => item.dataset.productId)),
    ranked.map((item) => item.productId), "The designer's table must keep the backend ranking");
  const fitPills = comparison().locator(".fit-score-row .fit-pill");
  for (const [index, item] of ranked.entries()) {
    assert.match(await fitPills.nth(index).getAttribute("aria-label"), new RegExp("เหมาะ " + item.fitPct + " เปอร์เซ็นต์$"));
  }
  assert.equal(await page.locator("main.phone.result").evaluate((node) => getComputedStyle(node).maxWidth), designerWidth);

  const resultsUrl = page.url();
  const emptyTab = await context.newPage();
  await emptyTab.goto(resultsUrl);
  await emptyTab.getByRole("heading", { name: "ยังไม่พบผลเปรียบเทียบนี้" }).waitFor();
  await emptyTab.close();
  await page.getByRole("button", { name: "เหตุผลและหลักฐาน", exact: true }).click();
  await page.getByRole("link", { name: /^ดูหลักฐาน / }).first().click();
  await page.waitForURL((url) => url.pathname.startsWith("/p/"));
  await page.getByRole("dialog").locator(".evidence-card").first().waitFor();
  await page.reload();
  await page.getByRole("dialog").locator(".evidence-card").first().waitFor();
  await page.getByRole("button", { name: "ปิดหลักฐาน" }).click();
  await page.waitForURL(resultsUrl);
  await comparison().waitFor();
  await page.reload();
  await comparison().waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 2), "The comparison table overflows a 390px viewport");

  await page.goto(base + "/compare?q=" + encodeURIComponent("https://shopee.co.th/product/999999999/999999999"));
  await page.getByRole("alert").filter({ hasText: "ลิงก์นี้ยังไม่อยู่ในชุดเดโม" }).waitFor();
  await page.getByRole("button", { name: /เครื่องปั่น.*เลือก/ }).click();
  await page.getByRole("heading", { name: pack.questions[0].text, exact: true }).waitFor();

  await page.goto(base + "/compare?font=line");
  await page.getByRole("button", { name: /ลองข้อมูลตัวอย่าง/ }).click();
  await answerQuestions(async (question) => {
    if (!question.options.includes(ice)) return;
    const choice = page.getByRole("checkbox", { name: ice.label, exact: true });
    await choice.focus();
    await choice.press("Space");
    assert.equal(await choice.isChecked(), true);
  });
  await page.getByRole("button", { name: "เริ่มเปรียบเทียบ", exact: true }).click();
  await page.waitForURL((url) => url.pathname === "/results", { timeout: 45000 });
  await comparison().waitFor();
  await page.locator(".demo-label").filter({ hasText: "สินค้า ราคา และรีวิวจำลอง" }).waitFor();
  assert.equal(await page.locator("main.phone.result").getAttribute("data-font"), "line");
  assert.equal(await page.locator(".purchase-row a[target='_blank']").count(), 0);
  assert.deepEqual(errors, []);
  console.log("Browser smoke passed: homepage search, blender Arena, Dev 2 comparison, reviewed conditions, backend ranking, evidence dialog, reload, mobile width, link recovery, keyboard and preview.");
} catch (error) {
  if (page) console.error("Page state: " + (await page.locator("body").innerText().catch(() => "")).slice(0, 3000));
  throw error;
} finally {
  if (browser) await browser.close();
  server.kill("SIGTERM");
}
