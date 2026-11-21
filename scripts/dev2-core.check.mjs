import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { EventDecoder, readEventStream } from "../src/lib/ui/stream.ts";
import { prefillSelection, requirementsFromSelection, toggleAnswer, validateSelection } from "../src/lib/ui/needs.ts";
import { outboundLink, safeAgentEvent, safeQuotes, trustText } from "../src/lib/ui/presentation.ts";
import { splitNeedInput } from "../src/lib/ui/input.ts";

const pack = JSON.parse(await readFile(new URL("../data/categories/blender.json", import.meta.url), "utf8"));
const product = JSON.parse(await readFile(new URL("../data/products/_example.json", import.meta.url), "utf8"));

test("mixed Thai text and one product link preserve both the need and the linked product", () => {
  const link = "https://shopee.co.th/product/123/456?variation=2";
  assert.deepEqual(splitNeedInput("ปั่นน้ำแข็ง " + link + " งบ 3000"), { link, needText: "ปั่นน้ำแข็ง  งบ 3000" });
  assert.deepEqual(splitNeedInput("  นาฬิกาสำหรับวิ่ง  "), { link: undefined, needText: "นาฬิกาสำหรับวิ่ง" });
  assert.deepEqual(splitNeedInput(link), { link, needText: "" });
});

test("multiple product links are rejected before an ambiguous comparison starts", () => {
  assert.throws(() => splitNeedInput("https://shopee.co.th/product/1/2 https://shopee.co.th/product/3/4"), /หนึ่งรายการ/);
});

test("single choice replaces a previous budget and multi choice preserves both uses", () => {
  let answers = toggleAnswer({}, "budget", pack.questions[3].options[0].label, false);
  answers = toggleAnswer(answers, "budget", pack.questions[3].options[1].label, false);
  answers = toggleAnswer(answers, "use", pack.questions[0].options[0].label, true);
  answers = toggleAnswer(answers, "use", pack.questions[0].options[1].label, true);
  const requirements = requirementsFromSelection(pack, answers);
  assert.equal(requirements.filter((item) => item.kind === "budget").length, 1);
  assert.equal(requirements.find((item) => item.kind === "budget").value, 3000);
  assert.equal(requirements.filter((item) => item.kind === "must").length, 2);
});

test("null options do not create a requirement; unknown answers and conflicting choices are rejected", () => {
  assert.deepEqual(requirementsFromSelection(pack, { noise: [pack.questions[2].options[1].label] }), []);
  assert.equal(validateSelection(pack, { budget: [pack.questions[3].options[0].label, pack.questions[3].options[1].label] }), false);
  assert.equal(validateSelection(pack, { use: ["invented"] }), false);
  assert.equal(validateSelection(pack, { invented: [] }), false);
  assert.equal(validateSelection(pack, { use: [pack.questions[0].options[0].label] }), true);
});

test("Thai free text prefills needs but does not silently choose a budget", () => {
  const requirements = requirementsFromSelection(pack, prefillSelection(pack, "อยากเปิดร้านปั่นน้ำแข็ง"));
  assert.ok(requirements.some((item) => item.id === "ice"));
  assert.ok(requirements.every((item) => item.kind !== "budget"));
});

test("SSE decoder handles CRLF split between chunks, comments and multiline data", () => {
  const decoder = new EventDecoder();
  assert.deepEqual(decoder.push(": keepalive\r\n\r\nevent: agent\r\ndata: first\r"), []);
  assert.deepEqual(decoder.push("\ndata: second\r\n\r"), []);
  assert.deepEqual(decoder.push("\n"), [{ event: "agent", data: "first\nsecond" }]);
  assert.deepEqual(decoder.push("data: tail", true), [{ event: "message", data: "tail" }]);
});

test("stream reconstructs Thai text even with every UTF-8 byte in its own chunk", async () => {
  const bytes = new TextEncoder().encode('event: agent\ndata: {"text":"กำลังเปรียบเทียบ"}\n\nevent: result\ndata: {"done":true}\n\n');
  let index = 0;
  const stream = new ReadableStream({ pull(controller) {
    if (index === bytes.length) controller.close();
    else controller.enqueue(bytes.slice(index, ++index));
  } });
  const frames = [];
  await readEventStream(stream, (frame) => frames.push(frame));
  assert.equal(JSON.parse(frames[0].data).text, "กำลังเปรียบเทียบ");
  assert.equal(frames[1].event, "result");
  assert.deepEqual(JSON.parse(frames[1].data), { done: true });
});

test("cancelled streams reject and release the reader", async () => {
  const controller = new AbortController();
  const stream = new ReadableStream({ start() {} });
  const reading = readEventStream(stream, () => undefined, controller.signal);
  controller.abort();
  await assert.rejects(reading, { name: "AbortError" });
  assert.equal(stream.locked, false);
});

test("UI drops invented quotes, template reviews and delivery-only evidence", () => {
  const label = { reviewId: "r2", subjectId: "ice", target: "product", stance: "contradict", quote: product.reviews[1].text };
  assert.equal(safeQuotes(product, [label]).length, 1);
  assert.equal(safeQuotes(product, [{ ...label, quote: "invented" }]).length, 0);
  assert.equal(safeQuotes(product, [{ ...label, target: "logistics" }]).length, 0);
  assert.equal(safeQuotes(product, [{ ...label, reviewId: "r5", quote: product.reviews[4].text }]).length, 0);
});

test("trust is withheld for insufficient data and outbound links reject untrusted URLs", () => {
  assert.equal(trustText(product, { trust: null, requirements: [], objections: [] }), "ข้อมูลไม่พอ");
  assert.equal(trustText(product, { trust: 0.9, requirements: [], objections: [] }), "ข้อมูลไม่พอ");
  assert.ok(outboundLink({ ...product, shopeeUrl: "javascript:alert(1)" }).startsWith("https://shopee.co.th/search?keyword="));
  assert.ok(outboundLink({ ...product, shopeeUrl: "https://evil.example/product" }).startsWith("https://shopee.co.th/search?keyword="));
  assert.equal(outboundLink({ ...product, shopeeUrl: "https://shopee.co.th/product/1/2" }), "https://shopee.co.th/product/1/2");
});

test("live Arena quotes are verified before rendering", () => {
  const event = { agent: "skeptic", type: "objection", productId: product.id, text: "พบข้อควรระวัง", quote: product.reviews[1].text };
  assert.equal(safeAgentEvent(event, [product]).quote, event.quote);
  assert.equal(safeAgentEvent({ ...event, quote: "invented" }, [product]).quote, undefined);
  assert.equal(safeAgentEvent({ ...event, productId: "unknown" }, [product]).quote, undefined);
});
