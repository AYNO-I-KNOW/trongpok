import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { Ranked, Requirement } from "../types";

const explanations = z.object({ picks: z.array(z.object({
  productId: z.string(), why: z.string().min(1), tradeoff: z.string().min(1),
})) });

export async function judge(ranked: Ranked[], requirements: Requirement[], mode = "llm") {
  const rules = () => ({
    mode: "rules" as const,
    ranked: ranked.map((row) => {
      const ordered = row.requirements.toSorted((a, b) => b.score - a.score);
      const strongest = ordered.find((item) => ["pass", "spec-only"].includes(item.status));
      const weakest = ordered.at(-1);
      const text = (id: string) => requirements.find((item) => item.id === id)?.text ?? id;
      return { ...row,
        why: strongest ? `เหมาะกับความต้องการเรื่อง ${text(strongest.requirementId)}` : "หลักฐานยังไม่พอยืนยันความเหมาะสม",
        tradeoff: weakest ? `ควรพิจารณาเรื่อง ${text(weakest.requirementId)} เพิ่มเติม` : "ยังไม่มีข้อกำหนดสำหรับเปรียบเทียบ",
      };
    }),
  });
  if (mode !== "llm" || !process.env.OPENAI_API_KEY || !process.env.OPENAI_MODEL || !ranked.length) return rules();
  try {
    const top = ranked.slice(0, 4);
    const response = await new OpenAI({ timeout: 20000, maxRetries: 0 }).responses.parse({
      model: process.env.OPENAI_MODEL,
      instructions: "เขียน why และ tradeoff ภาษาไทยอย่างละหนึ่งประโยคสำหรับทุก productId ที่ให้มา อธิบายหลักฐานและข้อแลกเปลี่ยน ห้ามสร้างคะแนนหรือเปลี่ยนอันดับ",
      input: JSON.stringify({ ranked: top, requirements }),
      text: { format: zodTextFormat(explanations, "explanations") },
    });
    const picks = explanations.parse(response.output_parsed).picks;
    if (picks.length !== top.length || new Set(picks.map((p) => p.productId)).size !== top.length ||
      picks.some((p) => !top.some((row) => row.productId === p.productId))) throw new Error("Invalid explanation ids");
    return { mode: "llm" as const, ranked: ranked.map((row) => {
      const pick = picks.find((p) => p.productId === row.productId);
      return pick ? { ...row, why: pick.why, tradeoff: pick.tradeoff } : row;
    }) };
  } catch {
    return rules();
  }
}

export async function judgeResult(result: import("../types").ArenaResult): Promise<import("../types").ArenaResult> {
  const judged = await judge(result.ranked, result.requirements, result.mode);
  return { ...result, ...judged };
}
