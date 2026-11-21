import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { Product } from "../types";

const selection = z.object({ ids: z.array(z.string()) });

export async function plainLlm(need: string, products: Product[]): Promise<string[] | null> {
  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL) return null;
  try {
    const response = await new OpenAI({ timeout: 20000, maxRetries: 0 }).responses.parse({
      model: process.env.OPENAI_MODEL,
      instructions: "เลือกสินค้าที่เหมาะกับความต้องการที่สุดไม่เกินสามอันดับ คืนเฉพาะ ids ตามลำดับ",
      input: JSON.stringify({ need, products: products.map(({ id, title, priceThb, specs, stars }) => ({ id, title, priceThb, specs, stars })) }),
      text: { format: zodTextFormat(selection, "selection") },
    });
    const { ids } = selection.parse(response.output_parsed);
    if (ids.length !== Math.min(3, products.length) || new Set(ids).size !== ids.length ||
      ids.some((id) => !products.some((product) => product.id === id))) return null;
    return ids;
  } catch {
    return null;
  }
}
