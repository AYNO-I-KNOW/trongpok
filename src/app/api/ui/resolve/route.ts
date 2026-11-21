import { z } from "zod";
import { findByLink } from "@/lib/catalog";

export async function POST(request: Request) {
  const body = z.object({ link: z.string().max(2000) }).safeParse(await request.json().catch(() => null));
  if (!body.success) return Response.json({ error: "กรุณาระบุลิงก์สินค้า" }, { status: 400 });
  return Response.json(await findByLink(body.data.link));
}
