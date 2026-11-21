# Homepage clarification choices

2026-11-21 · TP-01

This extends [homepage clarification before discovery](2026-11-21-homepage-clarification.md). When the buyer's intent is unclear, the goal agent returns a question with two or three relevant Thai answers. Discovery waits for the buyer's reply. The homepage adds **อื่น ๆ** last and opens a text box only when it is selected. Only the selected answer or typed text is sent back with the original request and question. In rule mode, supported catalog categories use their question pack.

The choice rows and custom text interaction follow `origin/thanid-design` at `03ef6c0008f6197c2c0316aa4cab86a017b93f42`. No preview product data is used.

Verified with `npm test` (327 passed), `npm run build`, and Chromium at 390×844. A local Responses API fixture supplied the choices and recorded both the selected answer and a typed answer; discovery received no calls until submission. A clear request skipped the question. The browser smoke did not call the live provider or search the web.
