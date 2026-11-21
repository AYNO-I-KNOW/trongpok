import { z } from "zod";
import { sourceUrl } from "./domain";

const text = z.string().trim().min(1);
const source = z.union([
  z.url({ protocol: /^https$/ }),
  z.string().regex(/^\/api\/demo-products\/[a-z0-9-]+$/),
]);
const productPickSchema = z.object({
  model: text,
  image: z.string().refine((value) => sourceUrl(value) !== null).optional(),
  url: source,
  price: z
    .object({
      baht: z.number().positive(),
      url: source,
      observedAt: z.iso.datetime(),
    })
    .nullable(),
  reasons: z.array(z.object({ text, url: source })),
  unknowns: z.array(text),
});

export const productSearchResultSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("web"),
    picks: z.array(productPickSchema).max(3),
    note: z.string(),
    searchCalls: z.number().int().positive(),
    searchRounds: z.number().int().min(1).max(2),
  }),
  z.object({
    kind: z.literal("demo"),
    picks: z.array(productPickSchema).max(3),
    note: text,
  }),
  z.object({ kind: z.literal("clarify"), question: text }),
  z.object({ kind: z.literal("unavailable"), message: text }),
]);

export type ProductPick = z.infer<typeof productPickSchema>;
export type ProductSearchResult = z.infer<typeof productSearchResultSchema>;
