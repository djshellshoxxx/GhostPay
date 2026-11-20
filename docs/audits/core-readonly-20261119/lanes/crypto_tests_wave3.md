> Historical lane record. The final [catalogue](../FINDINGS.md), [branch matrix](../branch-applicability.md), [quality review](../findings-quality-review.md) and [unified coverage](../coverage.json) supersede earlier provisional status, pending queues and branch-wide wording below. UTC worker dates may fall on November 20; the user-facing audit date is November 19, 2026 (America/Los_Angeles).

# GhostPay crypto/tests/supporting-tooling audit — wave 3

## Completion

**The original assigned remainder is closed: 103 of 103 path/blob versions reviewed, covering 14,226 version-lines.** The review used complete source for 95 versions and complete diffs from fully read bases for eight versions. No assigned source, test or configuration version remains pending. All original 20-head memberships, blob line counts and diff-base references were reconciled against immutable Git objects; the ledger has no duplicate path/blob rows or reconciliation errors.

This is a read-only static continuation of `crypto_protocol_review.json` and `contracts_policy_wave2.json`. It adds two Low findings in local testnet deployment tooling and one Informational QR-test assurance observation. It does not establish a new active Pages payment or signature vulnerability. Existing crypto/contracts findings and exposure limitations remain applicable.

| Assigned class | Reviewed versions | Version-lines | Pending |
|---|---:|---:|---:|
| Crypto configuration/schema/build support | 43 | 1,258 | 0 |
| Crypto and remaining contract tests/helpers | 45 | 10,844 | 0 |
| Supporting contract/deployment tooling and tests | 15 | 2,124 | 0 |
| **Total** | **103** | **14,226** | **0** |

No target tests, analyzers, compilers, fuzz campaigns, vulnerability reproductions, native nodes, RPC calls, deployments, transactions or publication steps were run. No repository source, test or configuration files were edited. Version-line counts describe represented versions, not the number of distinct lines printed or executed.

## Reconciliation and scope

The continuation subtracted completed production and policy/configuration reads from the predecessor ledgers and from the root/tooling lanes. The remaining assignment consists of the exact three contract test blobs, 42 crypto test versions, 43 configuration versions and 15 supporting-tooling versions. All 14 mock/Echidna files whose earlier provisional exclusions were rescinded were already read by the contracts predecessor; they are not excluded again here.

Root later added four selected heads and explicitly retained global 24-head membership reconciliation. This report deliberately preserves its original 20-head, 103-version assignment. The additional heads do not change this worker’s completion claim. Root also owns the top-level scheme1/tag/policy/stealth-export fixture and generator reconciliation.

Paused other-chain execution, PIR/confidential services, external live services and vendored implementation audits remain outside the current first-party Pages EVM scope. Co-resident other-chain URI fixtures were read only as structural test cases. Sixteen README/DEVIATIONS versions discovered while reconciling these package roots are documented below as unassigned documentation; they are not credited as source review or hidden inside the completed count.

## New findings

### CT3-01 — Development-key refusal depends on raw key spelling

**Severity:** Low. **Classification:** deployment-tooling / local configuration. **Confidence:** High for source-level mismatch; no deployed impact established.

The testnet deployment driver accepts more than one textual representation of a 32-byte signing key, but its explicit refusal of the known public development key compares the input with one raw string. The spelling check does not establish that the effective signing key is different. The keystore branch also does not inspect signer identity. The documented rejection is therefore narrower than the accepted signer representations.

**Conditions and impact.** An operator explicitly enables a supported public-testnet broadcast and supplies the public development signer in an accepted representation or via a keystore. A mistakenly funded publicly known signer would remain publicly controllable. This helper accepts only the listed testnets; this review does not establish a mainnet deployment path or an active Pages wallet/payment vulnerability.

**Remediation.** Apply the development-signer restriction to the effective signer identity for both raw-key and keystore paths. Normalize and validate key bytes before equality decisions, and check the derived public address before signing. Preserve explicit broadcast confirmation.

**Safe acceptance criteria.** Source review shows that all accepted raw-key representations and all signer-selection paths reach the same identity check before a broadcast operation. Future isolated fixture tests can assert identity equivalence without loading a funded account, connecting to RPC or sending transactions.

**Source evidence:**

- `scripts/testnet/deploy.sh`, blob `74ff0683949f4d7cad791a8ea76abff57989b810`, commit `e22c1748a3de6eb02f5be3abe27d634b238c67c6`, lines 89-100.
- `scripts/testnet/deploy.sh`, blob `74ff0683949f4d7cad791a8ea76abff57989b810`, commit `e22c1748a3de6eb02f5be3abe27d634b238c67c6`, lines 31-40 — Supported network restriction limits assessed exposure to testnet deployment tooling.

The same referenced source version is present on all original 20 selected heads. No runtime reproduction was performed.

### CT3-02 — Rehearsal cleanup can remove earlier deployment records

**Severity:** Low. **Classification:** deployment-tooling / local artifact retention. **Confidence:** High for source-level file selection; no actual historical record loss established.

Before a local rehearsal, the driver refuses only when run-latest.json already exists. Its EXIT cleanup removes every regular file at the top level of the selected chain broadcast directory. Pre-existing timestamped or otherwise retained deployment records can exist without run-latest.json and are consequently within the cleanup selection even though the rehearsal did not create them. Cleanup also runs after a failed rehearsal.

**Conditions and impact.** The operator invokes rehearsal while the chain-specific broadcast directory contains earlier regular files and no run-latest.json. This can remove local deployment provenance and recovery information. It does not delete blockchain state or directly move user funds.

**Remediation.** Give rehearsal an isolated temporary broadcast and cache destination, then remove only that owned directory. If tool constraints require a shared destination, record its initial contents and remove only files created by the current operation; never sweep all pre-existing top-level records.

**Safe acceptance criteria.** A static ownership check shows cleanup confined to a newly allocated rehearsal directory. An isolated temporary-file fixture may confirm that a pre-existing sentinel record remains byte-for-byte unchanged after both success and failure cleanup, without running a node, deploying a contract or using a real broadcast directory.

**Source evidence:**

- `scripts/testnet/deploy.sh`, blob `74ff0683949f4d7cad791a8ea76abff57989b810`, commit `e22c1748a3de6eb02f5be3abe27d634b238c67c6`, lines 45-56.
- `scripts/testnet/deploy.sh`, blob `74ff0683949f4d7cad791a8ea76abff57989b810`, commit `e22c1748a3de6eb02f5be3abe27d634b238c67c6`, lines 64-70 — Rehearsal reuses the normal broadcast location before cleanup.

The same referenced source version is present on all original 20 selected heads. No runtime reproduction was performed.

### CT3-O01 — QR mutation property does not enforce its stated successful-parse condition

**Severity:** Informational. **Classification:** verification-assurance. **Confidence:** High in static test logic; no runtime validation performed.

The multipart test names its property as rejection of a changed chunk or preservation of the same session. Its successful branch calls parseChunk but discards the return value and performs no session or protected-field assertion. Only thrown errors are checked. A future parser regression that accepts changed protected data could therefore pass this particular property. Separate deterministic CRC, conflict, size and final-integrity tests are present, so this does not establish that current production parsing accepts such data.

**Conditions and impact.** A future parser regression succeeds on a mutated input and the project relies on this property to verify the named successful-parse constraint. This affects verification assurance rather than an established current payment or signature bypass.

**Remediation.** Assert the intended invariant on every successful parse and keep the typed-error assertion on rejected input. Name the test according to the exact property it checks.

**Safe acceptance criteria.** A code review can trace every successful and failed branch to an explicit assertion of the named property; ordinary isolated unit assertions confirm a successful parse cannot skip the invariant check. No live target, oversized artifact or exploit recipe is needed.

**Source evidence:**

- `packages/qr-exchange/src/multipart.test.ts`, blob `d8440e0d772d7ecbe5e4fba62d908f437bc3a64d`, commit `e22c1748a3de6eb02f5be3abe27d634b238c67c6`, lines 209-220.
- `packages/qr-exchange/src/multipart.test.ts`, blob `d8440e0d772d7ecbe5e4fba62d908f437bc3a64d`, commit `e22c1748a3de6eb02f5be3abe27d634b238c67c6`, lines 128-170,179-199 — Existing separate rejection/integrity assertions limit the finding.

The same referenced source version is present on all original 20 selected heads. No runtime reproduction was performed.

## Completed test review and practical limits

The three remaining Solidity tests total 2,935 lines. They encode policy-router binding and rollback expectations, deadline distinctions, native/token/permit/buffer behavior, and factory fee semantics. Historical analyzer constants and test-clock rewinds are source fixtures; they were not independently reproduced. The factory disposition tests at lines 986–1038 of blob `be677e1b934bfb4275abf66771d98c75e45516c5` corroborate the predecessor’s `CW2-K04` fee-waiver assumption under a costly fee token. That remains conditional policy-factory economics, not a newly established current Pages issue.

Core crypto tests include independent big-integer curve arithmetic, differential/vector fixtures, metadata checks, secret handling and viewing-key boundaries. Some comparison paths share primitives; no independent verification run is claimed. Deterministic RNG and arithmetic helpers are test material, and package build configuration excludes the relevant test/test-helper files from emitted runtime code. The built-in hexadecimal compatibility test skips its emulation case when a true native implementation already exists; it cannot stand in for native-browser qualification.

Invoice and URI tests cover canonicalization, signatures, malformed fields, envelope formats, passphrase/KDF behavior, clock/expiry boundaries and encoded text hygiene. Reading these tests does not repair the predecessor’s exceptional-exit secret-buffer cleanup finding or expand signer trust guarantees. QR tests include explicit CRC/conflict/size/final-integrity assertions, which limit `CT3-O01`; the omitted assertion in the success branch of one property remains an assurance gap.

SDK tests cover builders, event/schema shape and a synthetic React runtime. Their handcrafted JSON-schema subset and fake hook runtime do not establish full JSON Schema conformance or actual framework/browser execution. Transaction-review fixtures cover router, permit, sweep, binding and mutation expectations; unsupported buffer payment is explicitly recognized. The predecessor’s standalone permit-domain caller boundary and the active Pages domain guard remain distinct.

Analyzer-support tests use synthetic executable output and pinned-interface module stubs. The latest versions add duplicate-key rejection, per-target artifact preservation/refusal, hidden timeout/exception telemetry and fresh-evidence handling absent from main; this corroborates `CW2-H05`. These source assertions are not native analyzer results or evidence that a symbolic campaign completed. The optional disposition checker is expressly unwired and itself disclaims target-coverage and provenance certification.

The manifest builder creates an unsigned draft from local broadcast/build metadata and RPC reads, then validates shape and adapter acceptance. Neither that source nor its schema-focused tests establishes a live deployment, verified source provenance or owner approval. The source-verification driver validates manifest fields before constructing command argument arrays and requires explicit execution confirmation; no verification was submitted here.

## Preserved prior conclusions

- Retain `CP-01` exceptional-exit temporary-secret cleanup and `CP-02` unsupported-image native decode resource-bound observations. New tests do not remediate either.
- Retain `CP-H01` through `CP-H04` main/latest distinctions and `CP-O01` through `CP-O03` SDK/permit caller boundaries. Do not present fixed latest behavior as an integration regression.
- Retain `CW2-01` invariant-handler assurance gap and the `CW2-K01` through `CW2-K06` token, fee, policy-correlation, asset-eligibility, recipient and sponsor assumptions.
- Retain `CW2-D01` economic semantics, `CW2-D02` announcement-versus-payment distinction and `CW2-H01` through `CW2-H05` historical fixes.
- The receipt-date candidate and browser/runtime qualification are owned by the root/payment/browser lanes; this continuation makes no new resolution claim for them.

## Coverage notation and selected heads

Every row in the JSON ledger carries its full path, full blob ID, all original carrying head SHAs and branch names, physical line count, review method, ranges or full-diff base, and notes. The following compact tables preserve the same exact mapping. `Full` means a complete immutable source read. `Diff` means the complete blob-to-blob diff was read after the named base had been fully read.

### H9 — 9 carrying selected heads

| Branch | Commit |
|---|---|
| `main` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` |
| `automation/20261120T0434Z/bug/erc20-simulation-result` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` |
| `automation/20261120T0243Z/worker/format-units-validation` | `7523da612ba365451f1d5c2dbc01d0bdeedbe8c7` |
| `automation/20261119T2243Z/bug/base64url-runtime-input` | `856b2d60fd38eabb8a1c856c95ad82f1c7d30c64` |
| `automation/20261119T204728Z/bug/qr-kind-failclosed` | `89942105c48df03b9351f777278b6a992e35a95e` |
| `automation/20261119T183817Z/bug/merchant-pin-duplicate-json` | `9fbf3312cb8e65083f604cc0bf0512d59c83f141` |
| `automation/20261119T1640Z/bug/scan-privacy-partial-30d` | `0041514a630398c89693498d9b5e44ef562d9c61` |
| `automation/20261119-c977/bug/build-profile-failclosed` | `25c380f253e3338c0e6b79e8d052cdf8950f9e88` |
| `automation/20261119T124337Z/bug/qr-utf8-surrogate-guard` | `b5fc0991eb7cc12fcdfaea514f1fee5be1eca2a0` |

### H11 — 11 carrying selected heads

| Branch | Commit |
|---|---|
| `release/ghostpay-beta-qualification-20261119` | `417f7c71daf8645e1432f2ec8f070110879b80bd` |
| `integration/ghostpay-completion-20261120` | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` |
| `snapshot/ghostpay-privacy-8be15289-20261120` | `d6819796a9542acc488b896786faffe83b913d9b` |
| `feat/ghostpay-privacy-quick-hide-20261120` | `137628961463fc5abd8b7927b2efe6b18a0a206a` |
| `fix/ghostpay-format-validation-20261120` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` |
| `fix/ghostpay-pages-integrity-gate-20261120` | `936d054ed067d89c773310d42e33939c1129bbfa` |
| `automation/20261120T004531Z/feature/clipboard-guard` | `6c648770f5647ca7993cc108ef9e5ede9b46b4c9` |
| `automation/20261120T0115Z/coordinator/clipboard-qualification` | `04910f65dc0268e41519c4b1a44e83264272f0bf` |
| `automation/20261120T0115Z/worker/receipt-hash-validation` | `acbf39ee21ad35e9d14df958fa16fbcc2e230cae` |
| `automation/20261120T003500Z/coordinator/qr-runtime-qualification` | `ec546311f994fe1db544fe85ff2aa6db428d67d4` |
| `fix/ghostpay-qr-conflict-expiry-20261119-c374725a11b7` | `172695efb41665a4e50d335029e54184bbb5b328` |

### H20 — 20 carrying selected heads

| Branch | Commit |
|---|---|
| `main` | `c977b5d6723f6822c3b5d86cd6b231712c53c395` |
| `release/ghostpay-beta-qualification-20261119` | `417f7c71daf8645e1432f2ec8f070110879b80bd` |
| `integration/ghostpay-completion-20261120` | `e22c1748a3de6eb02f5be3abe27d634b238c67c6` |
| `snapshot/ghostpay-privacy-8be15289-20261120` | `d6819796a9542acc488b896786faffe83b913d9b` |
| `feat/ghostpay-privacy-quick-hide-20261120` | `137628961463fc5abd8b7927b2efe6b18a0a206a` |
| `fix/ghostpay-format-validation-20261120` | `a9e0715573f7247d7a16f9d1d030cf0232708fb2` |
| `fix/ghostpay-pages-integrity-gate-20261120` | `936d054ed067d89c773310d42e33939c1129bbfa` |
| `automation/20261120T0434Z/bug/erc20-simulation-result` | `87cf6c603338ad64ec02300fe42b96c3e0a205b9` |
| `automation/20261120T004531Z/feature/clipboard-guard` | `6c648770f5647ca7993cc108ef9e5ede9b46b4c9` |
| `automation/20261120T0115Z/coordinator/clipboard-qualification` | `04910f65dc0268e41519c4b1a44e83264272f0bf` |
| `automation/20261120T0115Z/worker/receipt-hash-validation` | `acbf39ee21ad35e9d14df958fa16fbcc2e230cae` |
| `automation/20261120T0243Z/worker/format-units-validation` | `7523da612ba365451f1d5c2dbc01d0bdeedbe8c7` |
| `automation/20261120T003500Z/coordinator/qr-runtime-qualification` | `ec546311f994fe1db544fe85ff2aa6db428d67d4` |
| `fix/ghostpay-qr-conflict-expiry-20261119-c374725a11b7` | `172695efb41665a4e50d335029e54184bbb5b328` |
| `automation/20261119T2243Z/bug/base64url-runtime-input` | `856b2d60fd38eabb8a1c856c95ad82f1c7d30c64` |
| `automation/20261119T204728Z/bug/qr-kind-failclosed` | `89942105c48df03b9351f777278b6a992e35a95e` |
| `automation/20261119T183817Z/bug/merchant-pin-duplicate-json` | `9fbf3312cb8e65083f604cc0bf0512d59c83f141` |
| `automation/20261119T1640Z/bug/scan-privacy-partial-30d` | `0041514a630398c89693498d9b5e44ef562d9c61` |
| `automation/20261119-c977/bug/build-profile-failclosed` | `25c380f253e3338c0e6b79e8d052cdf8950f9e88` |
| `automation/20261119T124337Z/bug/qr-utf8-surrogate-guard` | `b5fc0991eb7cc12fcdfaea514f1fee5be1eca2a0` |

## Exact reviewed versions

| # | Path | Full Git blob | Lines | Method | Heads |
|---:|---|---|---:|---|---|
| 1 | `packages/address-safety/package.json` | `557fa3b6c68f88a55b98498beea459efba3b2cfc` | 41 | Full | H9 |
| 2 | `packages/address-safety/package.json` | `9afe3b2f34d858e3d729202acd01d9c0ade0020d` | 41 | Full | H11 |
| 3 | `packages/address-safety/src/meta.test.ts` | `2000eb2f753610d02ef0b63b589b7fa3128b8233` | 40 | Full | H20 |
| 4 | `packages/address-safety/src/token.test.ts` | `eb5e7d3884629bbc8937b8f912561b412eec6abf` | 35 | Full | H20 |
| 5 | `packages/address-safety/tsconfig.build.json` | `e2f2e9c3808a4726ccb530e67be1d21e888a2439` | 13 | Full | H20 |
| 6 | `packages/address-safety/tsconfig.json` | `b993144d440999a587dd0c2a9bbb35510742dcc3` | 9 | Full | H20 |
| 7 | `packages/address-safety/vitest.config.ts` | `ac90ebb9aa970c47023ed171620470dc14ac157f` | 17 | Full | H20 |
| 8 | `packages/contracts/test/GhostPayPolicyRouter.t.sol` | `0e9db93e7a67f65003e32f05ca83272e94980003` | 1186 | Full | H20 |
| 9 | `packages/contracts/test/MythrilExpiryDispositions.t.sol` | `b1ab1a4823f7c562f6d07e9b51bbfbeb4ca3dbb8` | 594 | Full | H20 |
| 10 | `packages/contracts/test/MythrilFactoryDispositions.t.sol` | `be677e1b934bfb4275abf66771d98c75e45516c5` | 1155 | Full | H20 |
| 11 | `packages/core-crypto/package.json` | `ae70be26ffc5070a506c03de7a3c5ec431780a31` | 41 | Full | H11 |
| 12 | `packages/core-crypto/package.json` | `c831d1f76ea28a9b763678c520ab38681d4e0230` | 41 | Full | H9 |
| 13 | `packages/core-crypto/src/differential.test.ts` | `4e2ea47aa6560ccf9af09ba977672a6abb964cb8` | 114 | Full | H20 |
| 14 | `packages/core-crypto/src/independent.test.ts` | `f28bb8ea3ae526c0dfb11e634ee0f5a0325a3e1c` | 300 | Full | H20 |
| 15 | `packages/core-crypto/src/metadata.test.ts` | `e31f5ed0716383b8150937f288f152fa0cbbfa02` | 91 | Full | H20 |
| 16 | `packages/core-crypto/src/properties.test.ts` | `a8b4962131f617abf155620fd2dc43c1d1e12357` | 95 | Full | H20 |
| 17 | `packages/core-crypto/src/rng.testutil.ts` | `52e49b1bdc05b95f8d2705460b5e81ee12503fb9` | 52 | Full | H20 |
| 18 | `packages/core-crypto/src/secp256k1-ref.testutil.ts` | `92a81444a4e59f2e47f384a7b99b7b97d9733caa` | 183 | Full | H20 |
| 19 | `packages/core-crypto/src/secret.builtinHex.test.ts` | `db613b56368e44ef0bbd38116342649ba4daf705` | 48 | Full | H20 |
| 20 | `packages/core-crypto/src/vectors.test.ts` | `604fe971bb4a75125987546f3606cc3e954be74b` | 92 | Full | H20 |
| 21 | `packages/core-crypto/src/viewing-key-boundary.test.ts` | `19768d02370fefc94580f48d23222b04437dde2e` | 44 | Full | H11 |
| 22 | `packages/core-crypto/tsconfig.build.json` | `7cd92421109e2b1988a7e547ec0860610aa5460a` | 13 | Full | H20 |
| 23 | `packages/core-crypto/tsconfig.json` | `b993144d440999a587dd0c2a9bbb35510742dcc3` | 9 | Full | H20 |
| 24 | `packages/core-crypto/vitest.config.ts` | `884e24e82a388f35fbed85f2c2f1a243871b19aa` | 18 | Full | H20 |
| 25 | `packages/invoice-schema/package.json` | `1e0f718b46bd4e19c462513dab698d0d7cd9ef9f` | 40 | Full | H9 |
| 26 | `packages/invoice-schema/package.json` | `92bceed2e93389bf7d0033909d6c9d1773d52ff4` | 40 | Full | H11 |
| 27 | `packages/invoice-schema/src/envelope.test.ts` | `486d42b861ce54371239c82e90bae2a94603029a` | 590 | Full | H11 |
| 28 | `packages/invoice-schema/src/envelope.test.ts` | `bda520017c37abd60f0a2ae208c28b7a69c2d247` | 591 | Diff | H9 |
| 29 | `packages/invoice-schema/src/expiry.test.ts` | `7a3df5c7d69af8b1355640617183a90ca89d7944` | 58 | Full | H20 |
| 30 | `packages/invoice-schema/src/fixtures.testutil.ts` | `a215a584087964d89ea808b2b4c269af3c169d52` | 74 | Full | H20 |
| 31 | `packages/invoice-schema/src/fuzz.test.ts` | `28bd253567a179561c015d5bf2ebc87d094ae73e` | 150 | Full | H20 |
| 32 | `packages/invoice-schema/src/independent.test.ts` | `43b0d7eae975efb8125205adf1d53e99b69ec4e0` | 269 | Diff | H9 |
| 33 | `packages/invoice-schema/src/independent.test.ts` | `76f4b7d70345229a023cd64852afcaeee082d417` | 270 | Full | H11 |
| 34 | `packages/invoice-schema/src/passphrase.test.ts` | `7c9183038e3d1454d418419da7dcf1bee3a91d32` | 546 | Full | H11 |
| 35 | `packages/invoice-schema/src/passphrase.test.ts` | `a80ea26fc2b72a219270418ac2120d3d1f703ef5` | 546 | Diff | H9 |
| 36 | `packages/invoice-schema/src/schema.test.ts` | `d48560381e74c3649419ac08e3fb4ba5eed03986` | 671 | Full | H20 |
| 37 | `packages/invoice-schema/src/secp256k1-ref.testutil.ts` | `54438d7f8e9cc76b4b4814662c0005375dbd24c9` | 183 | Diff | H20 |
| 38 | `packages/invoice-schema/src/sign.test.ts` | `d477fdb5d25c899e47f16a83c9b15d3d89bbe7f9` | 245 | Full | H20 |
| 39 | `packages/invoice-schema/src/text-hygiene.test.ts` | `4a641ad3ff77a16946d33ad6a367ff4e948d5ec5` | 106 | Diff | H9 |
| 40 | `packages/invoice-schema/src/text-hygiene.test.ts` | `f8664bcada335244c7cc0a1690e50b07552d169a` | 106 | Full | H11 |
| 41 | `packages/invoice-schema/tsconfig.build.json` | `7cd92421109e2b1988a7e547ec0860610aa5460a` | 13 | Full | H20 |
| 42 | `packages/invoice-schema/tsconfig.json` | `b993144d440999a587dd0c2a9bbb35510742dcc3` | 9 | Full | H20 |
| 43 | `packages/invoice-schema/vitest.config.ts` | `ac90ebb9aa970c47023ed171620470dc14ac157f` | 17 | Full | H20 |
| 44 | `packages/payment-uri/package.json` | `a95cd9456c490861b3fbdd5284d8616e707ebf23` | 41 | Full | H11 |
| 45 | `packages/payment-uri/package.json` | `e9272242c263457613790acb2184d021bc9119af` | 41 | Full | H9 |
| 46 | `packages/payment-uri/src/fixtures.testutil.ts` | `2f32db0a96f8f8eac148702f18cc957c4325e1a5` | 35 | Full | H20 |
| 47 | `packages/payment-uri/src/fuzz.test.ts` | `13d1b88f54bfe8cb705bec408c83be2c9359c3fb` | 204 | Full | H11 |
| 48 | `packages/payment-uri/src/fuzz.test.ts` | `29a9b31bc47565775ed6efba4a6c4d1f5ce4b391` | 204 | Diff | H9 |
| 49 | `packages/payment-uri/src/vectors.test.ts` | `7379fe386c2bcce7b439b7fa53ea990877ff77e4` | 289 | Full | H20 |
| 50 | `packages/payment-uri/tsconfig.build.json` | `e2f2e9c3808a4726ccb530e67be1d21e888a2439` | 13 | Full | H20 |
| 51 | `packages/payment-uri/tsconfig.json` | `b993144d440999a587dd0c2a9bbb35510742dcc3` | 9 | Full | H20 |
| 52 | `packages/payment-uri/vitest.config.ts` | `ac90ebb9aa970c47023ed171620470dc14ac157f` | 17 | Full | H20 |
| 53 | `packages/qr-exchange/package.json` | `a645d35153b1c4edcf73c2c36af4726064c4f4f8` | 44 | Full | H11 |
| 54 | `packages/qr-exchange/package.json` | `ea086acb640461169a1a76518634e602d42a3f91` | 44 | Full | H9 |
| 55 | `packages/qr-exchange/src/camera.test.ts` | `24d4d6f093ab026e8e14e27c1f3d41188974fc05` | 348 | Full | H20 |
| 56 | `packages/qr-exchange/src/multipart.test.ts` | `d8440e0d772d7ecbe5e4fba62d908f437bc3a64d` | 230 | Full | H20 |
| 57 | `packages/qr-exchange/src/seller.test.ts` | `cf4c91a51f60374cf999cbcbe5564037c949bdd6` | 73 | Full | H20 |
| 58 | `packages/qr-exchange/src/settings-exchange.test.ts` | `7d47fae09c6590ab4d23591e6646b074d49b0b59` | 251 | Full | H20 |
| 59 | `packages/qr-exchange/tsconfig.build.json` | `5dca0935a5d79ecb3dc2253d91b5dfbd1fcfdba9` | 19 | Full | H20 |
| 60 | `packages/qr-exchange/tsconfig.json` | `c3f9705bcd8388fc749658c21036b73ec4d6c871` | 21 | Full | H20 |
| 61 | `packages/qr-exchange/vitest.config.ts` | `74d390972037781cc65c7aeff586e5913637fa6c` | 22 | Full | H20 |
| 62 | `packages/sdk/package.json` | `c9900da2f06f2ec5673549c8307e3782308d2701` | 44 | Full | H9 |
| 63 | `packages/sdk/package.json` | `dff2f0338d0de88b5815d28ab942b451c3fa1625` | 44 | Full | H11 |
| 64 | `packages/sdk/schema/invoice.v1.schema.json` | `f48a2861004a0478abdd117579a030ce88dfa1d5` | 200 | Full | H20 |
| 65 | `packages/sdk/schema/webhook-event.v1.schema.json` | `fb6f45a4ab86fc883314a9eaaed56538957fac45` | 61 | Full | H20 |
| 66 | `packages/sdk/scripts/emit-schema.mjs` | `748eebffa91576a47bd51800b6046256304d532d` | 7 | Full | H20 |
| 67 | `packages/sdk/src/builder.test.ts` | `d5cf64afa78ed65d404ea30fb60eeae2149522aa` | 69 | Full | H20 |
| 68 | `packages/sdk/src/errors.test.ts` | `7bfbeeae4490f6cf5f60d90006ba11369dbe9aab` | 21 | Full | H20 |
| 69 | `packages/sdk/src/events.test.ts` | `f9351b766960742875d554ffe763832bcd30b8c9` | 35 | Full | H20 |
| 70 | `packages/sdk/src/fixtures.testutil.ts` | `5bcd39b188a3cc2c493693c8853f4e6785843dad` | 44 | Full | H20 |
| 71 | `packages/sdk/src/react.test.ts` | `ee037d6588b5912a88382f4974fe83c6e634b181` | 108 | Full | H20 |
| 72 | `packages/sdk/src/schemas.test.ts` | `97659d8c45606185e8bb37f588c38a863de83432` | 157 | Full | H20 |
| 73 | `packages/sdk/tsconfig.build.json` | `7cd92421109e2b1988a7e547ec0860610aa5460a` | 13 | Full | H20 |
| 74 | `packages/sdk/tsconfig.json` | `b993144d440999a587dd0c2a9bbb35510742dcc3` | 9 | Full | H20 |
| 75 | `packages/sdk/vitest.config.ts` | `ac90ebb9aa970c47023ed171620470dc14ac157f` | 17 | Full | H20 |
| 76 | `packages/secret-box/package.json` | `1bd9cd1c65964154e843813d46403dc0857f261b` | 35 | Full | H11 |
| 77 | `packages/secret-box/package.json` | `9d6eeeec310473bf5b3cabb63a770db4d3a38d34` | 35 | Full | H9 |
| 78 | `packages/secret-box/tsconfig.build.json` | `7cd92421109e2b1988a7e547ec0860610aa5460a` | 13 | Full | H20 |
| 79 | `packages/secret-box/tsconfig.json` | `b993144d440999a587dd0c2a9bbb35510742dcc3` | 9 | Full | H20 |
| 80 | `packages/secret-box/vitest.config.ts` | `ac90ebb9aa970c47023ed171620470dc14ac157f` | 17 | Full | H20 |
| 81 | `packages/tx-review/package.json` | `334b19f524bc2dcedac54dddab65d40ad8daf5a1` | 41 | Full | H9 |
| 82 | `packages/tx-review/package.json` | `4c47ba679e6b87dd362cb48e545cbf1ad4f57ef8` | 41 | Full | H11 |
| 83 | `packages/tx-review/src/build.testutil.ts` | `b72e397a87484dcdc316d6b4574543ba873a89a5` | 185 | Full | H20 |
| 84 | `packages/tx-review/src/golden.test.ts` | `f21211630c9f55cbecf80402e4b91f9be7a6df6f` | 85 | Full | H20 |
| 85 | `packages/tx-review/src/property.test.ts` | `ab324d4e38f3b08b2b18abb837cb25414424b3a9` | 72 | Full | H20 |
| 86 | `packages/tx-review/tsconfig.build.json` | `e2f2e9c3808a4726ccb530e67be1d21e888a2439` | 13 | Full | H20 |
| 87 | `packages/tx-review/tsconfig.json` | `b993144d440999a587dd0c2a9bbb35510742dcc3` | 9 | Full | H20 |
| 88 | `packages/tx-review/vitest.config.ts` | `ac90ebb9aa970c47023ed171620470dc14ac157f` | 17 | Full | H20 |
| 89 | `scripts/contract-analysis/mythril-disposition-check.mjs` | `c18bd4337dd18f197fe7d3e287b37691f9fea240` | 281 | Full | H11 |
| 90 | `scripts/testnet/deploy.sh` | `74ff0683949f4d7cad791a8ea76abff57989b810` | 107 | Full | H20 |
| 91 | `scripts/testnet/make-manifest.mjs` | `62a562773b70fd09a5a9c4df01126bacf29bc44a` | 182 | Full | H20 |
| 92 | `scripts/testnet/make-manifest.test.mjs` | `63241a487df8093b929f2255d370165c7782b63b` | 47 | Full | H20 |
| 93 | `scripts/testnet/verify-sources.sh` | `ec27186bf1cc23b83fd41a21afb7f8f293ea27c6` | 49 | Full | H20 |
| 94 | `scripts/testnet/verify-sources.test.mjs` | `4f57fc4ce8be691fb36380da44d3afa1e418c33c` | 66 | Full | H20 |
| 95 | `scripts/tests/contract-analysis-workflow.test.mjs` | `50a72a2ad5a883e37aca82114fd77ed9330d1dac` | 292 | Full | H11 |
| 96 | `scripts/tests/contract-analysis-workflow.test.mjs` | `eb49b85471b9eb139acb768c942aedc2b354e9d6` | 238 | Diff | H9 |
| 97 | `scripts/tests/echidna-runner.test.mjs` | `cd97972b2346c5adac7860dba7144b6180979346` | 101 | Full | H20 |
| 98 | `scripts/tests/mythril-completeness.test.mjs` | `c3abc1c843b91f20d4497f3c45b48685af3c343e` | 139 | Full | H11 |
| 99 | `scripts/tests/mythril-disposition-check.test.mjs` | `d8d056f09b84ece35f7c768970a637a929f1285c` | 191 | Full | H11 |
| 100 | `scripts/tests/mythril-evidence.test.mjs` | `c88dfc1ca8b6274d0607fed7e524b62c4a265c98` | 120 | Full | H11 |
| 101 | `scripts/tests/mythril-runner.test.mjs` | `1d4f6661ae838547d02c453edc451b7de7655a6f` | 125 | Full | H11 |
| 102 | `scripts/tests/mythril-runner.test.mjs` | `3852bf05e014330882702bcd010b14fd6e1ae218` | 102 | Diff | H9 |
| 103 | `scripts/tests/policy-predeploy.test.mjs` | `c8911d80b1851299c4af00b310cde2239695bc14` | 84 | Full | H11 |

### Complete-diff bases

| Reviewed path/blob | Fully read base path/blob |
|---|---|
| `packages/invoice-schema/src/envelope.test.ts` — `bda520017c37abd60f0a2ae208c28b7a69c2d247` | `packages/invoice-schema/src/envelope.test.ts` — `486d42b861ce54371239c82e90bae2a94603029a` |
| `packages/invoice-schema/src/independent.test.ts` — `43b0d7eae975efb8125205adf1d53e99b69ec4e0` | `packages/invoice-schema/src/independent.test.ts` — `76f4b7d70345229a023cd64852afcaeee082d417` |
| `packages/invoice-schema/src/passphrase.test.ts` — `a80ea26fc2b72a219270418ac2120d3d1f703ef5` | `packages/invoice-schema/src/passphrase.test.ts` — `7c9183038e3d1454d418419da7dcf1bee3a91d32` |
| `packages/invoice-schema/src/secp256k1-ref.testutil.ts` — `54438d7f8e9cc76b4b4814662c0005375dbd24c9` | `packages/core-crypto/src/secp256k1-ref.testutil.ts` — `92a81444a4e59f2e47f384a7b99b7b97d9733caa` |
| `packages/invoice-schema/src/text-hygiene.test.ts` — `4a641ad3ff77a16946d33ad6a367ff4e948d5ec5` | `packages/invoice-schema/src/text-hygiene.test.ts` — `f8664bcada335244c7cc0a1690e50b07552d169a` |
| `packages/payment-uri/src/fuzz.test.ts` — `29a9b31bc47565775ed6efba4a6c4d1f5ce4b391` | `packages/payment-uri/src/fuzz.test.ts` — `13d1b88f54bfe8cb705bec408c83be2c9359c3fb` |
| `scripts/tests/contract-analysis-workflow.test.mjs` — `eb49b85471b9eb139acb768c942aedc2b354e9d6` | `scripts/tests/contract-analysis-workflow.test.mjs` — `50a72a2ad5a883e37aca82114fd77ed9330d1dac` |
| `scripts/tests/mythril-runner.test.mjs` — `3852bf05e014330882702bcd010b14fd6e1ae218` | `scripts/tests/mythril-runner.test.mjs` — `1d4f6661ae838547d02c453edc451b7de7655a6f` |

## Unassigned documentation inventory

These 16 documentation versions were discovered during tree reconciliation and were outside this delegated source/test/configuration assignment. They are not claimed reviewed by this worker. Their full carrying-head membership is retained in `reconciliation_unassigned_entries` in the JSON ledger. Root determines whether its documentation reconciliation already covers them.

| Path | Full Git blob |
|---|---|
| `packages/address-safety/DEVIATIONS.md` | `d92fb80c346c95d377ba8cabf6fb8764ca01f301` |
| `packages/address-safety/README.md` | `113ab51cee5a6c636d1a6a8a789c5ee19f10f062` |
| `packages/core-crypto/DEVIATIONS.md` | `8a6698710f81536ee1ea6eb4fde3b94fe45422e6` |
| `packages/core-crypto/README.md` | `41b658f872f57a68714f2481bc6dc10a7b036445` |
| `packages/invoice-schema/DEVIATIONS.md` | `7e31289f847fb54cd8293582c9c07fde54a3a907` |
| `packages/invoice-schema/README.md` | `d09d2cd2ebd3dad0b609f6b2ad8976ff95f2e69d` |
| `packages/payment-uri/DEVIATIONS.md` | `d37649da822437068eca4750beeff657593a97c4` |
| `packages/payment-uri/README.md` | `fff2787db48dae555e21a4e19c922b96a5972eca` |
| `packages/qr-exchange/DEVIATIONS.md` | `705725f821d8cee444473486a19ae4f08a029280` |
| `packages/qr-exchange/README.md` | `012eeef0feaa333a1c4d84007cdfb18063945bd0` |
| `packages/secret-box/DEVIATIONS.md` | `2494ab65d144692f1b5b491c00cc7e73c7d68997` |
| `packages/secret-box/README.md` | `a76368b40db0e6bf95d1a94a38c097deebae8b33` |
| `packages/tx-review/DEVIATIONS.md` | `f27408412f3336dbdffb8fd18d0c9de4f2a677d7` |
| `packages/tx-review/README.md` | `dad9ea2f444915f4965c444d1d8a5cb38b92a985` |
| `packages/invoice-schema/DEVIATIONS.md` | `a67320d562b914faff0ab715c3dc956ebdd33de0` |
| `packages/invoice-schema/README.md` | `d68bae336b9d85bb41c975b224a3b71c3a602e1e` |

## Handoff

No assigned rows remain pending. The complete structured handoff is `crypto_tests_wave3.json`; root owns global deduplication, expansion from 20 to 24 heads, final severity aggregation, repo-note preparation and publication status. Publication remains blocked by the earlier automatic review. This worker performed no repository write or network publication.
