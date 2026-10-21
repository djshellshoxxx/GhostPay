# Self security review: `@ghostpay/pir-two-server`

AI self-review by the builder (Claude Sonnet 5.5), not an independent audit. Date 2026-10-21. Testnet PoC.

## Threat model
Adversaries: (A1) one honest-but-curious PIR server; (A2) a malicious server returning wrong answers or a forked manifest;
(A3) two colluding servers; (A4) network observer; (A5) malformed client queries sent to a server (DoS/probing).
Assets: which page (hence which block range) the client reads.

## Findings
| ID | Sev | Finding | Status |
|---|---|---|---|
| F1 | Info (by design) | A3 recovers the index exactly (`qA xor qB = e_i`). Non-collusion is an assumption, not enforced. | Documented in `PIR2_CLAIMS`, README. Client refuses same host / registrable domain only (heuristic). |
| F2 | Medium | Query randomness predictability would leak the index. | Default is `crypto.getRandomValues`; lint bans `Math.random`; injected source length/type checked (`RNG_FAILURE`); test over seeded and real CSPRNG. |
| F3 | Medium | Malicious server flips or substitutes page data. | Every page (real and dummy) checked against manifest leaf hash; mismatch discarded as `PIR_INTEGRITY`. Detected, not corrected. |
| F4 | Medium | Forked/lying manifest. | Both manifests parsed strictly (root recomputed), must be deep-equal; optional third-source head hash check. If `thirdSourceBlockHash` is omitted, a both-servers-agree fork is not caught. |
| F5 | Low | Page-range metadata in the manifest is unauthenticated beyond server agreement. | Fetched pages are re-checked against their declared range (`BAD_PAGE`). A single liar is caught by equality. |
| F6 | Low | Non-canonical query bits / wrong length to server as covert channel or crash. | `pirAnswer` rejects them; HTTP returns uniform 1-byte errors; body size capped to the exact query length. |
| F7 | Low | Timing: dummy schedule only; server work is O(n) regardless of query (loop is branch-free per byte, but JS gives no constant-time guarantee). | Documented. |
| F8 | Low | Error text leaking URLs. | Transport errors replaced by fixed text; no URLs in any message. |
| F9 | Info | Dummy indices uniform over all pages, may coincide with real ones; real/dummy split is not visible to servers by construction. | Tested (order shuffle, W fetches). |
| F10 | Info | HTTP server has no auth, TLS or rate limit. | Loopback default; operators must front it with TLS and `relayer-guard`-style limits. Not verified in production. |

## Verification
`npx vitest run --coverage`, `npm run typecheck`, `npm run lint` in the package (numbers in the commit report). Property tests (fast-check) for
reconstruction n in 1..4096; exhaustive n=4 single-view bijection; chi-square (df 64, p=0.001) on 20 000 seeded samples; leaky-query sanity check proves the test has power.
Not verified: real operators, Tor/OHTTP transport, scale (>2^14 pages), formal proof, independent review.
