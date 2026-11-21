import { z } from 'zod';
import { productSearchResultSchema, type ProductSearchResult } from '../../../lib/product-search/contract';
import type { Plan, ResearchResult } from './types';
import { researchDesignPreview } from './research';
import { liveResult } from './live-result';

export const HISTORY_KEY = 'trong-pok-history-v1';
const amount = z.number().finite().nonnegative().nullable();
const legacyEntrySchema = z.object({
 version: z.literal(1), key: z.string(),
 target: z.enum(['electrolux', 'electrolux-large', 'hoffen', 'simplus']).nullable(),
 ice: z.boolean(),
 conditions: z.object({ cubes: amount, container: z.enum(['bottle600', 'mainJar', 'grinder', 'unknown']), pulse: amount, budget: amount }),
});
const webEntrySchema = z.object({
 version: z.literal(2), key: z.string(), query: z.string().trim().min(1),
 response: productSearchResultSchema.transform((response, context) => {
  if (response.kind === 'web' && response.picks.length) return response;
  context.addIssue({ code: 'custom', message: 'Expected a nonempty web result' });
  return z.NEVER;
 }),
});
const entrySchema = z.discriminatedUnion('version', [legacyEntrySchema, webEntrySchema]);
export type HistoryEntry = z.infer<typeof entrySchema>;

export function historyResult(entry: HistoryEntry): ResearchResult {
 return entry.version === 2 ? liveResult(entry.query, entry.response) : researchDesignPreview({ raw: '', target: entry.target, supported: true, ice: entry.ice, conditions: entry.conditions, needsContext: false, designPreview: true });
}

export function readHistory(): HistoryEntry[] {
 try {
  const parsed: unknown = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap(value => { const entry = entrySchema.safeParse(value); return entry.success ? [entry.data] : []; }).slice(0, 3);
 } catch { return []; }
}

function rememberEntry(entry: HistoryEntry): HistoryEntry[] {
 const list = [entry, ...readHistory().filter(previous => previous.key !== entry.key)].slice(0, 3);
 try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch {}
 return list;
}

export function rememberSearch(query: string, response: Extract<ProductSearchResult, { kind: 'web' }>): HistoryEntry[] {
 if (!query.trim() || !response.picks.length) return readHistory();
 return rememberEntry({ version: 2, key: JSON.stringify([query, response]), query, response });
}

export function rememberHistory(result: ResearchResult): HistoryEntry[] {
 const key = JSON.stringify(result.items.map(item => [item.product.id, item.verdict, item.rank || null, item.reason, item.limitation]));
 const { target, ice, conditions } = result.plan;
 return rememberEntry({ version: 1, key, target, ice, conditions: { ...conditions } });
}

export function historyPlan(entry: HistoryEntry): Plan { return historyResult(entry).plan; }
