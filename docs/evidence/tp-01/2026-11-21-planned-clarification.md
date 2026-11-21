# Upfront homepage questionnaire

2026-11-21 · TP-01

This supersedes [adaptive clarification](2026-11-21-clarification-budget.md). For an unclear request, the goal agent returns one ordered set of at most five independently answerable questions. Clear requests go straight to search. The homepage shows one question at a time with its position and the actual total (for example, **1 จาก 3**). Each question ends with **อื่น ๆ** for a typed answer. Back preserves answers, and the final button submits them together. If the answers still do not establish what to look for, the user can edit the original request instead of receiving another questionnaire.

Design reference: `origin/thanid-design` at `03ef6c0008f6197c2c0316aa4cab86a017b93f42`.

Verified locally: `npm test` (334 passed), `npm run build`, and Chromium at 390×844 with a local Responses API fixture. Observed the three question positions, preserved custom text when going back, one initial request plus one answer submission, and no questionnaire for a clear prompt. The fixture did not search the live web.
