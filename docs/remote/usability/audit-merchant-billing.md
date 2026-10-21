# Self-review: @ghostpay/merchant-billing

## Scope
Pure logic only: no network, storage, clock or randomness except injected (`now` argument, `RandomSource`).

## Threat model
| Threat | Mitigation |
|---|---|
| Malicious CSV (formula injection, homoglyph address, oversize, control or bidi characters) | strict parser, formula guard, ASCII-only address regex plus EIP-55, size/row/field limits |
| Preview/submit swap | `confirmBatch` recomputes domain-separated sha256 over canonical content and compares to the user-confirmed hash |
| Rounding drift / lost units | bigint only; largest-remainder allocation; property test sum == total |
| Double refund / over-refund | idempotency key + cap on cumulative non-failed refunds; deterministic `refundId` |
| Refund deanonymization | plain addresses (incl. sender) refused; only valid meta-addresses; caller can supply `linkedMetas` |
| Duplicate payment webhook | ledger idempotent by event id; conflicting replay rejected |
| Subscription over-issuance | per-index single issuance, `nextIndex` monotonic, issuance blocked when past_due, per-call cap |
| Error-message leakage | fixed messages; `where` is row number only |

## Findings and fixes during review
1. `markPaid` first had a dead, convoluted past_due condition; replaced with "clear only when nothing open" (advance recomputes lateness).
2. A test expected past_due at a time already past the lapse window; confirmed the code (lapsed) was right and fixed the test.
3. Literal invisible characters had slipped into `csv.ts` source (lint `no-irregular-whitespace`); replaced with escapes.
4. Zero address rejected in `parseEvmAddress`.

## Honest limits
- Non-custodial: no automatic charging. Subscriptions depend on payers acting on reminders; reminders are returned as data and must be delivered by the caller (email/push is out of scope and would need a privacy review).
- The package does not verify on-chain payments, sign invoices, or broadcast refunds. Callers must verify before `markPaid`/`applyPayment`. Refund execution via the relayer needs a wiring change; no relayer or web files were touched.
- Refund freshness: the package cannot know whether a payer-supplied meta-address was used elsewhere; it checks only against `linkedMetas` and structure.
- Invoice quote fields in generated subscription invoices use `now`; quote refresh at payment time is the web app's job.
- Month arithmetic uses JS `Date` in UTC (no DST/timezone issues); anchors beyond year 9999 are rejected.
- `parseEvmAddress` zero-address and checksum rules assume EVM; BTC/other chains are not covered.
- Prorated totals use half-up rounding; the choice is policy, not law; tax is floor on subtotal and not jurisdiction-aware.
- Coverage thresholds 95/90/95/95 met (see report); not mutation tested.
- `@ghostpay/merchant-billing` has no node_modules workspace symlink until the coordinator runs `npm install`.
