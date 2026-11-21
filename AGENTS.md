# trongpok (ตรงปก): เหมาะกับเราไหม

Regional Codex Hackathon Thailand (Sea × OpenAI), 2026-11-21. Official hacking starts at **10:25 ICT**; code freeze and submission are at **17:00 ICT**. See [hackathon rules, judging, and submission](docs/hackathon.md).

## Hackathon

- Work on-site; only work built during the event is judged. Use a new public GitHub repo. If extending an existing project, make substantial additions and disclose the source repos and what was built during the event in the README and submission form.
- Submit once per team via Google Form by **17:00 ICT**: public repo, write-up (problem, solution, build direction, and how Codex was used), live demo or prototype link, and declarations. Late submissions are disqualified.
- Judges assess problem–solution fit, build quality, originality, real-world value, build direction, and depth of Codex use. Lead with **AI-Native Products & Operations** for trongpok and show a working purchase decision backed by review evidence. Keep concrete examples of how Codex helped build the product.
- Demo/pitch: **6 minutes** in both rounds; Q&A: **2 minutes** in round one, **4 minutes** in the top-five final. Cover the problem, solution, and use of Codex.

## Product

The homepage accepts free-text shopping requests in any category. It shows up to three verified models with source links and confirmed Thai prices. The demo Arena follows the category-pack flow below.

In the Arena, a buyer pastes a product link or types a need ("เครื่องปั่นไว้ปั่นน้ำแข็งเปิดร้าน", "smartwatch"). The app asks a few tap-to-answer questions from the category pack and turns the answers into requirements (must / nice / budget). Four agents then race in a visible arena:

| Agent | Goal |
|---|---|
| Verifier | Check the linked product against every requirement. Exact instructions only. |
| Fit | Find the products that satisfy the most requirements with the strongest review evidence. |
| Value | Find the cheapest products that pass every must requirement. |
| Skeptic | After the others propose, attack the current top 3 with contradicting review quotes. |

Code merges their labels, scores and ranks the products (`docs/scoring.md`), and a judge LLM writes one line per pick explaining why it ranked there and what the buyer gives up. The result is one large card (rank 1) and three small cards in one row. Each card shows "เหมาะ X%", per-requirement status with quotes, Skeptic objections, trust (ตรงปก) or "ข้อมูลไม่พอ", and "ประหยัด ฿X" versus the highest-starred product. The user decides.

Pitch line: a 4.8★ means other people were happy using it their way. It doesn't say the product fits you. People who returned it can't rate it at all.

## Hard rules

- Never fetch, scrape, or automate shopee.co.th. Live product search uses the manufacturer and retailer allowlist in `src/lib/product-search/domain.ts`. The Arena and rule-based fallback use `data/products/*.json` (files starting with `_` are skipped). Linking to Shopee is allowed.
- LLMs never produce scores or rankings. They return stance labels, candidate ids, quotes, extracted requirements, and explanation text. Prices come from same-model offers. The code in `src/lib/scoring` computes scores and ranking.
- Every quote shown must be an exact substring of a review. Drop any label whose quote is not.
- Below 10 evidence reviews, trust shows "ข้อมูลไม่พอ", never a percent.
- Arena agents may only call the tools in `src/lib/agents/tools.ts`; use `verify_spec_web` for a spec. The homepage uses `POST /api/product-search` with a required Responses API `web_search` restricted to approved domains. Verify the model and offer on a direct product page returned by the search tool. Treat unsourced facts as unknown.
- The app must work with no `OPENAI_API_KEY`. Rule-based agents produce the same output shape, and the UI says "โหมดกฎ". When either the key or `OPENAI_MODEL` is missing, or a search fails, show a labeled catalog demo for supported queries and a retry for other queries.
- Read the OpenAI docs (Agents SDK or Responses API, tool calling, structured outputs, web search) before writing LLM code. Do not guess model ids or APIs from memory. The model comes from `OPENAI_MODEL`.
- No checkout or payment. UI text is Thai. Mobile first.

## Stack

Next.js App Router, TypeScript strict, Vitest, zod, `openai` SDK. Server-Sent Events for the arena stream. Deploy on Vercel.

## Layout

```
data/categories/*.json   question packs → requirements
data/products/*.json     demo products
data/personas.csv        human top-3 per persona
data/cache/              cached arena runs and eval report, committed
src/lib/types.ts
src/lib/catalog/         load, validate, search, link parsing
src/lib/needs/           answers → requirements, free text → requirements
src/lib/labeling/        rules.ts, llm.ts, index.ts (cache → llm → rules)
src/lib/scoring/         pure functions from docs/scoring.md
src/lib/agents/          tools.ts, verifier.ts, fit.ts, value.ts, skeptic.ts, judge.ts, arena.ts
src/lib/eval/            persona eval and baselines
src/app/                 pages and route handlers
```

## Working

- One slice from `docs/codex-prompts.md` per task. Finish with `npm test` and `npm run build` passing, then commit with the slice id in the subject, e.g. `feat(s02): fit scoring`.
- No code comments. Small pure functions. Tests for scoring, fallbacks, and the quote check.
