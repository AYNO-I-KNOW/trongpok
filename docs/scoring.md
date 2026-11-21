# Scoring contract

Code computes every number. LLMs and agents return labels, candidates, and quotes only.

## Inputs

- **Requirement** `{id, text, kind: 'must'|'nice'|'budget', value?: number, longUse?: boolean, spec?: {key, op: '>='|'<='|'=='|'includes', value}}`, where `value` is the budget in baht for `kind: 'budget'`. `longUse: true` means only reviews from long use can count (durability, "still works after weeks"). It comes from the category pack's question options or from the need-extraction step.
- **Product** has `specs`, `features`, `priceThb`, `stars`, `ratingCount`, `shop`, `claims`, and `reviews` (see `data/README.md`).

## Review labels (per review × requirement, and per review × claim)

`stance ∈ {confirm, contradict, none}`, `target ∈ {product, logistics, service, price}`, `quote`, `usage ∈ {unboxing, short, long}`, `specific: boolean`.

- `usage`: `unboxing` = written on arrival or before real use ("เพิ่งได้รับ", "ยังไม่ได้ลอง", "แกะกล่องแล้วสวย"); `short` = used for days; `long` = states several weeks or months of use, or describes something that only shows after long use.
- `specific`: true when the review describes a concrete situation or result tied to the subject ("ติดระเบียงชั้น 8 นกพิราบหายไป 3 เดือนแล้ว"). Generic praise ("ดีมาก ใช้ได้ผล แนะนำค่ะ") is false.
- Drop template reviews first.
- `target ≠ product` → `none`.
- If `quote` is not an exact substring of the review, the label becomes `none`.
- Judge stance from the text, never from the stars.
- `unboxing` reviews can be labeled on claims about appearance, but never count for a requirement.
- For a `longUse` requirement, only `usage = long` labels count.
- Weight `w = (hasMedia ? 1.5 : 1) × (daysAgo <= 90 ? 1.2 : 1) × (stance = confirm and not specific ? 0.3 : 1)`. Contradicts keep full weight because a wrong "fits you" costs the buyer more than a wrong "doesn't fit".

## Requirement status per product

`spec` result: the `spec` predicate on `product.specs[key]` → `pass` / `fail`. Missing key or no predicate → `unknown`.
`n` = reviews that confirm or contradict this requirement. When `n >= 3`, `r = Σw(confirm) / Σw(confirm + contradict)`.

| Condition (first match wins) | status | score |
|---|---|---|
| kind `budget` and price > budget | `fail` | 0 |
| kind `budget` and price ≤ budget | `pass` | 1 |
| spec `fail` | `fail` | 0 |
| `n >= 3` and `r < 0.4` | `contradicted` ("สเปกบอกว่าได้ แต่ผู้ใช้จริงบอกว่าไม่ได้" when spec `pass`) | r |
| `n >= 3` and `r >= 0.6` | `pass` | r |
| `n >= 3` | `mixed` | r |
| spec `pass` | `spec-only` ("ตามสเปก ยังไม่มีรีวิวยืนยัน") | 0.6 |
| `longUse` and fewer than 3 long-use labels | `unknown` ("ยังไม่มีรีวิวจากคนที่ใช้นานพอ") | 0.4 |
| otherwise | `unknown` | 0.4 |

A `longUse` requirement whose spec passes but which has fewer than 3 long-use labels uses the `spec-only` row. The card adds "Shopee ให้รีวิวได้ภายใน 30 วันหลังได้ของ ของที่พังหลังจากนั้นจึงไม่อยู่ในรีวิว".

## Review-quality warning (per product)

Among non-template reviews, count the ones that are `unboxing`, or confirm without being `specific`. When that share is ≥ 0.6, show "รีวิวส่วนใหญ่เขียนตอนเพิ่งได้ของ หรือชมแบบไม่มีรายละเอียด" with the share as a percent. This is information, not a penalty: the weights above already handle it.

## Fit

- `fit = Σ(weight × score) / Σweight`, with must = 2, nice = 1, budget = 2.
- `mustOk` = no must or budget requirement is `fail` or `contradicted`. Two or more distinct, specific contradictory reviews also block this flag for a must that is `unknown` or `spec-only` when every eligible review contradicts it.
- `fitPct = round(100 × fit)`.

## Trust (ตรงปก, spec 2026-10-23 §5.3)

- claim score per claim: `n < 3` → 0.4, otherwise the weighted confirm ratio. `claimScore` = mean. Claims with `checkable: false` are excluded.
- `shop = 0.3·age + 0.35·bad + 0.2·badge + 0.15·resp` where:
  - age: years ≥ 2 → 1, ≥ 1 → 0.8, ≥ 0.5 → 0.6, else 0.3
  - bad: badRatePct ≤ 1 → 1, ≤ 3 → 0.7, ≤ 6 → 0.4, else 0.1
  - badge: official → 1, preferredPlus → 0.8, verified → 0.7, else 0.4
  - resp: chatResponsePct / 100
- `trust = 0.7·claimScore + 0.3·shop`
- `evidence` = distinct reviews that confirm or contradict any claim or requirement. `evidence < 10` → trust is `null`, and the card shows "ข้อมูลไม่พอ" for trust.

## Rank

- `value = budget ? clamp(1 − price / budget, 0, 1) : 0.5`
- `rankScore = 0.6·fit + 0.25·(trust ?? 0.4) + 0.15·value`
- Order: `mustOk` products first, then `fit` descending, then the number of specific supporting reviews for must requirements, then `rankScore` descending. Ties go to the lower price.
- Skeptic objections do not change the numbers directly. An objection whose quotes pass the substring check adds contradict labels, and the score is recomputed.

## Savings

`savings = price(highest-stars product in the category that the user did not pick) − price(rank 1)`. Show it only when rank 1 is `mustOk` and the difference is positive. Also list `unusedFeatures` = features of the highest-stars product that match no requirement.

## Evaluation (personas)

`data/personas.csv` has, per persona: the answers, and `human_top3` (final, agreed by two labelers).

| Method | Ranking |
|---|---|
| ours | the rank above, from cached arena labels |
| ours-rules | the rank above, from rule labels |
| stars | stars desc, then ratingCount |
| popular | ratingCount desc |
| plain LLM | one call: need + product list (title, price, specs, stars) → top 3, no reviews, no rules |

Report: top-1 hit rate, mean top-3 overlap (0–3), how often rank 1 fails a must according to human notes, and mean savings for ours vs stars.
