import { loadProducts } from "@/lib/catalog";

export async function GET(
  _request: Request,
  context: RouteContext<"/api/demo-products/[id]">,
) {
  const { id } = await context.params;
  const product = (await loadProducts()).find((entry) => entry.id === id);
  if (!product)
    return Response.json({ message: "ไม่มีรุ่นนี้ในชุดเดโม" }, { status: 404 });
  return Response.json({ source: "ข้อมูลเดโมสังเคราะห์", product });
}
