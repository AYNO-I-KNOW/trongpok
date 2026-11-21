# Homepage clarification budget

2026-11-21 · TP-01

This extends [homepage clarification choices](2026-11-21-clarification-choices.md). Homepage search asks zero to five questions, one at a time, and stops as soon as the buyer's intent is specific enough to find products. A question must resolve something that would change what to search for, not gather optional details or add preferences. The original query and answers define the search; question wording only provides context to the goal agent.

The API accepts at most five answered turns. After the fifth answer it searches if the intent is clear enough, or asks the buyer to edit the original prompt without proposing a sixth question or searching an unresolved prompt. The question card shows the current question number without promising a fixed total. Design reference: `origin/thanid-design` at `03ef6c0008f6197c2c0316aa4cab86a017b93f42`.

Verified locally: `npm test` (329 passed), `npm run build`, and Chromium at 390×844 against a local Responses API fixture. Observed direct search, search after one free-text answer, and the no-search edit screen after five unresolved answers. The local API rejected six submitted turns with HTTP 400. The smoke did not call a live provider.
