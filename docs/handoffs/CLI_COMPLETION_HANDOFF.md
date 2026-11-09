# GhostPay CLI completion handoff

## Branch, publication and source

- Branch: `gpt/ghostpay-cli-completion-20261109`.
- Integration PR: https://github.com/djshellshoxxx/GhostPay/pull/92 (draft until final hosted acceptance).
- Starting source and unchanged parent tip: PR #91, `b748ecdce06d2dfa911144814161c31a46a09e9b`.
- Published infrastructure checkpoint: `1a814ada642dabafdc185651454aff6e993080fa`.
- Published integrated command checkpoint: `5ee84c91ea4a88e543b12829ef89694e54b68d0e`.
- Published reviewed source checkpoint: `30361b58f4f0273b3bdf39193f7d41513f0d3b99`. Its Ubuntu, Windows, macOS and portable-hosting checks pass. The final GUI audit identified the supported full-profile manual-digest receipt path; its CLI equivalent is now implemented, independently reviewed and locally qualified, with exact-source hosted acceptance following in this next checkpoint.
- Preserved parent stack: #84 → #88 → #89 → #90 → #91 → #92. All workers' compatible changes are integrated on this branch. No parent branch has been rewritten or merged into main.

Direct engineering workers used disjoint files in one integration checkout, with independent cross-review of payment, receipt, recovery, registry, QR, filesystem and build-provenance boundaries. No Codex CLI/cloud task, paid agent workflow, recurring runner or funded transaction has been invoked. Only ordinary repository CI is used for hosted validation.

## Authoritative capability inventory

This is the single completion inventory. The complete command and operator reference is [packages/cli/README.md](../../packages/cli/README.md): **68 registered command paths, 54 new and 14 preserved**, every declared option documented, and **151 example argument sets checked against the compiled parser**.

The percentage measures five acceptance gates, worth 20% each: shared implementation and format parity; public command behavior/help/output; adversarial and security regressions; local compiled/shared/GUI acceptance; and hosted integration/platform acceptance on the published source. The first four gates are satisfied. Final hosted acceptance is pending, so the assignment is not yet reported as 100%. These percentages do not measure production deployment readiness.

| Capability | GUI available | CLI available | Shared implementation | Test evidence | Completion / remaining work |
|---|---|---|---|---|---|
| Invoice creation | Yes | create/sign/link/inspect, protected links, expected fields | invoice-schema and payment-link policy | Public handler/parity tests; compiled signing/link journey | 80%; final hosted gate |
| Invoice verification | Yes | strict envelope, signature/pin/chain/asset/amount/recipient/expiry checks | invoice-schema | Wrong-pin expected-red regression; compiled verification | 80%; final hosted gate |
| Payment inspection | Enabled testnets | inspect/verify/status, explicit online consent | chain-adapters canonical verifier | Actual verifier with bounded fixtures; compiled HTTP pending/reorg/verified journeys | 80%; final hosted gate; public-network acceptance external |
| Signed receipts | Yes | create/inspect/verify/export, exact invoice binding or explicit unmatched manual digest | GUI signed codec extracted to invoice-schema | 48 creation regressions; shared signature vectors; compiled bound/manual creation and SVG/file round trips | 80%; final hosted gate |
| QR exchange | Text and browser camera | invoice/receipt/seller/meta/keystore/settings; SVG, text, multipart | qr-exchange/jsQR and shared codecs | Bounded parser/image/scan tests; compiled SVG/multiframe, encrypted keystore and settings exchange | 80%; final hosted gate; camera/raster adapter outside applicable scope |
| Public seller pairing | Yes | export-public/import-public, repeated-input preview | GUI public codec extracted to qr-exchange | Shared round trips and compiled repeated import | 80%; final hosted gate |
| Encrypted backup | Yes | generate/create/inspect/verify/rekey | Existing core key generation, scrypt/AES-GCM, GPA and address-book codecs | ux-vault 251; key generation 5; compiled generated-key authentication and rekey | 80%; final hosted gate |
| Restoration | Yes | dry-run or approved immutable encrypted portable output | Shared format validation and vault import | Authentication/tamper/atomicity tests; compiled immutable recovery | 80%; final hosted gate; browser activation requires GUI import |
| Reconciliation | Yes | inspect/create/register/propose/confirm/record/import/clear-records/remove-invoice/remove-receipt/archive-receipt/export-receipts | Pure GUI vault/matching extraction | Mixed-fork/manifest/provider/stale-context regressions; compiled approval/import/record/tombstone maintenance | 80%; final hosted gate |
| Transaction history | Yes | list/inspect, filter/page/report export | Encrypted reconciliation vault | Query/import/tombstone tests; compiled historical-vs-live labels | 80%; final hosted gate |
| Merchant subscriptions | Library and durable operator | schedule plus config/snapshot validation and inspection; existing durable runner retained | merchant-billing validator and subscription-cron | merchant-billing 263; durable subprocess 21; compiled inspection | 80%; final hosted gate |
| Installments | Library | plan/inspect, exact integers and conflict detection | merchant-billing | Malformed/schedule tests; compiled plan/inspect | 80%; final hosted gate |
| Webhooks | Merchant integration | sign/verify plus event/config/idempotency inspection; durable receiver retained | merchant-hooks | Exact-byte/retry/restart suites; compiled Unicode and inspection | 80%; final hosted gate |
| Refunds | Off-chain fixture only | inspect/status; execute explicitly unsupported | merchant-multisig canonical account/proposal validation | Threshold/timelock/expiry/nonce tests; compiled unsupported execution | 80%; final hosted gate; accepted real payment/refund authority external |
| Chain adapters | Read-only/testnet surfaces | chain/assets/deployment, recipient/Solana announcement/Bitcoin headers, registry lookup | Existing EVM/BTC/Solana/TRON packages and registry verifier | Payment/chain/scan 159; registry 9; compiled deployment/RPC/registry workflows | 80%; final hosted gate; no experimental activation or broadcast |
| Privacy scanning | Yes, bounded | plan/run/inspect, immutable authenticated resume reports | Existing bounded canonical scanning and standard HKDF/HMAC cursor binding | Budget/replay/reorg tests; compiled private scan | 80%; final hosted gate |
| Operator diagnostics/configuration | Yes | doctor/diagnostics/RPC health/config validate/version; safe settings exchange; build revision | Same self-tests, validators, settings codec and RPC transport | Source fallback/settings/operator 31; build provenance 6; compiled diagnostics | 80%; final hosted gate |

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

The ordinary CLI matrix runs Node 22 on Ubuntu, Windows and macOS. At checkpoint `5ee84c91ea4a88e543b12829ef89694e54b68d0e`, Ubuntu and macOS passed. Windows exposed two fault-injection tests whose POSIX-only path suffix did not match Windows separators; they now use `basename`. The intended write/sync failure assertions remain intact. Windows retains two explicitly POSIX-only permission/FIFO skips; the credential adapter fails closed on unqualified Windows file ACLs.

The same checkpoint exposed incomplete clean-checkout library builds: newly shared consumers could not resolve `merchant-hooks` or `ux-vault/portable`. The existing dependency-order builder now supplies all libraries, and its full local run passes. At `30361b58`, all three platforms pass in [CLI run 42721390513](https://github.com/djshellshoxxx/GhostPay/actions/runs/42721390513), and both portable hosting jobs pass in [Hosting run 42721390813](https://github.com/djshellshoxxx/GhostPay/actions/runs/42721390813). Windows ran 519 CLI tests with the two documented POSIX skips and all 20 then-current compiled tests without skips. Final manual-digest-source run URLs/results will replace the pending acceptance after publication. Earlier failing run IDs are CI `42718393485`, CLI platforms `42718393852`, and portable web/kit `42718393460`; they are diagnosis evidence, not final acceptance.

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

The final GUI audit identified and closed the full-profile manual-digest receipt gap. Fifteen new public cases and the compiled manual journey were observed failing before implementation; all 48 focused creation cases and both bound/manual subprocess journeys pass. The final full 536-test CLI and 21-test compiled suites also pass. Independent review found no remaining source defect. Final hosted checks are still required before marking PR #92 ready. The parent snapshot's saturated-backup component failure did not recur in the completed full local GUI gate; final hosted CI must confirm the published source.

The inherited `.github/workflows/openai-agents.yml` is an invalid standalone step fragment. GitHub records a workflow-validation failure on pushes with **zero jobs** (for this checkpoint, run `42721379487`); no agent process or paid workflow was executed. It is unchanged and outside the CLI acceptance workflows. Do not repair it into an executable paid agent workflow as part of this task.

Parent #84's Sonar gate remains an independent consolidation gate, and PR #91 remains draft. Do not merge the stack into main without checking each latest parent SHA, required checks and review state. Production deployment pins, public-network acceptance, Bitcoin regtest infrastructure and accepted real refund authority remain external. No production key or funded transaction is required to finish this CLI assignment.

**Next action:** publish the follow-up source snapshot, collect its exact hosted CI/platform results, fix any actionable failure, record the tested revision and run URLs here, then mark PR #92 ready when its own gates permit. Source code and command reference are frozen. No autonomous work continues after the active session ends without a separately configured persistent runner; none was configured.
