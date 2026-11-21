import { describe, expect, it, vi } from "vitest";
import packData from "../../../data/categories/blender.json";
import productData from "../../../data/products/_example.json";
import { CategoryPackSchema, ProductSchema } from "../types";
import { createFitHandler } from "./fit-handler";
import { previewArena } from "./preview";

const pack = CategoryPackSchema.parse(packData);
const product = ProductSchema.parse(productData);
const answers = { use: [pack.questions[0].options[1].label] };
const input = { category: "blender", answers };
const result = previewArena(pack, [pack.questions[0].options[1].requirement!]);
const request = (body: unknown) => new Request("http://localhost/api/fit", { method: "POST", body: JSON.stringify(body) });

function setup() {
  const deps = {
    packs: vi.fn(async () => [pack]),
    find: vi.fn<() => Promise<{ status: "found"; product: typeof product } | { status: "not-in-demo" }>>(async () => ({ status: "not-in-demo" })),
    run: vi.fn(async () => Response.json(result)),
  };
  return { deps, handle: createFitHandler(deps) };
}

describe("fit API boundary", () => {
  it("returns an arena result without events and with evidence metadata", async () => {
    const { handle, deps } = setup();
    const response = await handle(request(input));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.ranked).toEqual(result.ranked);
    expect(body.events).toBeUndefined();
    expect(body.measuredFrom).toBe("earlier buyers' reviews");
    expect(deps.run).toHaveBeenCalledOnce();
  });
  it("returns 404 for a product outside the demo and never starts the arena", async () => {
    const { handle, deps } = setup();
    expect((await handle(request({ ...input, link: "https://s.shopee.co.th/unknown" }))).status).toBe(404);
    expect(deps.run).not.toHaveBeenCalled();
  });
  it("rejects invalid JSON, unknown choices and category mismatches", async () => {
    const { handle, deps } = setup();
    expect((await handle(new Request("http://localhost/api/fit", { method: "POST", body: "{" }))).status).toBe(400);
    expect((await handle(request({ ...input, answers: { use: ["unknown"] } }))).status).toBe(422);
    deps.find.mockResolvedValue({ status: "found", product: { ...product, category: "smartwatch" } });
    expect((await handle(request({ ...input, link: "https://shopee.co.th/product/1/2" }))).status).toBe(422);
    expect(deps.run).not.toHaveBeenCalled();
  });
  it("returns 503 if Dev 1's backend is absent instead of returning synthetic recommendations", async () => {
    const { handle, deps } = setup();
    deps.run.mockResolvedValue(new Response("Not found", { status: 404 }));
    expect((await handle(request(input))).status).toBe(503);
  });
  it("reads named SSE events and preserves cache mode", async () => {
    const { handle, deps } = setup();
    deps.run.mockResolvedValue(new Response(`event: agent\ndata: ${JSON.stringify(result.events[0])}\n\nevent: result\ndata: ${JSON.stringify({ ...result, mode: "cache" })}\n\n`, { headers: { "Content-Type": "text/event-stream" } }));
    const response = await handle(request(input));
    expect(response.status).toBe(200);
    expect((await response.json()).mode).toBe("cache");
  });
  it("rejects an interrupted stream with no final result", async () => {
    const { handle, deps } = setup();
    deps.run.mockResolvedValue(new Response(`data: ${JSON.stringify(result.events[0])}\n\n`, { headers: { "Content-Type": "text/event-stream" } }));
    expect((await handle(request(input))).status).toBe(503);
  });
});
