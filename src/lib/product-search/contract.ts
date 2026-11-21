import { z } from "zod";
import { clarificationSchema, isDetailUrl, sourceUrl } from "./domain";

const text = z.string().trim().min(1);
export const MAX_CLARIFICATION_QUESTIONS = 5;
export const MAX_SEARCH_TEXT_LENGTH = 1200;
const buyerText = text.max(MAX_SEARCH_TEXT_LENGTH);
const clarificationTurnSchema = z.object({
  question: clarificationSchema.shape.question,
  answer: buyerText,
});
export const productSearchRequestSchema = z.object({
  query: buyerText,
  clarifications: z.array(clarificationTurnSchema).max(MAX_CLARIFICATION_QUESTIONS).default([]),
});
export type ClarificationTurn = z.infer<typeof clarificationTurnSchema>;

const source = z.union([
  z.url({ protocol: /^https$/ }),
  z.string().regex(/^\/api\/demo-products\/[a-z0-9-]+$/),
]);
const liveSource = z.string().refine((value) => sourceUrl(value) !== null);
const liveProduct = z.string().refine((value) => {
  const url = sourceUrl(value);
  return url !== null && isDetailUrl(url);
});
const priceSchema = z.object({
  baht: z.number().positive(),
  url: source,
  observedAt: z.iso.datetime(),
});
const productPickSchema = z.object({
  model: text,
  image: liveSource.optional(),
  url: source,
  price: priceSchema.nullable(),
  reasons: z.array(z.object({ text, url: source })),
  unknowns: z.array(text),
});
const webProductPickSchema = productPickSchema.extend({
  url: liveProduct,
  price: priceSchema.extend({ url: liveProduct }),
  reasons: z.array(z.object({ text, url: liveSource })),
  fit: z.object({
    percent: z.number().int().min(0).max(100),
    meetsRequired: z.boolean(),
  }).optional(),
});

export const productSearchResultSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("web"),
    picks: z.array(webProductPickSchema).max(3),
    note: z.string(),
    searchCalls: z.number().int().positive(),
    discovery: z
      .object({
        agents: z.literal(3),
        completed: z.number().int().min(1).max(3),
        candidates: z.number().int().nonnegative(),
        sources: z.number().int().nonnegative(),
        followUp: z.boolean(),
      })
      .optional(),
    searchRounds: z.number().int().min(1).max(2),
  }),
  z.object({
    kind: z.literal("demo"),
    picks: z.array(productPickSchema).max(3),
    note: text,
  }),
  clarificationSchema.extend({ kind: z.literal("clarify") }),
  z.object({ kind: z.literal("needs-specifics"), message: text }),
  z.object({ kind: z.literal("unavailable"), message: text }),
]);

export type ProductPick = z.infer<typeof productPickSchema>;
export type WebProductPick = z.infer<typeof webProductPickSchema>;
export type ProductSearchResult = z.infer<typeof productSearchResultSchema>;
