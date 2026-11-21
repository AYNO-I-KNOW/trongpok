import { productSearchRequestSchema } from "@/lib/product-search/contract";
import { searchProducts } from "@/lib/product-search/service";

export const maxDuration = 300;
export async function POST(request: Request) {
  const parsed = productSearchRequestSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return Response.json(
      { kind: "unavailable", message: "โจทย์หรือคำตอบไม่ถูกต้อง กรุณาลองอีกครั้ง" },
      { status: 400 },
    );
  return Response.json(
    await searchProducts(parsed.data.query, undefined, request.signal, parsed.data.clarifications),
  );
}
