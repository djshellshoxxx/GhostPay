# Self security review: `@ghostpay/hops`

AI self-review by the build agent, not an independent audit. Date 2026-10-21. Scope: `packages/hops/src`. Testnet PoC; nothing run against a real wallet, RPC, relayer or chain.

## Threat model
Assets: seller funds on one-use stealth addresses mid-chain; keys; the honest claim that the mode is weak. Adversaries: (A1) payer/public analyst following the chain (explicitly NOT defended; proven by test); (A2) a relayer seeing requests; (A3) a malicious or buggy relayer/quote supplying fee or feeTo; (A4) crash/restart mid-leg; (A5) a caller that skips the ack or targets mainnet; (A6) leaked storage (plan files).

## Findings
| # | Sev | Finding | Status |
|---|---|---|---|
| 1 | Info | Mode gives no unlinkability; copy and tests say so (AT-HOP-NEG-1: 200/200 recovered, any crowd size when `S1` known) | By design |
| 2 | Med | Malicious quote could set high fee / foreign `feeTo` | Mitigated: fee <= 300 bps and < balance enforced at signing; quote freshness enforced; `feeTo` is signed in the order but its identity is not validated here (app should pin the relayer's `feeTo`) |
| 3 | Med | Signing before persisting could double-spend or strand a leg after a crash | Fixed: `signing` + nonce + deadline persisted first; tests inject a crash at the `signing` and `submitted` saves; resume checks `nonceUsed` and the deadline |
| 4 | Med | Re-signing after resume while an old signed order is still valid | Mitigated: revert to `due` only after the order deadline (<= 900 s) passes; a stale landing leaves balance 0 and the re-run refuses (`AMOUNT_TOO_SMALL`) |
| 5 | Med | Presigned payloads or keys persisted | Mitigated: serializer rejects forbidden keys; leg key whitelist; sealed store port; no signature object is ever stored |
| 6 | Low | Key lifetime depends on the `HopAddressSource` implementer | Package only touches keys inside `withSecretAt`; test stub proves zeroise-on-throw; real adapter UNVERIFIED |
| 7 | Low | Delay timing is uniform and app-closed delays distort it | Disclosed in copy; no hiding claim |
| 8 | Low | `nonceUsed` on resume reveals the address to the RPC | Documented in wiring; not mitigated |
| 9 | Low | Total-delay cap shrinks later draws (slight non-uniformity) only when the cap binds | Accepted; never binds with defaults |
| 10 | Info | `direct` relayer mode validated but unsupported | Fails closed (`DIRECT_UNSUPPORTED`) |
| 11 | Info | Candidate range in `fingerprintReport` is a conservative superset (+/-1 rounding per hop) | Accepted |

## Controls verified (what was run)
57 tests, coverage 100/100/100/100 (statements/branches/functions/lines). Mutations tried by hand: removing the ack check, the persist-before-sign commit, or the forbidden-key guard each fail at least one test (1, 9, 2 tests). Typecheck, lint, build clean. Testnet guard tested on every exported entry point that has a chain id. Banned-word grep over all static strings and generated previews.

## Not verified
Anvil/real contract e2e; relayer HTTP adapter; hygiene adapter; UI; Tor/proxy; relayer log tests; token-specific permit quirks; fee-compounding versus on-chain measurements.
