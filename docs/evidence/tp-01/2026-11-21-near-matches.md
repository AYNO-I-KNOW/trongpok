# Homepage near matches

2026-11-21 · TP-01

Homepage live search compares up to three offers. A candidate must be in the requested category and have an exact-model page from an approved source and a verified Thai price. Known out-of-stock offers are excluded; unknown stock is disclosed. The search does not access Shopee. This replaces the [README’s strict homepage filter](../../../README.md#ลองค้นสินค้าจากเว็บ): an unmet or unverified requirement, including budget, is now a visible caveat rather than a reason to discard an otherwise eligible offer.

The fit percentage is the weighted share of checks confirmed by evidence, not a review score or a trust rating. Required features and budget each weigh two; preferences weigh one. A failed or unverified check earns no points. If the buyer specified no scored checks, a verified product category is a 100% match. Offers that meet all required checks rank first, then offers with higher fit percentages, then lower prices. If fewer than three meet the required checks, the existing follow-up search can still look for more even if three near matches were found.

The comparison shows fit and caveats in each product column without opening the details. If no offer meets all required checks, the heading reads **ตัวเลือกใกล้เคียง** instead of recommending a model. Older saved web results without a fit score, catalog demo, and Arena retain their existing presentation. The comparison uses the existing layout and FitPill from [`origin/thanid-design` at `03ef6c0008f6197c2c0316aa4cab86a017b93f42`](https://github.com/AYNO-I-KNOW/trongpok/commit/03ef6c0008f6197c2c0316aa4cab86a017b93f42).
