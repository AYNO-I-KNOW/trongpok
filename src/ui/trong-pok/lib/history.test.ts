import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HISTORY_KEY, historyResult, readHistory, readSearchHistory, rememberSearch } from './history';
import type { ProductSearchResult } from '../../../lib/product-search/contract';

const response: Extract<ProductSearchResult, { kind: 'web' }> = {
 kind: 'web', note: 'ตรวจสอบแล้ว', searchCalls: 1, searchRounds: 1,
 picks: [{ model: 'Verified watch', url: 'https://www.apple.com/th/watch/', price: { baht: 8900, url: 'https://www.apple.com/th/watch/', observedAt: '2026-11-21T04:00:00Z' }, reasons: [{ text: 'ข้อมูลตรงรุ่น', url: 'https://www.apple.com/th/watch/' }], unknowns: ['ยังไม่ยืนยันแบตเตอรี่'] }],
};
const legacy = { version: 1, key: 'legacy', target: 'electrolux', ice: true, conditions: { cubes: 5, container: 'bottle600', pulse: 10, budget: null } };

beforeEach(() => {
 const values = new Map<string, string>();
 vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
});
afterEach(() => vi.unstubAllGlobals());

describe('recent searches', () => {
 it('restores the exact models, sources, price and query alongside v1 history', () => {
  localStorage.setItem(HISTORY_KEY, JSON.stringify([legacy]));
  rememberSearch('นาฬิกาไว้เดินป่า', response);
  const entries = readHistory();
  expect(entries[0]?.version).toBe(3);
  if (entries[0]?.version !== 3) throw new Error('Missing web entry');
  const result = historyResult(entries[0]);
  expect(result.plan.raw).toBe('นาฬิกาไว้เดินป่า');
  expect(result.searchKind).toBe('web');
  expect(result.items[0].product).toMatchObject({ name: 'Verified watch', price: 8900, storeUrl: response.picks[0].url });
  expect(result.items[0].evidence[0]).toMatchObject({ summary: 'ข้อมูลตรงรุ่น', url: response.picks[0].url });
  expect(entries[1]).toEqual(legacy);
 });
 it('excludes synthetic entries from the homepage without removing them from shared storage', () => {
  const saved = { version: 3, key: 'saved', query: 'นาฬิกาไว้เดินป่า', response };
  localStorage.setItem(HISTORY_KEY, JSON.stringify([legacy, saved]));
  expect(readSearchHistory()).toEqual([saved]);
  expect(rememberSearch('นาฬิกากันน้ำ', response).map(entry => entry.query)).toEqual(['นาฬิกากันน้ำ', saved.query]);
  expect(readHistory()).toContainEqual(legacy);
 });
 it('does not display prices saved by the previous verifier', () => {
  localStorage.setItem(HISTORY_KEY, JSON.stringify([
   { version: 2, key: 'old-verifier', query: 'นาฬิกาไว้เดินป่า', response },
  ]));
  expect(readSearchHistory()).toEqual([]);
 });
 it('deduplicates and bounds results to three entries', () => {
  for (const query of ['one', 'two', 'three', 'four', 'four']) rememberSearch(query, response);
  expect(readHistory().map(entry => entry.version === 3 && entry.query)).toEqual(['four', 'three', 'two']);
 });
 it('skips empty results and invalid entries while retaining valid history', () => {
  const saved = { version: 3, key: 'saved', query: 'นาฬิกาไว้เดินป่า', response };
  localStorage.setItem(HISTORY_KEY, JSON.stringify([null, {}, { version: 3, key: 'bad', query: 'watch', response: { ...response, picks: [] } }, legacy, saved]));
  expect(rememberSearch('watch', { ...response, picks: [] })).toEqual([saved]);
  expect(rememberSearch(' ', response)).toEqual([saved]);
 });
 it('handles malformed and disabled storage', () => {
  for (const value of ['broken', '{}', 'null']) {
   localStorage.setItem(HISTORY_KEY, value);
   expect(readHistory()).toEqual([]);
  }
  vi.stubGlobal('localStorage', { getItem() { throw new Error('disabled'); }, setItem() { throw new Error('disabled'); } });
  expect(readHistory()).toEqual([]);
  expect(rememberSearch('watch', response)).toHaveLength(1);
 });
});
