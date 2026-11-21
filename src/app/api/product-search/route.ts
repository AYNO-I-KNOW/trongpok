import { z } from "zod";
import { searchProducts } from "@/lib/product-search/service";

export const maxDuration = 300;
const requestSchema = z.object({ query: z.string().trim().min(1).max(1200) });
export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return Response.json(
      { kind: "unavailable", message: "กรุณาระบุโจทย์สินค้าไม่เกิน 1,200 ตัวอักษร" },
      { status: 400 },
    );
  return Response.json(
    await searchProducts(parsed.data.query, undefined, request.signal),
  );
}
