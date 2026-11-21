import { z } from "zod";
import { ArenaResultSchema, CategoryPackSchema, ProductSchema, RequirementSchema } from "../types";

export const AnswersSchema = z.record(z.string().max(100), z.array(z.string().max(300)).max(20));
export const RunInputSchema = z.object({
  category: z.string().min(1).max(80),
  answers: AnswersSchema.optional(),
  needText: z.string().max(2000).optional(),
  link: z.string().max(2000).optional(),
  requirements: z.array(RequirementSchema).max(30).optional(),
}).refine((input) => Object.values(input.answers ?? {}).some((answers) => answers.length > 0) || Boolean(input.needText?.trim()) || Boolean(input.requirements?.length), {
  message: "กรุณาระบุคำตอบหรือความต้องการ",
}).refine((input) => !input.requirements || (
  input.requirements.length > 0 && new Set(input.requirements.map((item) => item.id)).size === input.requirements.length &&
  input.requirements.every((item) => item.kind !== "budget" || item.value !== undefined)
), {
  message: "เงื่อนไขต้องไม่ซ้ำและงบประมาณต้องระบุวงเงิน",
});
export const RunRecordSchema = z.object({
  id: z.string().min(1).max(128),
  createdAt: z.number(),
  preview: z.boolean(),
  result: ArenaResultSchema,
  products: z.array(ProductSchema),
  linkedProductId: z.string().optional(),
});
export const PendingRunSchema = z.object({
  input: RunInputSchema,
  preview: z.boolean(),
  pack: CategoryPackSchema,
  products: z.array(ProductSchema),
  linkedProductId: z.string().optional(),
});
export type RunInput = z.infer<typeof RunInputSchema>;
export type RunRecord = z.infer<typeof RunRecordSchema>;
export type PendingRun = z.infer<typeof PendingRunSchema>;
