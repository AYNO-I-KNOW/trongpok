# Dev 2 integration

The working branch is codex/dev2-integration, based on upstream main commit c288e11a8792df20453edfa42cd3e600126d051e. All 25 upstream image and font files have been checked against their Git blob hashes. Commit and push feature changes only after the required test and build checks pass.

## User flow

The designer's homepage is preserved. Normal searches go to /compare?q=..., then category questions, editable requirements, /arena, /results?run=..., and /p/<id>?run=.... The input can contain one product link together with a need. Unknown links show a recovery message and are never fetched.

The catalog contains 20 team-created products in four categories. Products and reviews are synthetic demonstration data, as described in data/README.md. The comparison pages disclose this. /?demo=ranking remains a labeled design example. The separate /api/ui/preview endpoint is an explicit synthetic preview; the production Fit endpoint never falls back to it.

Results use versioned sessionStorage for 24 hours in the same browser tab. Result URLs are not public share links. Missing, expired, or denied storage shows a recovery action.

## Backend contract

/api/arena accepts validated reviewed requirements in addition to category, answers, needText, and link. Reviewed priorities and deletions take precedence over answer extraction. Duplicate requirement ids, empty reviewed selections, and budgets without values are rejected. Reviewed requirements are included in the existing request and result cache keys.

The SSE stream emits mode events for rules, llm, and cache, followed by agent events and the final result. Cancellation prevents further writes to a disconnected stream. The client checks that final requirements match the reviewed selection, verifies displayed review quotes, and uses the backend ranking.

POST /api/fit calls the shared runArenaRequest service directly. It does not require APP_BASE_URL or make a loopback HTTP request. It removes events and adds measuredFrom and scoringDoc. Unknown links return 404, invalid selections return 422, and unavailable upstream processing returns 503.

The result board displays the backend's tradeoff and reviewQualityWarning. Claims without returned claim-level verification remain labeled as unknown. Scoring formulas and agent tools are unchanged.

## Verification

The Windows verification passed all 138 Vitest tests, all 20 UI and rules checks, and all four publisher checks. Both Fit response formats (JSON and SSE) and persistent cache replay passed. Lint reported four image optimization warnings in the design components. The production build completed with strict TypeScript checking.

The UI and rules suite exercises all four categories, exact review evidence, linked-product SSE, the Fit service, invalid selections, request cancellation, and stream parsing. Cache replay requires a temporary directory that supports atomic rename. These tests run without live model calls.

## Full verification

The local execution environment cannot resolve registry.npmjs.org. Full verification runs through GitHub Actions: npm ci, npm test, npm run test:ui, npm run lint, npm run build, and a production-browser smoke test. The preflight workflow applies the staged patch to the baseline and verifies its Git tree hash before running checks. The CI workflow also runs on pushes to the integration branch and pull requests targeting main.

On Windows, run Run-Tongpok.cmd from the repository folder. It runs npm ci, npm test, npm run test:ui, npm run test:publish, npm run lint, and npm run build, stopping on the first error and writing dev2-validation.json. If all checks pass, it starts the development server at http://localhost:3000. Use Finish-Tongpok.cmd to also commit and publish the work branch.

The browser smoke test covers home search, reviewed priority changes, Arena completion, result detail and back navigation, result reload in the same tab, empty-tab recovery, invalid links, keyboard selection, explicit preview, and a 390px viewport. Manually check visual appearance and retry after an interrupted stream as well.

Before opening a PR, check for newer main changes, resolve shared-page or backend changes, and rerun the required checks. Commit with the S07/S08/S09/S11 slice ids.

The persistent CI workflow uses a pinned Playwright version in a separate temporary directory. It does not change project dependencies or the lockfile. No live OpenAI requests or Shopee fetches are required by verification.
