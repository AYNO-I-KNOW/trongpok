# Codex prompts

Paste one slice at a time into Codex. Each slice starts by reading `AGENTS.md`. A slice is done when `npm test` and `npm run build` pass. Then commit.

| Slice | Owner | Depends on | Target time |
|---|---|---|---|
| S00 scaffold + types | Dev 1 | - | 10:00–10:20 |
| S01 catalog + packs | Dev 1 | S00 | 10:20–10:50 |
| S02 scoring | Dev 1 | S00 | 10:50–11:40 |
| S03 labeling | Dev 1 | S02 | 11:40–12:20 |
| S04 agents + arena | Dev 1 | S03 | 12:20–13:40 |
| S05 judge + cache | Dev 1 | S04 | 13:40–14:20 |
| S06 persona eval | Dev 1 | S05 | 14:20–15:10 |
| S07 need flow UI | Dev 2 | S00 | 10:20–11:40 |
| S08 arena stream UI | Dev 2 | S07 (mock events until S04) | 11:40–13:10 |
| S09 result board + detail | Dev 2 | S08, S02 | 13:10–14:40 |
| S11 fit API | Dev 2 | S05 | 14:40–15:10 |
| S10 web spec check | Dev 1 | S04 | 15:10–15:50, cut first |
| Stretch: basket, LINE OA | Dev 2 | S09 | only if everything above is done by 15:30 |

16:15–17:00 is freeze: run S06 one last time, run `npm run arena:all`, check the deploy, and rehearse.

---

## S00 scaffold + types

```
Read AGENTS.md and docs/scoring.md. Scaffold a Next.js App Router app with TypeScript strict, Vitest, zod and the openai SDK, using the layout in AGENTS.md.
Create src/lib/types.ts with zod schemas and inferred types for: CategoryPack, Question, Requirement, Product (match data/products/_example.json and data/README.md), Review, Claim, Shop, Stance, Target, Label {reviewId, subjectId (claim or requirement id), stance, target, quote}, RequirementStatus, RequirementResult, Trust, Ranked {productId, fitPct, mustOk, trust, rankScore, requirements, savings, unusedFeatures, objections, why}, AgentEvent {agent: 'verifier'|'fit'|'value'|'skeptic'|'judge', type: 'start'|'step'|'candidate'|'objection'|'done'|'error', text, productId?, quote?}, ArenaResult {requirements, ranked, events, mode: 'llm'|'rules'|'cache'}.
Add .env.example with OPENAI_API_KEY, OPENAI_MODEL, APP_BASE_URL.
Done: schemas parse data/products/_example.json and both data/categories files in a test.
```

## S01 catalog + packs

```
Read AGENTS.md and data/README.md. Implement src/lib/catalog:
- loadProducts() and loadPacks(): read and validate data files, skip "_" files, throw with the file name on invalid data, and check that every product.category has a pack.
- detectCategory(text): pick the pack whose keywords match the text. Return null when nothing matches.
- findByLink(url): parse shopid/itemid from full shopee.co.th URLs (/<slug>-i.<shopid>.<itemid> and /product/<shopid>/<itemid>) with no network call, and match against product.shopeeUrl. A short link or no match → {status:'not-in-demo'}. Never fetch.
- byCategory(id), shopeeLink(product): shopeeUrl, or https://shopee.co.th/search?keyword=<encoded title>.
Tests: invalid file throws, category detection, both URL shapes, short link → not-in-demo.
```

## S02 scoring

```
Read AGENTS.md and docs/scoring.md. Implement src/lib/scoring as pure functions: reviewWeight, specCheck, requirementResult, fit, trust, shopScore, evidenceCount, rank, savings, unusedFeatures. Follow every table in docs/scoring.md exactly.
Tests: one per row of the requirement status table; budget pass/fail; mustOk ordering beats a higher rankScore; evidence < 10 → trust null; a fabricated quote is dropped; a logistics complaint is ignored; savings only when rank 1 is mustOk; unusedFeatures from the highest-stars product.
```

## S03 labeling

```
Read AGENTS.md. Implement src/lib/needs and src/lib/labeling.
needs: requirementsFromAnswers(pack, answers) maps chosen options to requirements and drops null ones. requirementsFromText(pack, text) uses the LLM with structured output to pick the matching options and add at most 2 free-text requirements (kind nice, no spec). With no LLM, use keyword matching on option labels.
labeling/rules.ts: labelWithRules(product, subjects) where subjects are requirements and claims. Match keywords from the subject text plus Thai negation and complaint lexicons (ไม่, ไม่ได้, ไหม้, ดับ, พัง, ไม่ละเอียด, เสียงดัง, ละลาย, เยิ้ม, เหม็น, กลับมา, จกตา, ปกเทพ as sarcasm). Logistics words (ส่ง, ขนส่ง, กล่อง, ไรเดอร์) → target logistics. quote = the matched sentence.
Also set usage and specific per docs/scoring.md. Rules: unboxing when the text has เพิ่งได้รับ / ยังไม่ได้ลอง / แกะกล่อง; long when it has a duration of 2+ weeks (e.g. "ใช้มา 3 เดือน", "ติดไป 2 เดือน"); else short. specific is false when the review has fewer than 25 characters after removing praise words (ดี, มาก, ค่ะ, ครับ, แนะนำ, ใช้ได้ผล, ส่งไว), else true.
labeling/llm.ts: one structured-output call per product → labels {stance, target, quote, usage, specific} for every non-template review × subject. Look up the current OpenAI structured outputs docs first.
labeling/index.ts: cache → llm → rules. Return {labels, mode}.
Tests: on _example.json the rules label r2 and r3 as contradict for the "ice" requirement and r4 as logistics; LLM error → rules; cache hit skips the LLM (mock).
```

## S04 agents + arena

```
Read AGENTS.md and docs/scoring.md. First read the current OpenAI docs for the Agents SDK (or Responses API tool calling). Do not rely on memory.
src/lib/agents/tools.ts exposes: search_catalog(category, filters {maxPrice?, specKey?, specOp?, specValue?}), get_product(id), get_reviews(id, query) (returns reviews containing the query words), and propose(productId, labels[]). propose runs the quote-substring check and rejects bad labels with a reason the agent can read.
Four agents, each with its own system prompt and goal from the table in AGENTS.md. Verifier only runs when there is a linked product. Fit and Value each propose up to 3 products. After that, Skeptic receives the current top 3 (computed by scoring.rank) and may only add contradict labels with quotes.
arena.ts: runArena({pack, requirements, linkedProductId?}, emit) runs Verifier, Fit and Value in parallel, then ranks, then runs Skeptic, then ranks again. It emits AgentEvent for every tool call and proposal, with a short Thai text per event (e.g. "Value: เจอ 3 รุ่นที่ไม่เกิน 3,000 และสเปกถึง 1000W").
Rules mode: the same four roles as plain functions (filter by spec and budget, sort by price for Value, sort by confirm count for Fit, Skeptic picks the strongest contradict quote), emitting the same events with mode 'rules'.
Tests: rules arena on fixture data emits events from all four agents and returns ranked results; a proposal with a fake quote is rejected.
```

## S05 judge + cache

```
Read AGENTS.md. judge.ts: given ranked results, requirements and objections, make one structured-output LLM call that returns {productId, why, tradeoff} for the top 4. Thai, one short sentence each. It must not reorder anything. Rules mode builds the sentence from a template (the strongest passing requirement plus the weakest one).
Add POST /api/arena (SSE): body {category?, needText?, answers?, link?} → streams AgentEvents and then the ArenaResult.
Cache by hash(requirements + linked product + data version) in data/cache/arena/*.json. Add `npm run arena:all`, which runs every persona in data/personas.csv and writes the cache. When the cache hits, replay the stored events with a short delay so the arena still animates, and set mode 'cache'.
Test: a second identical request is served from cache without calling the LLM (mock).
```

## S06 persona eval

```
Read AGENTS.md and the Evaluation section of docs/scoring.md. Implement src/lib/eval and `npm run eval`:
- For each persona, compute the top 3 for: ours (cache), ours-rules, stars, popular, and plain LLM.
- Report the top-1 hit rate, mean top-3 overlap, how often rank 1 is listed in must_notes, mean savings of ours vs stars, the inter-labeler top-1 agreement, and n.
- Write data/cache/eval-report.json and render /eval as a Thai table. Show the numbers as measured, even when a baseline wins.
Tests: hit and overlap math on a two-persona fixture.
```

## S07 need flow UI

```
Read AGENTS.md. Build the home page from the designer's frames: one input for a link or a need, plus category chips for the demo categories.
- Link → catalog.findByLink. Found → show that product's mini card and continue with its category. not-in-demo → "ลิงก์นี้ไม่อยู่ในชุดเดโม ลองพิมพ์สิ่งที่ต้องการแทน".
- Text → detectCategory, then prefill answers via requirementsFromText.
- Then show the pack's questions as tap chips (multi or single), prefilled when possible, with a "เริ่มหา" button.
- Show the requirement list the system understood, as editable chips, before starting. This is where the user sees "must / nice / budget".
```

## S08 arena stream UI

```
Read AGENTS.md. Build /arena: four lanes (Verifier, Fit, Value, Skeptic) that fill live from the /api/arena SSE stream. Each lane shows its goal in one line, its steps, and candidate products as small chips. Skeptic objections appear as red quote bubbles attached to the product they attack. When the judge finishes, animate the transition to the result board.
Until S04 lands, drive the lanes from a local fixture of AgentEvents with the same shape.
Show "โหมดกฎ" or "เล่นซ้ำจาก cache" when mode is not llm.
```

## S09 result board + detail

```
Read AGENTS.md. Result board: one large card for rank 1 and three small cards in one row.
Large card: image, title, price, Shopee stars next to "เหมาะ X%", a must pass/fail summary, trust or "ข้อมูลไม่พอ", the judge's why and tradeoff, the strongest Skeptic objection with its quote, "ประหยัด ฿X เทียบกับ <highest-stars title>" and the unused features list, and an "เปิดใน Shopee" link.
If the user came with a link and Verifier's product is not rank 1, show a banner on top: "ตัวที่คุณส่งมาไม่ผ่าน: <failed musts>" with quotes.
Small cards: title, price, เหมาะ X%, a must ok badge, and the one-line why.
/p/[id]?run=<hash>: per-requirement rows with status chip, spec value, confirm/contradict counts, and up to 3 quotes with the stars next to each quote. Below that, the claims (ตรงปก) and the shop breakdown.
Footer on every card: "วัดจากสิ่งที่ผู้ซื้อก่อนหน้าเจอ".
```

## S10 web spec check (cut first)

```
Read AGENTS.md. Read the current OpenAI web search tool docs. Add the verify_spec_web(productTitle, brand, specKey) tool, available to Verifier and Fit only, for requirements whose spec is unknown. It returns {value, sourceUrl} or unknown. With no sourceUrl, the result is unknown. Values found this way show as "ตามสเปกจากเว็บ" with a link, and still count as spec-only, never as review evidence. Cap it at 2 calls per run.
```

## S11 fit API

```
Read AGENTS.md. Add POST /api/fit with JSON body {category, answers | needText, link?}. It returns the ArenaResult without events, plus {measuredFrom: "earlier buyers' reviews", scoringDoc: "docs/scoring.md"}. This is the machine-readable answer an AI shopping agent would call. not-in-demo → 404.
Test: a persona from the cache returns ranked results.
```
