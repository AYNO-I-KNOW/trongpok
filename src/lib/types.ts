import { z } from "zod";

const textSchema = z.string().min(1);
const ratioSchema = z.number().min(0).max(1);
const percentSchema = z.number().min(0).max(100);
const scalarSchema = z.union([z.string(), z.number(), z.boolean()]);
const specValueSchema = z.union([scalarSchema, z.array(scalarSchema)]);

export const RequirementSchema = z.object({
  id: textSchema,
  text: textSchema,
  kind: z.enum(["must", "nice", "budget"]),
  longUse: z.boolean().optional(),
  specOnly: z.boolean().optional(),
  value: z.number().nonnegative().optional(),
  spec: z.object({
    key: textSchema,
    op: z.enum([">=", "<=", "==", "includes"]),
    value: scalarSchema,
  }).optional(),
});
export type Requirement = z.infer<typeof RequirementSchema>;

export const QuestionSchema = z.object({
  id: textSchema,
  text: textSchema,
  multi: z.boolean(),
  options: z.array(z.object({
    label: textSchema,
    requirement: RequirementSchema.nullable(),
  })),
});
export type Question = z.infer<typeof QuestionSchema>;

export const CategoryPackSchema = z.object({
  id: textSchema,
  name: textSchema,
  keywords: z.array(textSchema),
  questions: z.array(QuestionSchema),
});
export type CategoryPack = z.infer<typeof CategoryPackSchema>;

export const ReviewSchema = z.object({
  id: textSchema,
  stars: z.number().int().min(1).max(5),
  text: textSchema,
  hasMedia: z.boolean(),
  daysAgo: z.number().int().nonnegative(),
  isTemplate: z.boolean(),
});
export type Review = z.infer<typeof ReviewSchema>;

export const ClaimSchema = z.object({
  id: textSchema,
  text: textSchema,
  source: textSchema,
  checkable: z.boolean(),
});
export type Claim = z.infer<typeof ClaimSchema>;

export const ShopSchema = z.object({
  id: textSchema,
  name: textSchema,
  years: z.number().nonnegative(),
  badRatePct: percentSchema,
  official: z.boolean(),
  preferredPlus: z.boolean(),
  verified: z.boolean(),
  chatResponsePct: percentSchema,
});
export type Shop = z.infer<typeof ShopSchema>;

export const ProductSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  category: textSchema,
  keywords: z.array(textSchema),
  title: textSchema,
  brand: textSchema,
  priceThb: z.number().nonnegative(),
  imageUrl: z.union([z.literal(""), z.url()]),
  shopeeUrl: z.union([z.literal(""), z.url()]),
  stars: z.number().min(0).max(5),
  ratingCount: z.number().int().nonnegative(),
  specs: z.record(z.string(), specValueSchema),
  features: z.array(textSchema),
  shop: ShopSchema,
  claims: z.array(ClaimSchema),
  reviews: z.array(ReviewSchema),
});
export type Product = z.infer<typeof ProductSchema>;

export const StanceSchema = z.enum(["confirm", "contradict", "none"]);
export type Stance = z.infer<typeof StanceSchema>;

export const TargetSchema = z.enum(["product", "logistics", "service", "price"]);
export type Target = z.infer<typeof TargetSchema>;

export const LabelSchema = z.object({
  reviewId: textSchema,
  subjectId: textSchema,
  stance: StanceSchema,
  target: TargetSchema,
  quote: z.string(),
  usage: z.enum(["unboxing", "short", "long"]),
  specific: z.boolean(),
});
export type Label = z.infer<typeof LabelSchema>;

export const RequirementStatusSchema = z.enum([
  "pass", "fail", "contradicted", "mixed", "spec-only", "unknown",
]);
export type RequirementStatus = z.infer<typeof RequirementStatusSchema>;

export const RequirementResultSchema = z.object({
  requirementId: textSchema,
  status: RequirementStatusSchema,
  score: ratioSchema,
  message: z.string().optional(),
  quotes: z.array(LabelSchema),
});
export type RequirementResult = z.infer<typeof RequirementResultSchema>;

export const TrustSchema = ratioSchema.nullable();
export type Trust = z.infer<typeof TrustSchema>;

export const RankedSchema = z.object({
  productId: textSchema,
  fitPct: percentSchema.int(),
  mustOk: z.boolean(),
  trust: TrustSchema,
  rankScore: ratioSchema,
  requirements: z.array(RequirementResultSchema),
  savings: z.number().nonnegative().nullable(),
  unusedFeatures: z.array(textSchema),
  objections: z.array(LabelSchema),
  why: z.string(),
  reviewQualityWarning: z.object({ message: z.string(), percent: percentSchema }).nullable().optional(),
  tradeoff: z.string().optional(),
});
export type Ranked = z.infer<typeof RankedSchema>;

export const AgentEventSchema = z.object({
  agent: z.enum(["verifier", "fit", "value", "skeptic", "judge"]),
  type: z.enum(["start", "step", "candidate", "objection", "done", "error"]),
  text: textSchema,
  productId: textSchema.optional(),
  quote: z.string().optional(),
  objections: z.array(LabelSchema).min(1).optional(),
}).refine((event) => event.type !== "objection" || (
  event.agent === "skeptic" && Boolean(event.productId && event.objections?.length && event.quote === event.objections[0].quote)
), "Objection events must include their product and exact review evidence");
export type AgentEvent = z.infer<typeof AgentEventSchema>;

export const ArenaResultSchema = z.object({
  requirements: z.array(RequirementSchema),
  ranked: z.array(RankedSchema),
  events: z.array(AgentEventSchema),
  mode: z.enum(["llm", "rules", "cache"]),
  cachedMode: z.enum(["llm", "rules"]).optional(),
  modelContributed: z.boolean().optional(),
});
export type ArenaResult = z.infer<typeof ArenaResultSchema>;
