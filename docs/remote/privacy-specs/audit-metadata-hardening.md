# Self security review: `@ghostpay/metadata-hardening`

Date 2026-10-21. Reviewer: the AI agent that built the package. This is a self-review, not an independent audit. Scope: `packages/metadata-hardening/src` at commit time. Nothing was run against a real chain, wallet, RPC or relayer.

## Threat model

Library of pure functions used on the client (and by the relayer for padding/gas/release planning). Adversaries: (1) passive chain/RPC observers the options try to blind; (2) a malicious or buggy caller feeding hostile data; (3) a mistaken user selecting an option whose cost they do not understand. Assets: seller seed and derived keys, payer funds (calldata correctness), honesty of privacy claims.

## Findings

| # | Severity | Finding | Status |
|---|---|---|---|
| 1 | Medium | `deriveInvoiceKeys` is a new key-derivation scheme (HKDF stream into core-crypto's rejection sampler). Wrong domain separation or a seed shorter than 32 bytes would weaken or collide keys. | Mitigated: seed >= 32 bytes enforced; distinct role/chain/index in `info`; flag bytes separate "no chain" from chain 0; tests cover distinctness across index/chain/seed/role and an independent raw-@noble recomputation of the spend/view vector. Not reviewed by a cryptographer. Seed storage is the caller's duty (encrypted keystore). |
| 2 | Medium | Per-invoice signer breaks buyers' pinned-signer trust; a shared signer keeps invoices linkable. Easy to mislabel as "unlinkable". | Mitigated in API: `signerMode` is explicit, `linkability` strings returned and required in UI wiring; catalogue copy has no "unlinkable/anonymous/mix" wording (test asserts). |
| 3 | Medium | `buildDirectPayment` produces calldata that moves funds with no router protection (no minimum received, no deadline). Wrong target = lost funds. | Mitigated: strict addresses, router refused as announcer/token/stealth, non-zero amount, ephemeral key validated by core-crypto, testnet-only, warning string returned for mandatory pre-sign display. Nothing is signed or sent. Calldata decoded in tests; no on-chain run. |
| 4 | Low | Reduced view tag modes cause other wallets to miss payments. | Mitigated by copy and the TAG-1/TAG-2 conflict rule; mode must be chosen by both sides. |
| 5 | Low | Randomness: all selections use `crypto.getRandomValues` by rejection sampling; `Math.random` is lint-banned. Tests use a seeded RNG so distribution tests show algorithm bias only. | Accepted; platform CSPRNG unverified here. |
| 6 | Low | Error messages could echo URLs/keys. | Mitigated: fixed strings; tests check URL with credentials is not echoed. One exception by design: `assertOnlyAllowedTxFields` names the offending field (truncated to 24 chars, a field name, not a value). |
| 7 | Low | Regex-based anchor lint (`findUnsafeAnchors`) can miss unusual markup. | Accepted: documented as a lint aid; Playwright check in wiring is the real test. |
| 8 | Low | `stripPsbtFingerprints` allowlist uses record numbers from memory; a wrong entry could drop a needed record or keep an identifying one. | Open (UNVERIFIED): verify against BIP-174/370/371 before wiring; no PSBT parser round trip run. |
| 9 | Low | BIP-69 sorting only; shuffled outputs may affect silent-payment output index `k`. | Open: callers must derive SP outputs first; spec lists as unverified. BIP-69 vectors from the BIP text pass. |
| 10 | Info | Testnet-only guard is enforced wherever a chain/network is an argument. Pure numeric helpers with no chain context (`padLengthFor`, `padPrivatePart`, `padBody`, tag helpers, `verifySri`, `buildCsp`, `classifyMetadata`) are chain-agnostic and cannot be guarded. | Accepted. |
| 11 | Info | `planRelease` ranks ties by a prior shuffle; timestamps are ms resolution, so distribution is uniform to 1 ms. Pending plan data is returned to the caller; storing it persistently would violate PO-LOG-2. | Accepted; wiring says memory only. |

## Fixes applied during build

Typecheck error in a test, found and fixed. Rounding helper falls back to finer grids when `maxSlippageBps` would be exceeded (instead of silently exceeding it). Strongest-hash SRI rule so a weak matching hash cannot rescue a failing strong one.

## Verification status

Ran in `packages/metadata-hardening`: `npx vitest run --coverage` (115 tests, 10 files, statements 99.48 %, branches 98.83 %, functions 100 %, lines 100 %), `npm run typecheck`, `npm run lint`, `npm run build`: all clean. Not run: anvil/e2e, Playwright, any real wallet/RPC/relayer, `btc-silent-payments` vectors with ordering, a cross-implementation check of PSBT numbers or SRI semantics. Spec acceptance items that are pure logic (AT-MH-AMT-1 1 000 quotes, AMT-2 1 000 runs, REL-2 chi-square and majority-reorder, INV-1 fuzz <= 3 lengths, INV-3 100 invoices, ID-1 five invoices all found and none shared, ID-2 cross-chain miss, BIP-69 vectors) are covered; integration acceptance items are listed in `wiring/metadata-hardening.md`.

## Residual risk

Nothing here hides payer, amount, token, time or router use. Effectiveness of every option against real analytics is unmeasured. New KDF unreviewed externally.
