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
| 6 | Low | Error messages could echo URLs/keys. | Closed 2026-11-25: fixed strings everywhere; `assertOnlyAllowedTxFields` names a field only when it is a known transaction field name, so a hostile or secret-shaped key can no longer inject log lines or reach logs. A property test over every export checks that no message contains caller data. |
| 7 | Low | Regex-based anchor lint (`findUnsafeAnchors`) can miss unusual markup. | Closed as a defect 2026-11-25 (see 12): now a linear tokenizer checked against the browser's HTML parser; still a lint over HTML text, not a parser. |
| 8 | Low | `stripPsbtFingerprints` allowlist uses record numbers from memory; a wrong entry could drop a needed record or keep an identifying one. | Numbers verified against BIP-174/370/371 on 2026-11-25 (no mismatch). Still open: no PSBT parser round trip; hash-preimage (0x0a-0x0d), BIP-373/375/376 records are dropped, so such a PSBT cannot be finalised after stripping. |
| 9 | Low | BIP-69 sorting only; shuffled outputs may affect silent-payment output index `k`. | Open: callers must derive SP outputs first; spec lists as unverified. BIP-69 vectors from the BIP text pass. |
| 10 | Info | Testnet-only guard is enforced wherever a chain/network is an argument. Pure numeric helpers with no chain context (`padLengthFor`, `padPrivatePart`, `padBody`, tag helpers, `verifySri`, `buildCsp`, `classifyMetadata`) are chain-agnostic and cannot be guarded. | Accepted. |
| 11 | Info | `planRelease` ranks ties by a prior shuffle; timestamps are ms resolution, so distribution is uniform to 1 ms. Pending plan data is returned to the caller; storing it persistently would violate PO-LOG-2. | Accepted; wiring says memory only. |
| 12 | Medium | `findUnsafeAnchors` missed `target="_blank"` when a quoted attribute held `>` (fail-open), returned no findings for non-string input, treated a no-break space as a `rel` separator, flagged `<a-x>`/`_blankfoo`, and took about 4 s on 60 000 unterminated `<a ` (quadratic). | Fixed: linear single-pass tokenizer, strict input contract, 4 MiB limit. Agrees with Chromium's DOMParser on 15 samples. |
| 13 | Medium | `buildConnectSources`/`buildCsp` accepted `;`, `,` and quotes in a host: an entry could add a CSP directive or a second policy; objects were coerced through `toString`. The injection could only tighten, not loosen. | Fixed: CSP host-source grammar, string-only entries, control characters and raw `?`/`#` refused. |
| 14 | Medium | `buildDirectPayment` turned an unknown `asset.kind` into a native-value transfer; string or array metadata encoded to garbage calldata; viem's error text (which embeds arguments) could reach the caller. | Fixed: explicit kind check, byte and amount type/range checks, encoder failures reported with fixed text. |
| 15 | Medium | `TESTNET_CHAIN_IDS`, `BTC_TESTNETS` and the normative catalogue copy were mutable at runtime: one `push(1)` disabled the testnet-only guard. | Fixed: frozen. |
| 16 | Medium | `verifySri`: a malformed strongest-algorithm token could be rescued by a weaker valid one; algorithm names were case-sensitive (W3C SRI 3.3.2-3.3.4). | Fixed to the spec rule; never more permissive than Chromium (17 cases), stricter in 5 (documented). |
| 17 | Low | `padBody` produced invalid JSON for arrays or a `toJSON` that returns a non-object, leaked `TypeError` for BigInt and cycles; `stripPad`/`stripPrivatePad` accepted `null` and arrays; a 1e12-byte bucket tried to allocate a terabyte. | Fixed: typed errors, plain-object checks, bucket cap 16 KiB. |
| 18 | Low | `assertNoUserAddressFilter` checked only topic2/3 (not `address` or other topics); `roleForRequest`, `dedupeLogs` and `alignedScanRange` trusted shapes (NaN block numbers kept, 50 000-window plans, `seen` half-updated on error). | Fixed: every slot checked, malformed filters route to `query`, bounded budgets, atomic dedupe. |
| 19 | Low | `parseEndpoint` normalised `//` to a trailing slash and a quadratic regex handled slash runs; unbounded length; objects coerced. | Fixed. |
| 20 | Low | Loose typing: tag modes with `bits` 0/8 or an unknown kind, string `"false"` as `viaRouter`/flag (truthy), number scheme ids, `roundGross` with a mistyped `amountPolicyMode` rounding a fixed amount, `RelayerPinning.failover('x', 'yes')`, bech32 change-address reuse bypassed by upper case, float rounding past 2^53 in `coarsenExpiry`. | Fixed with strict checks and integer arithmetic. |
| 21 | Info | Spec wiring says "call `validateHardening` on load" but no loader existed for malformed or old persisted settings. | Added `normalizeHardening`/`parseHardeningJson` (typed errors, unknown ids dropped, never coerced). |
| 22 | Info | CSP built by `buildCsp` has no `base-uri` or `form-action` (they do not fall back to `default-src`). | Open, deployment decision (documented in README). |

## Completion pass 2026-11-25 (findings 12-22)

Added runtime-type validation at every boundary, a linear anchor tokenizer, strict CSP origins, safe serialization and bounds, frozen constants, and settings normalisation. 269 tests were added (394 total), including contract fuzzing of every export. Reviewers: the same AI agent family (self-review), plus two independent AI review passes (silent-failure and correctness). Not an independent professional audit.

## Fixes applied during build

Typecheck error in a test, found and fixed. Rounding helper falls back to finer grids when `maxSlippageBps` would be exceeded (instead of silently exceeding it). Strongest-hash SRI rule so a weak matching hash cannot rescue a failing strong one.

## Verification status

Ran in `packages/metadata-hardening` (2026-10-21): `npx vitest run --coverage` (115 tests, 10 files, statements 99.48 %, branches 98.83 %, functions 100 %, lines 100 %); 2026-11-25: 394 tests, 28 files, statements 99.68 %, branches 99.29 %, functions 100 %, lines 100 %, plus a real-Chromium smoke run (`scripts/browser-smoke.mjs`), `npm run typecheck`, `npm run lint`, `npm run build`: all clean. Not run: anvil/e2e, Playwright, any real wallet/RPC/relayer, `btc-silent-payments` vectors with ordering, a cross-implementation check of PSBT numbers or SRI semantics. Spec acceptance items that are pure logic (AT-MH-AMT-1 1 000 quotes, AMT-2 1 000 runs, REL-2 chi-square and majority-reorder, INV-1 fuzz <= 3 lengths, INV-3 100 invoices, ID-1 five invoices all found and none shared, ID-2 cross-chain miss, BIP-69 vectors) are covered; integration acceptance items are listed in `wiring/metadata-hardening.md`.

## Residual risk

Nothing here hides payer, amount, token, time or router use. Effectiveness of every option against real analytics is unmeasured. New KDF unreviewed externally.
