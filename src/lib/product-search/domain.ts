import { z } from "zod";

export const allowedDomains = [
  "homepro.co.th",
  "powerbuy.co.th",
  "naiin.com",
  "watsons.co.th",
  "thaiwatsadu.com",
  "petclub.co.th",
  "officemate.co.th",
  "tops.co.th",
  "central.co.th",
  "jib.co.th",
  "advice.co.th",
  "bnn.in.th",
  "ikea.com",
  "decathlon.co.th",
  "supersports.co.th",
  "logitech.com",
  "samsung.com",
  "apple.com",
  "philips.co.th",
  "sony.co.th",
  "lg.com",
  "lenovo.com",
  "asus.com",
  "acer.com",
  "hp.com",
  "xiaomi.com",
  "mi.com",
  "th.canon",
  "electrolux.co.th",
  "tefal.co.th",
  "makita.co.th",
  "bosch-professional.com",
];
export const goalSchema = z.object({
  category: z.string(),
  budget: z.number().nullable(),
  must: z.array(z.string()),
  nice: z.array(z.string()),
  clarification: z.string().nullable(),
});
export type SearchGoal = z.infer<typeof goalSchema>;
const evidenceSchema = z.object({
  requirement: z.string(),
  stance: z.enum(["yes", "no", "unknown"]),
  excerpt: z.string(),
  text: z.string(),
  url: z.string(),
  pageModel: z.string(),
});
export const candidateSchema = z.object({
  model: z.string(),
  modelFamily: z.string().nullable(),
  category: z.string(),
  url: z.string(),
  pageModel: z.string(),
  pageKind: z.enum(["product", "manual", "other"]),
  price: z
    .object({
      baht: z.number(),
      url: z.string(),
      pageModel: z.string(),
      currency: z.string(),
    })
    .nullable(),
  stock: z.object({
    status: z.enum(["in_stock", "out_of_stock", "unknown"]),
    url: z.string(),
    pageModel: z.string(),
  }),
  evidence: z.array(evidenceSchema),
});
export type SearchCandidate = z.infer<typeof candidateSchema>;
export function sourceUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      !allowedDomains.some(
        (domain) =>
          url.hostname === domain || url.hostname.endsWith(`.${domain}`),
      )
    )
      return null;
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_|^(?:gclid|fbclid)$/i.test(key)) url.searchParams.delete(key);
    }
    url.hash = "";
    return url.href.replace(/\/$/, "");
  } catch {
    return null;
  }
}
