# @ghostpay/metadata-hardening

Pure-logic helpers for the `MH-*` metadata hardening menu. Spec: [`docs/remote/privacy-specs/metadata-hardening.md`](../../docs/remote/privacy-specs/metadata-hardening.md). Testnet PoC only: every entry point that takes a chain refuses anything but 31337, 11155111, 84532 (Bitcoin: testnet, signet, regtest). No network calls, no I/O, no secrets in tests. Not wired into `apps/web` or `apps/relayer`: see [`wiring/metadata-hardening.md`](../../docs/remote/privacy-specs/wiring/metadata-hardening.md). Self-review: [`audit-metadata-hardening.md`](../../docs/remote/privacy-specs/audit-metadata-hardening.md) (AI self-review, not an independent audit).

**Implementation status (2026-11-25): standalone package complete** against its documented scope. All 29 `MH-*` ids that have pure logic are built, tested and hardened at every input boundary; the rest need edits in other workspaces or are out of scope (table below). Nothing consumes the package yet. See [Verification](#verification) and [Integration still required](#integration-still-required).

Each option reduces one named leak. None makes payments anonymous: payer, amount, token, time and router use stay public. The `doesNotProtect` text in `MH_CATALOGUE` is the normative UI copy.

## Status per MH id

| Status | MH ids |
|---|---|
| **Built here** (pure logic, tested) | ID-1, ID-2 (`derive`), TAG-2 (mode helpers), ANN-1 (config check), ANN-2 (scheme policy), ANN-3 (`buildMinimalMetadata`, `classifyMetadata`), AMT-1, AMT-2, WAL-1/WAL-2 (bucket + field allowlist), REL-2 (`planRelease`), REL-3 (`padBody`/`stripPad`), REL-4 (`RelayerPinning`), NET-1 (role routing, config check), SCAN-1 (filter assertion), SCAN-2 (`alignedScanRange`), INV-1 (`padPrivatePart`), INV-3 (coarse time), FEE-1 (`buildDirectPayment` calldata), WEB-1 (anchor lint), WEB-2 (`buildCsp`), WEB-3 (SRI), BTC-1..6 (plain-data helpers), catalogue/defaults/conflict rules |
| **Built here but needs edits in existing code to take effect** | TAG-2 `ignore`/`mask` (core-crypto `checkAnnouncement`/`deriveStealthSecret` hard-fail on tag mismatch), ANN-3 (scanner calls `parseMetadata`, which rejects length != 57), ID-1/ID-2 (keystore seed, session, scanner over N keys, invoice signer), AMT-1/2, INV-1/3 (invoice-schema `validatePrivatePart` strict keys), REL-2/3, WAL-1/2, SCAN-2, NET-1, BTC-* (call from `btc-silent-payments/src/spend.ts`), FEE-1 (UI + scanner `viaRouter=false` handling), WEB-1/2/3 (scripts, `_headers`, `index.html`) |
| **Needs existing-code edits only** (nothing pure to build) | ANN-1 R2/R3 tests, INV-2 (default `encrypt=true` in `CreateInvoice.tsx`), REL-1 (private submit RPC), REL-5 (zero-log mode), MH-WEB-1 R1/R2 Playwright tests, `hardening` settings object in `apps/web` |
| **Out of scope** | FEE-2 (new router contract, `packages/contracts`), NET-2 (docs), NET-3 (light client, WASM dep), SCAN-3 (PIR, separate package), real-wallet/RPC/relayer verification |

## Options and defaults (copied from the spec table)

Default ON: ANN-1, TAG-1, AMT-1 (only for `fiat_quote`), SCAN-1, WEB-1, WEB-2 (2a), BTC-1, BTC-4, BTC-5. Everything else OFF. `hardenedSettings()` is the spec's "hardened" preset. `validateHardening` encodes spec section 6: AMT-1 vs AMT-2, FEE-1 vs FEE-2, TAG-1 vs TAG-2 are blocking conflicts; INV-1 without INV-2, ANN-3 without FEE-1, BTC-3 with PayJoin and similar are warnings.

## API sketch

- `deriveInvoiceKeys(seed, index, {chainId?, signerMode?})`: HKDF-SHA256 stream (domain `ghostpay/mh/id/v1`, or `ghostpay/mh/chain/v1` + u32be chain id) fed to core-crypto's `generateKeySet` through its `RandomSource` hook, so there is no duplicated curve code and only the public core-crypto API plus `@noble/hashes` is used. Signer modes `per-invoice | per-chain | long-lived`; `linkability` strings must be shown in the UI. Spend/view key regression vector for `SEED = 0x01..0x20`, index 0 was recomputed independently with raw `@noble` (not just snapshotted).
- `roundGross`, `addAmountNoise`, `isPaid`, `bucketGasLimit`, `assertOnlyAllowedTxFields`.
- `encodeViewTagByte`, `viewTagAccepts`, `parseTagMode`, `classifyMetadata`, `resolveSchemePolicy`, `validateAnnouncerConfig`.
- `planRelease`, `padBody`, `stripPad`, `RelayerPinning`.
- `assertNoUserAddressFilter`, `alignedScanRange`, `dedupeLogs`, `roleForRequest`, `validateRpcRoles`.
- `padPrivatePart`, `stripPrivatePad`, `coarsenExpiry`, `coarsenQuoteTimestamp`.
- `buildDirectPayment` (calldata only; never signs or sends), `buildCsp`, `findUnsafeAnchors`, `sriDigest`, `verifySri`.
- `planChange`, `normalizeFeeRate`, `chooseLocktime`, `chooseSequence`, `orderInputs`, `orderOutputs`, `stripPsbtFingerprints`.
- `normalizeHardening(raw)`, `parseHardeningJson(text)`: load persisted settings (missing ids take the spec default, unknown ids are dropped, wrong types are rejected, blocking conflicts throw). `validateHardening` now needs real booleans.

## Does NOT protect (summary; full text in `MH_CATALOGUE`)

No option hides the payer, amount, token, time or router use. Reduced view tags break detection in other ERC-5564 wallets. Amount noise/rounding costs the payer money and leaves the amount public. Per-invoice keys do not stop linking through the same payer, shared sweep destination or a channel that carries two invoices; a shared signer keeps invoices linkable. Padding only hides length, and only matters with encryption (the key is in the same link). Light client and PIR are not built.

## UNVERIFIED

- Effectiveness against real wallets, RPC providers, relayers or chain-analysis tools: nothing was run against any.
- BIP-69 ordering was checked against the vectors in the BIP text fetched 2026-10-21 (inputs sort, two output pairs). Silent-payment output ordering with shuffled outputs (`k` indexing by recipient group) is NOT verified: callers must derive SP outputs first, then order, and map by `order`.
- PSBT: record numbers are verified (see Verification); no PSBT parser round trip was run.
- SRI: matching verified against W3C SRI section 3.3 and Chromium 158; Firefox and WebKit not compared.
- Locktime/fee-sniping practice (BIP-326) not read.
- Chi-square and distribution tests use a seeded test RNG, which proves the algorithms are unbiased, not the platform CSPRNG.

## Input contract

Every public function re-checks its arguments at runtime, because callers sit on a trust boundary (persisted settings, a peer's JSON, a wallet bridge).

- A function returns, or throws `MetadataHardeningError` with a stable `code` and a **fixed message that never contains caller data** (URLs, addresses, keys, field names that are not plain identifiers). A property test feeds hostile strings through every export and checks both (`contract-fuzz.test.ts`).
- Wrong runtime types are `INVALID_INPUT`, never a `TypeError`, a coercion or a silent default. Examples: a number where a `bigint` is required, an unknown `asset.kind` (it used to become a native-value transfer), a non-boolean flag, an object with a `toString` where a string is required, a `Uint8Array` that is really a string or array.
- Values from another realm (iframe, `vm`) are accepted: arrays, plain objects and `Uint8Array`s are recognised without `instanceof`.
- Inputs are never mutated. Deeply frozen inputs are used in the tests as the mutation detector. Outputs are new objects.
- Exported allow-lists and the normative catalogue copy are frozen (`TESTNET_CHAIN_IDS`, `BTC_TESTNETS`, buckets, `MH_IDS`, `HARDENED_PRESET`, `MH_CATALOGUE`).
- Not covered: an argument object whose getter or proxy throws propagates its own exception (except in `padBody`, which serialises through a guarded `JSON.stringify`).

### Size limits (all fail typed; `LIMIT_EXCEEDED` unless noted)

| Input | Limit |
|---|---|
| endpoint URL (`parseEndpoint`) | 2048 characters (`INVALID_INPUT`) |
| markup for `findUnsafeAnchors` | 4 MiB (`MAX_MARKUP_LENGTH`); the scan is linear |
| connect origins / one origin | 32 (`INVALID_INPUT`) / 512 characters |
| `integrity` attribute | 4096 characters (`verifySri` returns `false`) |
| settings JSON | 64 KiB (`MAX_SETTINGS_JSON_LENGTH`) |
| body / plaintext buckets | at most 16 buckets, each 1..16384 bytes (`INVALID_INPUT`) |
| pending sweeps / pinned sweeps / relayers | 100 000 / 4096 / 8 |
| scan budget (`maxRequests`) / logs per `dedupeLogs` | 10 000 (`INVALID_INPUT`) / 1 000 000 |
| owned addresses / topic slots / or-list | 100 000 / 8 / 1024 |
| direct-payment metadata | 1024 bytes |
| amounts / gas estimate | 2^256-1 / 2^64-1 |
| BTC inputs, outputs, PSBT maps | 10 000 each, 100 000 records per map; scriptPubKey 10 000 bytes |

### Behaviour changes for inputs that used to work

No export was removed or renamed and no signature changed (two functions and two constants were added). These valid-looking inputs now behave differently, on purpose:

- `parseEndpoint('https://h//')` returns `https://h` (was `https://h/`). `buildConnectSources`/`buildCsp` reject a host outside CSP host-source grammar (`;`, `,`, quotes, `_`), a raw `?`/`#`, control characters and non-strings.
- `findUnsafeAnchors`: a `target` is `_blank` only as an exact keyword (was a prefix match); `rel` splits on HTML whitespace only (a no-break space is no longer a separator); `<a-x>` is not an anchor; a `>` inside a quoted value no longer ends the tag; a non-string throws instead of returning `[]`.
- `verifySri`: algorithm names are case-insensitive; a recognised algorithm with a malformed value counts as the strongest set and fails; a non-`Uint8Array` throws `INVALID_INPUT`.
- `assertNoUserAddressFilter` also rejects a user address in `address` and any topic slot (`0x` or `0X`), needs `userAddresses` to be 20-byte hex, and rejects an address or topic that is not canonical hex instead of skipping it. `roleForRequest` sends a filter it cannot read to `query`. `alignedScanRange` caps `maxRequests` at 10 000. `dedupeLogs` rejects a log without an integer `blockNumber` and leaves `seen` untouched on error.
- `buildDirectPayment` rejects an unknown `asset.kind` and an `amount` above 2^256-1; `roundGross` needs `amountPolicyMode` to be `fiat_quote` or `fixed_token` and never returns more than uint256 max; `bucketGasLimit` throws `LIMIT_EXCEEDED` above 2^64-1; `classifyMetadata` needs a boolean `viaRouter`; `RelayerPinning.failover` needs `userConfirmed === true`; `assertLocktimeEffective` with a locktime and no inputs is `INVALID_INPUT` (was `CONFLICT`); `coarsenExpiry` refuses a result above 2^53 (`LIMIT_EXCEEDED`).
- `planChange` compares bech32 addresses case-insensitively for the reuse check and rejects `inputAddresses: null`. `parseEndpoint` rejects an empty `?` or `#` and strips every trailing slash (was one). Custom padding buckets above 16384 bytes or more than 16 are rejected. Arrays with holes are rejected. `verifySri` ignores nothing after the hash: `sha384-<hash>-x` never matches. `parseHardeningJson('null')` is `INVALID_INPUT` (corrupt storage, not "no settings"); `validateHardening` throws `INVALID_INPUT` for an unknown `tagMode`. `stripPsbtFingerprints` needs hex `key`/`value` and accepts any key type up to 2^32-1 (unknown types are dropped as before). `assertOnlyAllowedTxFields` names the offending field only when it is a known transaction field (`maxFeePerGas`, `nonce`, ...); any other key is "(name withheld)".

## Verification

Commands, from this directory (all run on commit `c50da473f0c683082fb49cdcd16106e15add3a45`):

```bash
npm run typecheck && npm run lint && npm run build && npm test   # unit, property, fuzz, environment; coverage thresholds enforced
node scripts/browser-smoke.mjs                                   # manual: real Chromium, needs dist/, vite and Playwright (not a CI job)
```

| Check | Result |
|---|---|
| Tests | 28 files, 394 tests, 0 failed, 0 skipped (125 existed before this work) |
| Coverage | statements 99.68 %, branches 99.29 %, functions 100 %, lines 100 % (before: 99.48 / 98.85 / 100 / 100; enforced thresholds 95 / 90 / 95 / 95 unchanged) |
| Typecheck, lint, build | clean |
| Defect evidence | the 14 new test files fail against the pre-change sources (141 of their 250 tests red); they pass now |
| Real browser | Chromium 158.0.8127.36, headless: Node and browser results byte-identical for a 15-result deterministic scenario; `findUnsafeAnchors` equals the browser's own HTML parser (DOMParser) on 15 tricky samples (quoted `>`, duplicate attributes, NBSP in `rel`, unquoted values, custom elements, Unicode, unterminated tag); `verifySri` was never more permissive than Chromium's SRI enforcement on 17 cases; a `buildCsp` string gave no parse warning, blocked an unlisted `connect-src` origin and an inline script; the library made no network request |
| Firefox, WebKit | **not run** (only Chromium is installed here) |
| Repo checks | `scripts/scan-secrets.sh` clean; `node --test scripts/agent/*.test.mjs` 12/12; affected workspaces: this one only (no dependents) |

Tests added (this directory, `src/`): `guard.endpoint`, `guard.immutability`, `web.anchors-robust`, `web.csp-origins` (incl. SRI), `serialization`, `direct.input-validation`, `direct.encode-failure`, `scan.filter-coverage`, `runtime-types`, `catalogue.settings`, `btc.input-validation`, `edge-cases`, `contract-fuzz` (every export, hostile values), `environment` (static scan of shipped sources for Node-only, network, storage, DOM and dynamic-code APIs; stubbed `fetch`/`XMLHttpRequest`/`WebSocket`/`Buffer`; no CSPRNG; cross-realm values). Property tests use fixed `fast-check` seeds, so failures reproduce.

Verified in this pass against primary sources (previously UNVERIFIED): PSBT key types in `stripPsbtFingerprints` match BIP-174, BIP-370 and BIP-371 (read from the BIP texts on 2026-11-25); SRI matching follows W3C SRI section 3.3 (strongest algorithm only; unknown algorithms skipped; options after `?` ignored) and was compared with Chromium's behaviour.

## Remaining limitations

- Not wired into `apps/web`, `apps/relayer` or any package; no effect on real payments until the edits in [`wiring/metadata-hardening.md`](../../docs/remote/privacy-specs/wiring/metadata-hardening.md) are made. Effectiveness against real wallets, RPC providers, relayers or chain analytics is unmeasured.
- Browsers: real run on Chromium only. Pure ES2022 plus `TextEncoder`, `URL`, `btoa`, `crypto.getRandomValues`, `BigInt` and `Object.hasOwn` (Chrome 93, Firefox 92, Safari 15.4 or newer, by feature support, not by test).
- `verifySri` is stricter than browsers in five cases (malformed or bare strongest token next to a valid weaker one, empty or all-unknown metadata, a no-break space as separator): it returns `false` where Chromium loads the file. It is never looser.
- `buildCsp` emits the six documented directives only. `base-uri` and `form-action` do not fall back to `default-src`; adding them is a deployment decision (follow-up).
- `findUnsafeAnchors` is a lint over HTML text: it does not skip comments or scripts, decode character references (`target="&#95;blank"` is missed), understand JSX, or check named targets other than `_blank`.
- `stripPsbtFingerprints` drops hash-preimage records (0x0a to 0x0d), proof-of-reserves (0x09), MuSig2 (BIP-373) and silent-payment (BIP-375/376) records: a stripped PSBT cannot finalise hashlock scripts or aggregate those protocols. BIP-370 version consistency is not checked.
- BIP-69 vectors, silent-payment output ordering with shuffled outputs and BIP-326 are as before (see UNVERIFIED).
- By design: `classifyMetadata` returns `accepted: false` (not a throw) for a non-integer length, so a scanner drops such an announcement; `normalizeHardening` drops unknown ids without a report (forward compatibility; a misspelt id is a silent no-op); failures inside caller callbacks (`canonicalize`, `keyOf`) and the viem encoder are reported with fixed text and the original cause is discarded on purpose (it can embed caller data).
- The key-derivation scheme in `derive.ts` is unreviewed by a cryptographer. Reviews so far are AI-assisted self-reviews, not an independent audit.

## Integration still required

1. Add `@ghostpay/metadata-hardening` as a dependency of each consumer and to `build:libs` (wiring doc, "Common").
2. `apps/web`: settings migration through `normalizeHardening`, call sites for each id (wiring items 1 to 13). Pass owned addresses to `assertNoUserAddressFilter`/`roleForRequest` as 20-byte hex; call `RelayerPinning.release` for finished sweeps.
3. `packages/core-crypto`, `chain-adapters`, `invoice-schema`, `btc-silent-payments`, `apps/relayer`: the edits listed in the wiring doc.
4. Deployment: generate `index.html`/`_headers` CSP from one `buildCsp` call; decide on `base-uri 'none'` and `form-action 'self'`.
5. CI: run `scripts/browser-smoke.mjs` (or an equivalent Playwright job) on Chromium, Firefox and WebKit where available; the Playwright and anvil acceptance tests (`AT-MH-*`) in the spec.

## Scripts

```bash
npm run typecheck && npm run lint && npm test   # from this directory
```

Dependencies: `@ghostpay/core-crypto`, `@noble/hashes 2.4.0`, `viem 2.57.13` (all already in the lockfile). No new dependency requested or added.
