# TM11 / TM13 independent investigation and implementation

Reviewer/implementer: `relayer_chain_privacy`, Caveman investigate-first.
Branch: `chatgpt/ghostpay-tm-hardening-20261118`.
Base: `198aa5baff22272453733a0f3dcfcac0e0994eec` (PR #238).
Compared source: PR #222 `2bc2098298d90928eb1acafad969f28316bb05fc`, main
`dfc75ef2087fa6463ae59e0818abec01796c578d`, and PR #241 ownership.
The TM11/TM13 product sources in #238 match #222; relayer dependency pins differ.

## Disposition matrix

| Requirement | Existing implementation/default | Finding or acceptance | Remaining boundary |
|---|---|---|---|
| TM11 padding | Web client pads by default to 1/2/4 KiB, with one legacy `400 invalid_request` unpadded retry; explicit `pad:false` disables. Server padding is `optional`, with `required` operator option. | Added exact hex-field bounds/type tests and independent whole-body 16 KiB HTTP acceptance/refusal. Confirmed failed randomness silently disabled padding; fixed non-size padding failures to stop before dispatch with a safe error. | Padding hides only some request-length variation. Empty pad and presence alone do not prove useful cover; responses remain unpadded. |
| TM11 ingress | `direct` by default; inferred `trusted-proxy` when `trustedProxies` configured; `onion` requires loopback listener and no trusted proxies. | Explicit `null` ingress or padding silently chose defaults. Two regression failures reproduced; changed enum fallback to absent-only. | Real Tor network not exercised. Loopback parser/HTTP behavior is not Tor routing proof. |
| TM11 zero log | `zeroLog:false`; opt-in suppresses access lines and strips request IDs. Closed application log schema excludes address/amount/signature/transaction-hash values. | Existing tests retain timestamped `sweep_sent`/receipt/operational events. Corrected overstrong no-timing-correlation wording; no change to operational logging semantics. | Proxy/CDN/host/RPC logs and modified operators remain outside application guarantees. Operational timestamps can correlate with chain activity. |
| TM11 quote tuple | Quote and sweep both disclose owner/destination/asset/amount to the chosen relayer. | Existing signed-fee/quote-token reasoning retained. No protocol/custody change. | Quote-less or stateless alternative remains explicitly assessed and not implemented. |
| TM13 Bitcoin | Whole scanned ranges detect spends from verified downloaded blocks; incomplete/light/recovery ranges may still query output status. Explicit sign action rechecks selected outpoints, including mempool state known to the provider. | Confirmed new tracker trusted Esplora `is_coinbase` annotation when gathering outpoints. One failing test with unchanged mined tx/header demonstrated false local unspent. Fixed by gathering outpoints from header-bound raw transaction inputs. | No anonymity or current mempool-state proof from local blocks; sign-time provider sees selected outpoints. |
| TM13 Solana | Scan retrieves announcement/funding transaction data, no balance. Explicit Review reads one address; Sign rechecks balance. | Existing view and chain hardening tests assert scan absence and review/sign behavior. | Selected RPC remains the balance authority; no real Solana node qualification claimed. |
| TM13 TRON | Scan reads block ranges, no per-match balance/memo; explicit Review reads selected balance/memo, chain parameters and destination activation; Sign rechecks. | Five cancellation regressions failed before changes: late network/balance/parameter response continued to disclose more fields after Lock, endpoint editing or unmount. Added flow liveness checks before next stage and helper abort checks before/between balance and memo. | PR #241 owns SDK transport cancellation. No SDK or signing code modified here. Already-sent requests cannot be recalled. No real TRON node qualification claimed. |

## Confirmed findings

1. **TM11 configuration fail-open fallback (low).** `parsePrivacy` used nullish coalescing for
   two enum fields. JSON `null` was treated as an omission; an invalid intended privacy policy
   became the default. Missing values still default; supplied invalid values now fail parsing.
2. **TM13 incorrect local spend status (medium correctness).** `parseInputs` trusts a JSON
   `is_coinbase` annotation, which is not part of serialized transaction bytes. The new spend
   tracker read that annotated structure, so a malicious provider could label a real input coinbase
   and hide the spend from the local decision despite valid txid/Merkle/witness checks. Recording
   outpoints from `tx.raw.inputs` fixes the TM13 decision independently of annotation/tweak parsing.
   Existing sign-time rechecks remain unchanged; no signing/custody code was changed by this fix.
3. **TM11 documentation overclaim.** `zeroLogLogger` retained timestamped operational events
   while its comment claimed no log line could be tied to request timing. Documentation now states
   the actual remaining metadata and infrastructure limits.
4. **TM11 silent padding downgrade (low).** Browser `encodeBody` caught every `padBody` failure
   and returned a plaintext-length body. A failing CSPRNG regression reproduced a successful request
   instead of failure. Only the documented `LIMIT_EXCEEDED` size fallback now continues unpadded;
   other failures stop before dispatch using `error.relayerClient.paddingFailed`. Explicit padding
   opt-out and the bounded legacy-server retry remain unchanged. Root added the localized safe key.
5. **TM13 stale TRON review disclosure (medium privacy).** `doReview` checked liveness only after
   all review requests, while `readSweepDetails` made balance and memo requests sequentially without
   rechecking cancellation. A non-cooperative provider completing an already-authorized request
   caused 1–4 new requests after Lock, endpoint change or unmount. Tests instrument the actual fetch
   path and count dispatches, rather than merely asserting stale results stay out of the UI. Added
   flow checks and helper checks stop later requests without changing transport or signing behavior.

## Executed implementation evidence

Runtime: Node `v24.22.3`, Vitest `5.1.0`; `NODE_OPTIONS=--max-old-space-size=1536`; one worker.
Tests run directly via the repository's installed Vitest/config. No coverage thresholds or test config changed.

| Command (workspace) | Result | Evidence |
|---|---|---|
| `vitest run src/privacy.test.ts --maxWorkers=1` (relayer, test-first) | 2 failed / 12 passed; both failures were expected explicit-null regressions | `relayer-privacy-red.log` |
| `vitest run src/privacy.test.ts src/config.test.ts src/log.test.ts --maxWorkers=1` (relayer, corrected) | 125 passed, 2 actual test files; no standalone `log.test.ts` exists | `relayer-privacy-green.log` |
| `vitest run src/features/btc/scan.localSpends.test.ts --maxWorkers=1` (web, initial attempt) | Startup failure: package dist not built; no test execution | `btc-spends-red.log` |
| `vitest run src/features/btc/scan.localSpends.test.ts src/features/tron/TronView.privacy.test.tsx --maxWorkers=1` (web, test-first) | Bitcoin 1 failed / 8 passed, expected annotation regression. TRON 0 tests: secret-box package dist not yet built. | `chain-privacy-red.log` |
| `vitest run src/features/btc/scan.localSpends.test.ts src/features/btc/esplora.test.ts src/features/btc/scan.resume.test.ts --maxWorkers=1` (web, corrected) | 47 passed, 3 files | `btc-spends-green.log` |
| `vitest run src/features/tron/TronView.privacy.test.tsx --maxWorkers=1` (web, setup attempt) | 0 tests: solana-stealth package dist not yet built | `tron-privacy-red.log` |
| `vitest run src/lib/relayerClient.test.ts --maxWorkers=1` (web, test-first) | 1 expected failing RNG regression / 34 passed | `relayer-client-red.log` |
| Same relayer-client selection, corrected | 35 passed | `relayer-client-green.log` |
| `vitest run src/features/tron/TronView.privacy.test.tsx --maxWorkers=1` (web, dependencies ready/test-first) | 5 expected failures, each showing additional dispatch after cancellation | `tron-privacy-red-executed.log` |
| `vitest run src/features/tron/TronView.privacy.test.tsx src/features/tron/TronView.test.tsx src/features/tron/chain.hardening.test.ts src/features/solana/SolanaView.test.tsx src/features/solana/chain.hardening.test.ts --maxWorkers=1` (web, corrected) | 91 passed, 5 files, exit 0 | `chain-review-green.log` |
| `git diff --check -- <owned paths listed below>` | Passed, exit 0, empty output | Scoped check on final owned source files |

Implementation selections total 298 passing tests across 11 files. These are implementer regression checks, not an independent audit of this worker's changes. Root requested no concurrent typed ESLint/typechecks after an unrelated memory-killed run; those sequential gates, final source commit identity, and full/lean browser/hosted qualification are coordinator-owned. Owned source edits are frozen after these results.

No Solana source change was warranted: the existing SDK checks `signal.aborted` before dispatching the next request, including the review balance read after network verification. The TRON fix is in the application review sequence only; the broader SDK transport lane remains with PR #241.

## Independent cross-review outside implementation ownership

Read the coordinator's TM5 artifact-validator changes while waiting for library builds. A native Node+JSDOM probe
confirmed two malformed-artifact false passes in the regex meta extractor: an earlier unquoted `http-equiv=x`
attribute supersedes a quoted duplicate in the parsed HTML, and invalid head content moves the meta into BODY.
`checkCspDist(..., {metaOnly:true})` returned `[]` in both cases. Sent exact fixtures and parser evidence to root;
no CSP code changed by this worker. This is review of validation behavior, not a finding that the normal generated
Vite index currently lacks enforcement.

After correction, both initial malformed fixtures are rejected; a canonical head policy passes and an early script
is rejected. Further outer-document probes found a fake `<head>` after `<body>` (parsed meta parent BODY) and a
`<head>...<meta>...` string inside a body element attribute (no actual meta) still accepted by the regex. Sent these
two fixtures to root for correction. Root then replaced extraction with inert JSDOM parsing, using the existing development dependency without script/resource execution. No CSP source changes by this reviewer.

Final independent repro: canonical head policy passes; earlier unquoted `http-equiv=x`, invalid head content, body-before-head, markup inside an attribute, noscript, template, and policy after a script or stylesheet all fail qualification. All nine independent assertions pass (`independent-csp-probes.log`). The final CSP node suite passes 30/30 (`independent-csp-final.log`); the earlier 26/26 run is retained as `independent-csp.log` and is not presented as covering the later discovered cases. Inspection also confirmed Pages forwards CSP settings through the clean environment and applies CSP before bundle scanning; nginx generation preserves standard and embedding header boundaries. This is local artifact/HTML-parser validation, not real hosted browser qualification.

Reviewed metadata worker's finalized TM9/TM10/TM12/TM15 runtime deltas independently. `getSessionPublic` provides
a stable object snapshot between installs, so remounting `InvoiceForm` on session object replacement resets
plaintext consent and pending work without resetting ordinary same-session renders. Receipt opt-in resets on
existing complete match/signer identity changes. Padding rejects excessive request cost before window allocation
and stops scheduling/discards late results after cancellation. Generic `fetchPadded` intentionally retains same-block
items; structured range announcements are deduplicated by `normalizeSet`. Independent runtime checks passed:

| Independent command | Result | Evidence |
|---|---|---|
| `vitest run src/padded.test.ts src/range.test.ts --maxWorkers=1` in `packages/scan-source` | 33/33, 2 files, exit 0 | `independent-scan-source.log` |
| `vitest run src/components/ReceiptPanel.test.tsx src/views/CreateInvoice.privacy.test.tsx src/lib/scanPrivacy.bulkEvidence.test.ts --maxWorkers=1` in `apps/web` | 18/18, 3 files, exit 0 | `independent-metadata-web.log` |
| `node --test scripts/tests/privacy-csp.test.mjs` | 30/30, exit 0 | `independent-csp-final.log` |
| Native Node + inert JSDOM nine-case artifact probe | 9/9 assertions, exit 0 | `independent-csp-probes.log` |

No unresolved confirmed blocker remains from this worker's independent CSP/metadata review at the source snapshot below. That disposition is separate from this worker's own TM11/TM13 implementation tests.


## Frozen source snapshot

Recorded 2026-11-19T06:16:58+00:00. SHA-256 hashes identify the working files reviewed/tested before the coordinator creates the integration commit. Catalog additions belong to root and are not counted as this worker's edits.

### Owned implementation files

| Path | SHA-256 |
|---|---|
| `apps/relayer/PRIVACY.md` | `f751734aeac95ae5805bbcfcb6ad9773ceb7bd140f16bc5af757adae8a760b1a` |
| `apps/relayer/src/config.ts` | `46df931f74c3a7b46101ecf87a84685bcd68434c2c3ee40328675d2aea0f515f` |
| `apps/relayer/src/log.ts` | `dc6739914d3dfde78086df884aee75e0bf58c8f524d2b3800d9aee34c52dbebf` |
| `apps/relayer/src/privacy.test.ts` | `7f8785aaaa11413917c858cbebec2b91384ee43b5eb5003bb5ee199d51c385bb` |
| `apps/web/src/lib/relayerClient.ts` | `af395d462223fd464c958d40f941092fe4559e5f82bc8dbc8fd96044b3156bbf` |
| `apps/web/src/lib/relayerClient.test.ts` | `b6c4ccd85e42c20eea9276fb38678f440c5393818727cb1e7eb3a756831bec76` |
| `apps/web/src/features/btc/esplora.ts` | `63081d73dce8f07706a1c089b75cca1cf486eda2229ec5401382070e235bba6c` |
| `apps/web/src/features/btc/scan.localSpends.test.ts` | `0e699df1b349d79f3e9516c1dfa09ac9ef8655d012315ba09a584d5a42d13e02` |
| `apps/web/src/features/tron/TronView.tsx` | `5da02f944a4230312672be591c4f15e7f0f8dca4565aaf62e42239ca943e67d9` |
| `apps/web/src/features/tron/sweep.ts` | `ed5f2520a702f9d20fd507d53967f1728f5a2d1dd48fbc539de27a32beeb4493` |
| `apps/web/src/features/tron/TronView.privacy.test.tsx` | `bd7fd7b855486168becb3c7a4e58a84d5f82347f8561a7be50324bd59e5fdf0f` |

### Independently reviewed peer files

| Path | SHA-256 |
|---|---|
| `apps/web/scripts/apply-csp.mjs` | `ff683d0f4fa1786bfe504765f3e34f19573d041868e8c5a178e7286ea9f17118` |
| `apps/web/scripts/csp.mjs` | `c4ceb6648fe16697e0a53aa5b688dda8b28c5dd79be9ca0215c283b5fc7d4e3f` |
| `scripts/tests/privacy-csp.test.mjs` | `cc817193fa9da6e7ee5c6daa79a10c6ad3bd4321f1b1ea177173e123555195a4` |
| `scripts/pages/build-pages.sh` | `394405785542ddac814e5b81e236bfc7318c1ebdad8514480c869d98aa6f94e2` |
| `deploy/nginx/render-security-headers.mjs` | `eee9fda35bd6f094a647e9c60709beef353a46e8b1ee16d52cd8a4abf85b3561` |
| `apps/web/src/components/ReceiptPanel.tsx` | `671b3238e12dbb7a777f67707f1ce5e7eecf889117fa65078a8a237746390da7` |
| `apps/web/src/views/CreateInvoice.tsx` | `55b04e6d64e31ef38e79783242ccf596356a10d2e2245b22b7a45cb6c006f2e8` |
| `apps/web/src/views/CreateInvoice.privacy.test.tsx` | `02f74659c22ba98a440b4ab77ecce88129b31d8b38f202714413de822d127408` |
| `apps/web/src/lib/scanPrivacy.ts` | `f4148dcd7100c23dccb883f40811242e6d0b74a2ae2902ebcd45e30789ca86c4` |
| `packages/scan-source/src/padded.ts` | `75c045532aa90c83b459bd945f57cbb1f05c471cfbd3deba2cf06b6d16b7eec1` |
| `packages/scan-source/src/range.ts` | `bf46dc83f543894274e5d1120a1c7fe3631b28a09630ce089f3d706c81fc2f1c` |

## Scope and qualification limits

- No commit, push, merge, deploy or external message by this worker. No transport, contract, custody/key-generation, signer, checkpoint or locale source edits.
- Local fixtures/HTTP servers exercise the application request boundary. No real Tor service, live Bitcoin/Solana/TRON node, hosted proxy or production traffic measurement.
- Padding and bulk selection reduce particular observable fields; they are not anonymity claims. Relayer operational timestamps and all proxy/hosting/provider logging boundaries remain explicit.
- Cancellation stops subsequent requests and rejects late results. It does not recall an already-dispatched request; transport timeout/isolation changes remain with PR #241.
- Bitcoin spend status is based on the verified scanned range, with existing sign-time selected-outpoint rechecks; it does not independently establish current provider mempool state.
