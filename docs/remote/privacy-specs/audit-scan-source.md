# Self security review: `@ghostpay/scan-source`

AI self-review by the builder (Claude Sonnet 5.5), not an independent audit. Date 2026-10-21. Testnet PoC.

## Threat model
Adversaries: (A1) RPC / indexer / PIR operator that learns requests; (A2) a lying source (hides payments, forks, injects records);
(A3) hostile response bodies (parser attacks); (A4) accidental secret leakage in requests or errors.
Assets: which announcements/pages are the user's; completeness and authenticity of scanned data; user secrets (never present here).

## Findings
| ID | Sev | Finding | Status |
|---|---|---|---|
| S1 | Medium | A lying range RPC can silently omit logs. | `range` reports `unverified`; compose with `createQuorumSource` (fails closed on any disagreement). Not fixable by one source. |
| S2 | Medium | Forked or incomplete indexer. | Complete contiguous parent-link chain required; window ends and every announcement block cross-checked to an independent source; announcements with unknown block hash dropped. Residual: header trio not hash-recomputed, omission inside a real block undetected (documented). |
| S3 | Medium | Untrusted JSON/records. | Strict parser; never throws on junk (fast-check fuzz); ids recomputed; dedupe, window filter, size caps (`maxBytes`, budgets). |
| S4 | Medium | Secrets in requests/errors. | Backend/URL shapes carry only chain id, block bounds, pageSize; test asserts URL regex and call keys. Error messages fixed text (no URLs). |
| S5 | Low | Request-size fingerprinting of "fresh install vs catch-up". | `padWindow` grid + min span, fixed-size backend chunks; tested. |
| S6 | Low | Silent mode downgrade. | `createScanSource` never falls back; unknown mode throws. |
| S7 | Low | Light-client overclaim. | Integrity `proof` only if `verifiesLogs`; claims text says it does not hide queries. |
| S8 | Info | PIR window-to-page mapping is public: page set reveals the window to a colluding pair only; windows needing >= W pages fail rather than leak by shrinking padding. | Documented. |
| S9 | Info | `indexer-tor` name implies Tor: this package cannot verify the transport. | UI text says IP hidden only with a non-direct profile. |

## Verification
`npx vitest run --coverage`, `npm run typecheck`, `npm run lint` in the package (numbers in the commit report). In-memory fakes only.
Not verified: real servers, Tor, Helios, browser worker integration, independent review.
