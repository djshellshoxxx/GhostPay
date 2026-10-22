# Wiring: `@ghostpay/metadata-hardening`

Package: `packages/metadata-hardening`. Spec: `../metadata-hardening.md`. These are the exact edits the owners of existing dirs (lanes E1-E6 in `../README.md` section 4) need. Nothing below was applied by the package builder. Line numbers are from the spec's read of the repo and may have drifted.

Common: add `"@ghostpay/metadata-hardening": "0.1.0"` to the consuming package's dependencies, add the package to the root `build:libs` order after `core-crypto` (docs lane E7), and keep each import to the public entry (`@ghostpay/metadata-hardening`).

## apps/web (E6)

1. `src/lib/settings.ts`: add one field `hardening: { enabled: Record<MhId, boolean>; tagMode: string }` (type `HardeningSettings`), default `defaultHardening()`, migration for `ghostpay.settings.v1` that fills it when missing. Call `validateHardening` on load and on every change; block on `errors`, show `warnings`. If E6 adopts `@ghostpay/privacy-profiles`, nest this under its `privacy` field instead.
2. Settings UI: one toggle per id from `MH_IDS`, label `MH_CATALOGUE[id].title`, and always show `hides` and `doesNotProtect` next to the toggle (normative copy; no anonymity wording). `MH-ANN-2` behind an "unsafe" disclosure; `MH-TAG-2` shows `describeTagMode`.
3. `session.ts:78` / `SellerKeys.tsx` (MH-ID-1, ID-2): replace `generateKeySet()` + `randomScalar()` with a keystore that holds a 32-byte seed and a `nextIndex` (encrypted with the existing secret-box). On invoice creation call `deriveInvoiceKeys(seed, nextIndex++, {chainId, signerMode})`; persist `nextIndex`. `summarize` (`session.ts:54-55`) returns the per-invoice `metaAddress` and signer. Show `InvoiceKeys.linkability` strings (PO-COR-4). Keep a legacy random-key mode (random keys cannot be derived retroactively). Recovery: import seed, then `deriveInvoiceKeyRange(seed, 0, N, opts)` and scan with every key.
4. `CreateInvoice.tsx`: `MH-INV-2` default `useState(true)`; `MH-INV-3` apply `coarsenExpiry(expiresAt, {chainId})` and `coarsenQuoteTimestamp(ts, now, {chainId})` before signing (signature must cover rounded values); `MH-INV-1` call `padPrivatePart(part, canonicalize)` with the invoice-schema canonicalizer before encryption (after E3 changes `validatePrivatePart`).
5. Pay flow (`adapter.ts:175` gross formula): `MH-AMT-1` call `roundGross(gross, {chainId, amountPolicyMode, maxSlippageBps})` for `fiat_quote` invoices only; `MH-AMT-2` call `addAmountNoise` and show `surplus` before signing; call `assertSingleAmountMode`. Seller-side paid check uses `isPaid(net, required)`.
6. `wallet.ts:178` (`MH-WAL-1`): after simulation set `gas = bucketGasLimit(estimate, {chainId})`; run `assertOnlyAllowedTxFields(tx)` on the request; the post-submission compare (`~:248`) must tolerate the extra `gas` field (`SubmissionMismatchError`).
7. `MH-FEE-1`: new direct-pay button in the pay flow calling `buildDirectPayment({... announcer, routerAddress, stealthAddress, asset, amount, ephemeralPublicKey, metadata})`; send `calls[0]` then `calls[1]` through the wallet, showing `result.warning` before signing; announcer from the manifest (validate with `validateAnnouncerConfig`). `Scan.tsx:198` keeps "paid directly, no GhostPay fee" and marks amount unverified.
8. `MH-TAG-2` / `MH-ANN-3` payer side: write `encodeViewTagByte(tag, mode)` into `metadata[0]`; for ANN-3 use `buildMinimalMetadata`. Never for router payments (`classifyMetadata`).
9. `MH-REL-3`: `relayerClient.ts` wraps request bodies with `padBody(body)` and strips response pad with `stripPad`. `MH-REL-4`: `Settings.relayerUrl` becomes `relayerUrls[]` validated by `validateRelayerUrls`; keep one `RelayerPinning` per app session; use `pin.assign(sweepId)` for both quote and sweep (`sweep.ts`); failover only through `pin.failover(id, true)` after a UI confirm.
10. `MH-NET-1`: settings `rpcUrls[chainId]` becomes `{scan, query}` validated by `validateRpcRoles`; the transport wrapper picks the endpoint with `roleForRequest(method, filter, ownedAddresses)`; per-address methods (`sweep.ts:55,171`) must never use `scan`. Error text must not contain URLs.
11. `MH-SCAN-1/2` in the scanner call site (`chain-adapters/src/logs.ts` ~207, lane E1): before each `getLogs` call `assertNoUserAddressFilter(filter, ownedAddresses)`; for SCAN-2 compute `alignedScanRange({chainId, wantedFrom, head})`, iterate `windows`, pass results through `dedupeLogs(..., seen, key)`, and surface `truncated`.
12. `MH-WEB-1`: add a test using `findUnsafeAnchors` over rendered markup/source (every `target=_blank` needs `rel="noreferrer noopener"`). `MH-WEB-2`: build step generates `index.html` meta CSP and `public/_headers` from one `buildCsp(origins)` call; `scan-bundle.mjs:128` list extended to compare both strings. `MH-WEB-3`: build step writes `sriDigest(bytes)` for `ghostpay-embed-v1.js` next to `SHA256SUMS`; `scan-bundle` re-checks with `verifySri`.
13. Playwright (AT-MH-*): recording proxy for referrer/CSP/egress; anvil e2e with FEE-1, ANN-3, TAG-2, AMT-1 toggled.

## packages/core-crypto (E2)

- `checkAnnouncement(announcement, viewingSecret, spendingPublicKey, opts?: {tagMode?: TagMode})`: default `full` unchanged. For `ignore` skip the `derived.tag !== parsed.viewTag` early return; for `mask:k` compare high bits (`viewTagAccepts`). `parseAnnouncement` currently requires metadata[0]; keep that.
- `deriveStealthSecret(..., opts)`: same mode flag at `stealth.ts:~202` (`VIEW_TAG_MISMATCH` otherwise). Address compare remains the real check.
- Do not move derivation code here: `deriveInvoiceKeys` already composes the public API. If core-crypto later wants it, move `derive.ts` as-is.
- MH-ANN-2: scheme-id constants only if the owner wants them; `PublicAnnouncement.schemeId` check (`=== 1n`) must allow configured ids via `resolveSchemePolicy`.

## packages/chain-adapters (E1)

- `metadata.ts:95` `parseMetadata` keeps rejecting length != 57 for router payments. For non-router announcements call `classifyMetadata(length, viaRouter)` first; if `amountStatus === 'unverified'` read the amount from `Transfer` logs (hygiene HY-VER) or a balance read and label it unverified. Wire `viaRouter` from `caller == router` (`adapter.ts:225`, `scanClient.ts:125`).
- `logs.ts:207`: apply SCAN-1/2 as above; filter scheme by `isAcceptedScheme`.
- `wallet`/gas fields (`MH-WAL-1` helper may be shared with `apps/web`).

## packages/invoice-schema (E3)

- `schema.ts:189` `validatePrivatePart` (strict keys): allow an optional `pad` member that is a string of `0` characters only; `stripPrivatePad` semantics (padded and unpadded both parse; non-canonical padding rejected by the existing canonical-equality check `envelope.ts:~290`). Record in DEVIATIONS (schema version note).
- No schema change needed for MH-INV-3 (client-only rounding).

## packages/btc-silent-payments (E4)

- `spend.ts` (~160-280): accept options `{ordering: 'bip69'|'shuffle'|'none', feeRateGrid?, locktimeMode?, rbf?: ..., acknowledgeUnusual?}`. Use `planChange` (change address requirement, no input-address reuse), `normalizeFeeRate`, `chooseLocktime` + `assertLocktimeEffective`, `chooseSequence` + `assertUniformSequences` (spend.ts:279), `orderInputs`/`orderOutputs` (derive silent-payment outputs first, then order, then map by `order`; SP output ordering unverified). Defaults: ordering `bip69`, RBF on, locktime `zero`, fee grid off. Deterministic mode `none` for vectors. Re-run all 28 sending vectors (compare outputs as sets: unverified assumption).
- `MH-BTC-6`: any PSBT export must pass through `stripPsbtFingerprints`. None exists today.
- Replace the string network type with the package's own once available; helpers take plain strings and guard them.

## apps/relayer (E5)

- `chain.ts:97-98` (`MH-WAL-2`): `gasLimit = bucketGasLimit(estimate, {chainId, headroomBps: 2000, bucket})`; config key `gasBucket` (default off); keep `gasPrice` cap semantics.
- Release queue (`lane.ts`, `MH-REL-2`): config `releaseWindowSec` (0 = off); on accept call `planRelease` for pending sweeps; memory only (PO-LOG-2); rejected sweeps return a clear "deadline too close" error. Production RNG: omit the rng argument.
- `server.ts` (`MH-REL-3`): accept optional `pad` through `stripPad` before schema validation; pad responses with `padBody` when `padResponses` is set; `MAX_BODY_BYTES` stays 16 KiB.
- `MH-REL-1` (`chains[].submitRpcUrl`, `fallback: 'fail'|'public'`, validated by `validateRpcUrl`) and `MH-REL-5` (`logging: 'none'`) have no package logic.

## packages/contracts (E8)

- `MH-FEE-2` accrual router: out of scope here; see spec.

## Docs (E7)

- `docs/user/`: copy `MH_CATALOGUE` text for each option; PO-COR-4 wording for MH-ID-1.
- `THIRD_PARTY.md`: no new third-party rows.
