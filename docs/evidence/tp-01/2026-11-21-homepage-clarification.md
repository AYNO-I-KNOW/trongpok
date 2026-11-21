# Homepage clarification before discovery

2026-11-21 · TP-01

Homepage search asks one follow-up when it cannot identify the product type, or when the buyer states only a broad type without a use case, model, or concrete selection constraint. This supersedes the rule that knowing the type was enough to start discovery. A clear request goes straight to search. The follow-up answer continues the homepage search, not the Arena demo.

If live search is unavailable, the catalog fallback asks about intended use for a bare catalog name or ID. Requests outside the demo catalog still get the retry screen. Demo recommendations remain labeled as synthetic.

Question layout reference: `origin/thanid-design` at `03ef6c0008f6197c2c0316aa4cab86a017b93f42`.

Verified locally: `npm test` (316 passed), `npm run build`, and browser smoke in rules mode. `เครื่องปั่น` opened the question screen; answering `ใช้ทั่วไป งบ 999 บาท` produced a demo recommendation. Submitting `เครื่องปั่น งบ 999 บาท` went straight to a demo recommendation. No live provider was used for the browser smoke.
