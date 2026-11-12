# GhostPay CLI completion handoff

## Branch, publication and source

- Branch: `gpt/ghostpay-cli-completion-20261109`.
- Integration PR: https://github.com/djshellshoxxx/GhostPay/pull/92 — **ready for review**; not merged.
- Starting source and unchanged parent tip: PR #91, `b748ecdce06d2dfa911144814161c31a46a09e9b`.
- Published infrastructure checkpoint: `1a814ada642dabafdc185651454aff6e993080fa`.
- Published integrated command checkpoint: `5ee84c91ea4a88e543b12829ef89694e54b68d0e`.
- Published reviewed source checkpoint: `30361b58f4f0273b3bdf39193f7d41513f0d3b99`.
- **Qualified final source:** `54d4fee8cc1e3d115a3284eee8de4524068c2d2e`; tree `d1b6eecb542272765244b16222b31b23cef36895`. **All 29 source check runs passed.** This handoff is a documentation-only successor to that tested source.
- A clean local rebuild of the qualified source reported that exact revision with `dirty: false`; offline diagnostics passed with `networkContacted: false`.
- Preserved parent stack: #84 → #88 → #89 → #90 → #91 → #92. All workers' compatible changes are integrated on this branch. No parent branch has been rewritten or merged into main.

Direct engineering workers used disjoint files in one integration checkout, with independent cross-review of payment, receipt, recovery, registry, QR, filesystem and build-provenance boundaries. No Codex CLI/cloud task, paid agent workflow, recurring runner or funded transaction has been invoked. Only ordinary repository CI is used for hosted validation.

## Authoritative capability inventory

This is the single completion inventory. The complete command and operator reference is [packages/cli/README.md](../../packages/cli/README.md): **68 registered command paths, 54 new and 14 preserved**, every declared option documented, and **151 example argument sets checked against the compiled parser**.

The percentage measures five acceptance gates, worth 20% each: shared implementation and format parity; public command behavior/help/output; adversarial and security regressions; local compiled/shared/GUI acceptance; and hosted integration/platform acceptance on the published source. All five gates are satisfied at the qualified source above. **Applicable CLI/operator engineering completion is 100%.** The percentages cover the documented applicable scope, including explicit unsupported-operation boundaries; they do not measure production deployment readiness or clear the parent stack's independent merge gates.

| Capability | GUI available | CLI available | Shared implementation | Test evidence | CLI completion / remaining external work |
|---|---|---|---|---|---|
| Invoice creation | Yes | create/sign/link/inspect, protected links, expected fields | invoice-schema and payment-link policy | Public handler/parity tests; compiled signing/link journey | 100%; acceptance passed |
| Invoice verification | Yes | strict envelope, signature/pin/chain/asset/amount/recipient/expiry checks | invoice-schema | Wrong-pin expected-red regression; compiled verification | 100%; acceptance passed |
| Payment inspection | Enabled testnets | inspect/verify/status, explicit online consent | chain-adapters canonical verifier | Actual verifier with bounded fixtures; compiled HTTP pending/reorg/verified journeys | 100%; acceptance passed; public-network acceptance external |
| Signed receipts | Yes | create/inspect/verify/export, exact invoice binding or explicit unmatched manual digest | GUI signed codec extracted to invoice-schema | 48 creation regressions; shared signature vectors; compiled bound/manual creation and SVG/file round trips | 100%; acceptance passed |
| QR exchange | Text and browser camera | invoice/receipt/seller/meta/keystore/settings; SVG, text, multipart | qr-exchange/jsQR and shared codecs | Bounded parser/image/scan tests; compiled SVG/multiframe, encrypted keystore and settings exchange | 100%; acceptance passed; camera/raster adapter outside applicable scope |
| Public seller pairing | Yes | export-public/import-public, repeated-input preview | GUI public codec extracted to qr-exchange | Shared round trips and compiled repeated import | 100%; acceptance passed |
| Encrypted backup | Yes | generate/create/inspect/verify/rekey | Existing core key generation, scrypt/AES-GCM, GPA and address-book codecs | ux-vault 251; key generation 5; compiled generated-key authentication and rekey | 100%; acceptance passed |
| Restoration | Yes | dry-run or approved immutable encrypted portable output | Shared format validation and vault import | Authentication/tamper/atomicity tests; compiled immutable recovery | 100%; acceptance passed; browser activation requires GUI import |
| Reconciliation | Yes | inspect/create/register/propose/confirm/record/import/clear-records/remove-invoice/remove-receipt/archive-receipt/export-receipts | Pure GUI vault/matching extraction | Mixed-fork/manifest/provider/stale-context regressions; compiled approval/import/record/tombstone maintenance | 100%; acceptance passed |
| Transaction history | Yes | list/inspect, filter/page/report export | Encrypted reconciliation vault | Query/import/tombstone tests; compiled historical-vs-live labels | 100%; acceptance passed |
| Merchant subscriptions | Library and durable operator | schedule plus config/snapshot validation and inspection; existing durable runner retained | merchant-billing validator and subscription-cron | merchant-billing 263; durable subprocess 21; compiled inspection | 100%; acceptance passed |
| Installments | Library | plan/inspect, exact integers and conflict detection | merchant-billing | Malformed/schedule tests; compiled plan/inspect | 100%; acceptance passed |
| Webhooks | Merchant integration | sign/verify plus event/config/idempotency inspection; durable receiver retained | merchant-hooks | Exact-byte/retry/restart suites; compiled Unicode and inspection | 100%; acceptance passed |
| Refunds | Off-chain fixture only | inspect/status; execute explicitly unsupported | merchant-multisig canonical account/proposal validation | Threshold/timelock/expiry/nonce tests; compiled unsupported execution | 100%; acceptance passed; accepted real payment/refund authority external |
| Chain adapters | Read-only/testnet surfaces | chain/assets/deployment, recipient/Solana announcement/Bitcoin headers, registry lookup | Existing EVM/BTC/Solana/TRON packages and registry verifier | Payment/chain/scan 159; registry 9; compiled deployment/RPC/registry workflows | 100%; acceptance passed; no experimental activation or broadcast |
| Privacy scanning | Yes, bounded | plan/run/inspect, immutable authenticated resume reports | Existing bounded canonical scanning and standard HKDF/HMAC cursor binding | Budget/replay/reorg tests; compiled private scan | 100%; acceptance passed |
| Operator diagnostics/configuration | Yes | doctor/diagnostics/RPC health/config validate/version; safe settings exchange; build revision | Same self-tests, validators, settings codec and RPC transport | Source fallback/settings/operator 31; build provenance 6; compiled diagnostics | 100%; acceptance passed |

### Applicability and trust boundaries

- Browser camera capture, UI theme application, browser profile storage/session locking and browser wallet prompts require their GUI infrastructure. The GUI has camera and pasted-text QR paths, not a general PNG/JPEG import workflow. CLI QR accepts bounded protocol text, its generated SVG and multipart scans; it explicitly rejects arbitrary raster/camera input. This does not remove an existing portable GUI operation.
- Encrypted restoration creates an authenticated portable successor, reports `browserStorageChanged: false`, and requires an explicit GUI import for browser activation. CLI filesystem credentials and immutable files provide the corresponding headless boundary.
- Payment sends, sweeps and registry publication require wallet authorization. Experimental policy execution and accepted real refund authority are not supported production flows. This work adds no transaction signing/broadcast authority. `merchant refunds execute` exits 5 with an explicit unsupported result.
- Live verification is scoped to independently pinned, enabled testnet deployments and selected providers. RPC health and registry behavior checks do not establish provider identity/trust; registry lookup reports that its runtime code is not pinned. Imported history, announcements and signed receipts do not become proof of canonical payment.
- Receipt creation has two explicit modes. `--invoice` requires a signed unexpired fixed-token invoice and exact seller/chain/asset/net-amount binding. `--manual-invoice-digest` mirrors the full GUI's seller-supplied, unmatched digest; it reports `invoiceBound: false` and `manualInvoiceDigest: true`, with no claim to invoice validation. Both modes require authenticated seller/recipient ownership, independent expected payment facts, explicit online approval, fresh canonical finality and an immutable new output. The shared signed format is unchanged; the mode labels belong to the creation report. `paymentVerifiedAtCreation` describes that bounded check; `receiptIsPaymentProof` remains false. Fiat-bound creation remains unsupported by the shared GUI binding helper.
- Private scans have authenticated resume scope and finite request/log/block/byte/time budgets. Matched observations remain unverified until canonical payment verification. Settings exchange contains exactly five validated preferences; it neither imports endpoint credentials/trust pins nor applies browser state.

## Shared-library changes

- `invoice-schema`: the GUI's domain-separated signed receipt codec is shared with CLI verification/creation. Existing invoice and receipt formats remain compatible.
- `qr-exchange`: public seller, stealth-meta and settings codecs are shared with localized GUI adapters; encrypted keystore exchange reuses the existing codec and authenticates only when the relevant recovery command is invoked.
- `ux-vault/portable`: framework-independent keystore, reconciliation, tags/GPA and address-book operations. Browser storage/session adapters remain in the GUI.
- `merchant-billing`: the durable subscription validator is shared with the existing runner through a thin re-export. Existing state engines, replay handling and durable receiver examples are preserved.
- `build:libs`: invokes the existing dependency-order builder with `--libraries`, ensuring shared consumers have all their workspace dependencies in clean CI checkouts.
- Build metadata is generated once during compilation. Runtime diagnostics read a static module containing only source revision and dirty state, with explicit nulls when Git metadata is unavailable. No runtime Git lookup, timestamp, host path or credential value is embedded.

## Local test evidence

Runtime: Node 24.22.1, npm 11.9.0, Linux. `npm ci --ignore-scripts --no-audit --no-fund` installed 747 packages. No coverage gate or supported validation was relaxed. Coverage values below are statements / branches / functions / lines.

| Recorded command / package gate | Observed result |
|---|---|
| `npm run build:libs` | Passed for all libraries in dependency order |
| `npm run build -w @ghostpay/cli` | Passed; TypeScript compilation and deterministic build stamp |
| `npm test -w @ghostpay/cli -- --maxWorkers=2` | **536 passed in 31 files**; **98.56 / 97.26 / 99.07 / 99.48%** |
| `npm run test:compiled -w @ghostpay/cli` | **21 passed, 0 skipped**, including both receipt modes and all six build-provenance tests |
| Full `@ghostpay/invoice-schema` coverage gate | **705 passed**; **98.06 / 97.72 / 100 / 99.25%** |
| Full `@ghostpay/qr-exchange` coverage gate | **130 passed**; **98.82 / 93.83 / 100 / 99.70%** |
| Full `@ghostpay/ux-vault` coverage gate | **251 passed**; **96.18 / 92.90 / 99.68 / 98.61%** |
| Full `@ghostpay/merchant-billing` coverage gate | **263 passed**; **99.69 / 99.66 / 100 / 99.80%** |
| `node --test examples/subscription-cron/run.test.mjs` | **21 passed** after the shared validator extraction and URL-policy fix |
| `npm exec -w @ghostpay/web -- vitest run --coverage --maxWorkers=2` | **2,180 passed, 8 skipped**; 148 files passed, 2 skipped; **93.21 / 88.79 / 94.70 / 96.70%** |
| `npm exec -w @ghostpay/web -- vitest run --config vitest.nocov.config.ts --maxWorkers=2` | **1 passed** |
| `npm run lint -w @ghostpay/cli && npm run typecheck -w @ghostpay/cli` | Passed on the final source snapshot |
| `npm run lint -w @ghostpay/web` and `npm run typecheck -w @ghostpay/web` | Passed after the shared extractions and deterministic test-fixture correction |
| Shared package lint/typecheck | Passed in the owning implementation lanes |
| `node --test packages/cli/test/build-info.test.mjs` | **6 passed**, independently repeated after the foreign-Git-routing fix |
| `git diff --check` | Passed |
| `bash scripts/scan-secrets.sh` and `bash scripts/check-actions-pinned.sh` | Passed with all new files staged; 91 action references pinned |

The shared package rows execute their existing full `vitest run --coverage` scripts. Reproduce those gates from the repository root with:

```sh
npm test -w @ghostpay/invoice-schema -- --maxWorkers=2
npm test -w @ghostpay/qr-exchange -- --maxWorkers=2
npm test -w @ghostpay/ux-vault -- --maxWorkers=2
npm test -w @ghostpay/merchant-billing -- --maxWorkers=2
```

These are reproducible invocations of the recorded package gates, not claims about the literal shell prefix used by each worker. The compiled suite exercises the actual built executable: paths with spaces, Unicode bytes, closed output pipes, interruption-safe publication, invoice/receipt/QR interoperability, generated encrypted keys, recovery/rekey, immutable reconciliation approval/import/maintenance, real HTTP fixture RPC verification and registry lookup, privacy scans, merchant tools, diagnostics and build provenance. Controlled RPC fixtures exercise the actual canonical verifier and network adapter; they are not public-network acceptance.

### Local integration skips

The eight existing GUI skips are explicit environment prerequisites, not tests disabled by this work: four `policy/paymentEvidence.anvil.test.ts` cases lack Anvil and contract artifacts; three nested `registry/registry.anvil.test.ts` cases lack Anvil/configured solc; one `btc/regtest.e2e.test.ts` case requires `GHOSTPAY_REGTEST_URL`, `GHOSTPAY_REGTEST_SEED` and `GHOSTPAY_REGTEST_DEST`. Local `REQUIRE_ANVIL` is unset. Hosted CI provisions Anvil/solc and enforces its relevant integration gates. External Bitcoin regtest remains a separate prerequisite.

## Hosted acceptance

The qualified source is `54d4fee8cc1e3d115a3284eee8de4524068c2d2e`. GitHub returned **29 check runs, all successful**, with PR #92 mergeable/clean before the ready-for-review transition. No GitHub approval reviews had been submitted; direct independent engineering reviews are recorded above. The parent remained unchanged at `b748ecdce06d2dfa911144814161c31a46a09e9b`.

| Workflow / gate | Exact-source result |
|---|---|
| [Main CI — 42722685967](https://github.com/djshellshoxxx/GhostPay/actions/runs/42722685967) | **24 jobs passed**, including all package shards, full build/typecheck/lint, contracts, audit, guards, both browser profiles and lean reproducibility |
| [CLI platforms — 42722685776](https://github.com/djshellshoxxx/GhostPay/actions/runs/42722685776) | **Ubuntu, Windows and macOS all passed**, Node 22 |
| [Portable hosting — 42722685760](https://github.com/djshellshoxxx/GhostPay/actions/runs/42722685760) | **Both jobs passed**: portable web qualification and hosting kit |

| CLI platform | Source tests | Compiled executable tests | Coverage: statements / branches / functions / lines |
|---|---|---|---|
| [Ubuntu](https://github.com/djshellshoxxx/GhostPay/actions/runs/42722685776/job/129520329539) | **536 passed**, 31 files, no skips | **21 passed**, no skips | **98.56 / 97.26 / 99.07 / 99.48%** |
| [macOS](https://github.com/djshellshoxxx/GhostPay/actions/runs/42722685776/job/129520329574) | **536 passed**, 31 files, no skips | **21 passed**, no skips | **98.56 / 97.26 / 99.07 / 99.48%** |
| [Windows](https://github.com/djshellshoxxx/GhostPay/actions/runs/42722685776/job/129520329107) | **534 passed, 2 POSIX-only skips**, 31 files | **21 passed**, no skips | **98.35 / 97.20 / 99.07 / 99.33%** |

Every platform also passed `npm run test:cli-build` (1 test), `npm run build:cli` and `npm run typecheck -w @ghostpay/cli`. Source and compiled commands were `npm test -w @ghostpay/cli -- --maxWorkers=2` and `npm run test:compiled -w @ghostpay/cli`. Windows skips only the POSIX FIFO and group-readable-file permission cases; its private credential-file adapter fails closed on unqualified Windows ACLs, with documented stdin/environment alternatives.

### Hosted GUI and browser evidence

- [Web job 129521388866](https://github.com/djshellshoxxx/GhostPay/actions/runs/42722685967/job/129521388866): **2,187 passed, 1 skipped**, 149 files passed/1 skipped; separate noncoverage pass **1 test/1 file passed**. Coverage is **93.21 / 88.79 / 94.70 / 96.70%**.
- The exact integration invocation was `ANVIL_BIN="$anvil_bin" SOLC_BIN="$solc_bin" REQUIRE_ANVIL=1 npm test -w apps/web`. Four actual payment-evidence Anvil cases and three actual registry-contract cases ran successfully; the registry file also passed its availability guard. The sole web skip is the opt-in Bitcoin regtest/Esplora case requiring the separately configured environment listed above.
- [Full browser job 129521388682](https://github.com/djshellshoxxx/GhostPay/actions/runs/42722685967/job/129521388682): **60 passed, 1 opposite-profile skip**. [Lean browser job 129521388672](https://github.com/djshellshoxxx/GhostPay/actions/runs/42722685967/job/129521388672): **52 passed, 1 opposite-profile skip**. Both used `npm run test:e2e --workspace @ghostpay/web` with their existing profile environment and one worker. Full skips the lean-only backup-panel case; lean skips the full combined-backup case.
- Both browser build records bind source `54d4fee8` to tested merge `5973d94214981c7853c71a4a981a5efbddec0a3d` and the identical source tree `d1b6eecb542272765244b16222b31b23cef36895`. Retained artifacts: [full browser-tested build](https://github.com/djshellshoxxx/GhostPay/actions/runs/42722685967/artifacts/13721082974) and [lean browser-tested build](https://github.com/djshellshoxxx/GhostPay/actions/runs/42722685967/artifacts/13721237185).
- Browser audit records retain a **moderate `heading-order` finding in unchanged Settings markup**. The existing accessibility gate fails serious/critical findings and is unchanged. Settings, the common heading component, the accessibility specification and audit helper have identical parent/final source. This records the actual retained finding without claiming a separate parent audit execution.

### Closed checkpoint failures

Checkpoint `5ee84c91` exposed two Windows fault-injection tests with POSIX-only path suffix matching; they now use `basename`, preserving the write/sync failure assertions. It also exposed missing clean-checkout library dependencies (`merchant-hooks` and `ux-vault/portable`); `build:libs` now uses the existing dependency-order builder. The final platform, typecheck, lint, build, package and browser jobs above pass with these fixes. Earlier failing runs `42718393485`, `42718393852` and `42718393460` are diagnosis evidence, not final acceptance.

## Reproduced security and correctness fixes

- Group-readable signing keys were accepted. Private POSIX reads now check ownership, mode and link count on the opened descriptor.
- Text and binary readers now bind the initial named file's device/inode to the opened descriptor, closing replacement between `lstat` and `open`; both new race tests were observed failing first.
- An explicitly wrong invoice pin returned success; it now exits 1.
- Reconciliation proposals now bind the exact source, observations, manifest and captured provider configuration. Confirmation requires an unexpired proposal, explicit approval and fresh full canonical checks.
- Different block hashes at one height could overwrite each other in the final map; complete context now rejects mixed forks. Implausible/finally changed heads and late secondary reorganization observations are rejected.
- Receipt creation rereads source material before the final canonical guard and authenticates the captured encrypted keystore, closing a late-reorganization window and an A→B→A keystore replacement gap. Selective RPC failures in receipt/reconciliation paths retain network exit code 4.
- Signed subscription outbox URLs with credentials or empty query delimiters bypassed normal link policy. The shared validator now reuses `assertPaymentLink`, backed by two expected-red regressions.
- An unset key/webhook environment-source error echoed the supplied variable name, potentially an accidentally pasted secret. Errors are now generic; passphrase/RPC sources already suppress names and values.
- QR decode validates/counts each input before reading more files, preventing accumulation of an entire malformed multi-file batch. Encrypted exchange never implies password authentication or applied settings.
- Inherited Git routing could stamp an unrelated checkout's clean revision. Build-time Git now removes ambient `GIT_*` routing/configuration overrides case-insensitively; a real two-checkout regression failed before the fix and passes afterward.
- The full GUI gate exposed an existing randomized sweep fixture that occasionally generated an all-uppercase checksum address. Its test inputs are now deterministic: uppercase exercises strict rejection and the lowercase equivalent exercises self-destination rejection. Production address validation is unchanged; all 94 sweep tests and the full GUI suite pass.

Keys, passphrases and endpoints use explicitly selected file/stdin/named environment sources. On Windows private file reads fail closed because the adapter cannot qualify DACLs; use stdin/environment, including stdin for private scan reports. POSIX outputs request 0600. Windows output confidentiality depends on a trusted private parent-directory ACL and is not inferred from POSIX mode bits. Restore and reconciliation successors never overwrite; create/rekey overwrites require explicit supported `--force` behavior.

## Known defects, external gates and next action

No confirmed CLI source defect or applicable command gap remains after independent review and the final full local/hosted gates. The last full-profile manual-digest receipt gap was closed with 15 expected-red public cases and an expected-red compiled journey; all 48 focused creation cases, the full 536-test CLI suite, and all 21 compiled workflows now pass. The parent's saturated-backup component failure did not recur in the completed local or hosted full GUI gate; no unproven causal fix is claimed.

PR #92 is **ready for review**, with all compatible worker changes consolidated on the dedicated branch. No approval reviews were submitted at the readiness check, and no parent branch was merged or rewritten. Parent #91 remains draft. Parent #84 at `48b6bc20108079bb7fbf89997249734bf9f41646` still has a failing Sonar security rating on new code (D; required A). Review the preserved stack and its latest required checks before any merge into main; the CLI continuation does not clear those parent gates.

The inherited `.github/workflows/openai-agents.yml` is an invalid standalone step fragment. GitHub records a separate workflow-validation failure with **zero jobs** ([run 42722678253](https://github.com/djshellshoxxx/GhostPay/actions/runs/42722678253)); no agent process or paid workflow was executed. The file is identical to the parent and unchanged by this task. Do not repair it into an executable paid agent workflow as part of this CLI assignment.

Production deployment pins, public-network acceptance, the opt-in Bitcoin regtest/Esplora infrastructure, and accepted real-refund authority remain external. Browser camera/device access, browser storage activation and wallet-provider authorization retain the documented adapter boundaries. The retained moderate Settings heading-order audit finding is recorded above. No production key or funded transaction was used.

**Next implementation task:** none within the documented applicable CLI/operator scope. The next repository step is review of PR #92 and resolution of the parent consolidation gates. This handoff update changes documentation only; the qualified code remains the source revision recorded above. No recurring runner was configured, and no autonomous execution is claimed after the active session ends.
