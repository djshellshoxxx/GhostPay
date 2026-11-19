# Spec 18 completion and integration report — 2026-11-18

## Decision

**Spec 18 feature implementation and acceptance are complete for the existing ERC-5564 scheme-1 EVM EOA export path**, qualified on published source `07a7497d1a0cb39fb6904e5c50f8a52db2285820`. All feature-specific tests pass, including the final full web coverage suite, both browser profiles, the Pages Anvil journey, vault and core-crypto coverage, and independent offline recovery and spending. Independent review has no unresolved feature blocker.

Integration is [draft PR #239](https://github.com/djshellshoxxx/GhostPay/pull/239), stacked on PR #238. No main merge, release, deployment, forced ref update, branch deletion, dependency change, or security-gate relaxation is included.

Feature acceptance and full product release qualification are separate. Unrelated inherited gates remain open, as described below. This is AI-assisted engineering and independent agent review, not an external professional security audit.

## Source and provenance

| Role | Source |
| --- | --- |
| Main at initial and refreshed remote inspection | `dfc75ef2087fa6463ae59e0818abec01796c578d` |
| Selected integration base, PR #238 | `198aa5baff22272453733a0f3dcfcac0e0994eec` |
| Original Spec 18 work, PR #213, already incorporated by the base | `ebf7c92c3be1c7aebd37fc58b5567e114fb932fc` |
| Import-consent repairs, PR #229, already incorporated by the base | `18110015e99efbeb4f23d47cd88bd6f917010108` |
| Dedicated branch | `chatgpt/spec18-recovery-reviewed-20261118-a264` |
| Final runtime repair, local / published | `7c1e710a0a4bd38928b3b74814ba4b0ec4865305` / `d2c6452203f16355067fd1935504fe8d4a270581` |
| First fully typed candidate, local / published | `58995408bec0e072a969db7bd4eb4687579bd4a7` / `82f909eb21843572eaf963b6bf36bcf9df581460` |
| Corrected browser/test candidate, local / published | `7d99c223e977938cd96c5e496232bad44a3b4799` / `b536b1c560c3de43b9b5a3bbbbb8bc34474fbe73` |
| Final verification-test candidate, local / published | `8461dbdfeab16648a78e3c1cd2f4dbb3c0fa5187` / `07a7497d1a0cb39fb6904e5c50f8a52db2285820` |
| Final implementation/test tree | `6febc03ffd521fe9ac00ac10275f9ff625db509c` |

A concurrent local Spec 18 implementation was discovered on `chatgpt/spec18-recovery-completion-20261118`. Its checkout and branch were preserved read-only. Twenty-one feature files were copied as a fixed review candidate, with the original per-file SHA-256 values recorded in [snapshot.json](snapshot.json). The independent review and additional repairs apply to this branch; they do not silently modify or assume approval of the concurrent work.

The initial copied candidate was committed locally as `1e3c3466fe168d02194f31b754a85377929136eb`, published as `185eadf57aa081e2dea74b6f667351d364051f27`, with identical tree `99f793feae586123c61a9dd458696eac61dcc964`.

The command-line checkout had read access but no push credential. Authorized publication used the GitHub Git Data API. Each created tree was checked against the local Git tree, commits retain their local provenance, and branch updates used an expected-current-SHA lease with `force: false`. [PUBLICATION_MAP.json](evidence/PUBLICATION_MAP.json) records the mapping. Different commit IDs therefore do not indicate different source trees.

The first hosted candidate checked out synthetic merge `d838d27ca987e4b8c988366537e52e7e68d8c25d`, whose tree `27aeec9cca36e1b5a8a4643b96bc9336e5fae52d` exactly matches local `58995408`. Its parents are the selected base and published `82f909eb`. The final verification-test candidate checked out merge `24bc65f525ec9f19a670e6e5600b071c03edbd56`, whose tree `6febc03ffd521fe9ac00ac10275f9ff625db509c` exactly matches local `8461dbdf` and published `07a7497d`; its parents are the selected base and that published head. The final documentation commit is recorded in the PR body; this document does not invent a self-referential commit hash.

## What was already implemented

The base already contained the portable encrypted formats, the independent reader, deterministic vectors, raw-key export confirmation, export credential reauthentication, bounded parsing, and the #229 operation/selected-export consent binding. These were inspected and reused.

The existing cryptography uses established primitives and versioned formats. This change does not alter the scrypt cost, cipher, nonce generation, curve derivation, legacy seller-keystore format, or supported account models. Existing coverage, browser, dependency, static-analysis and release gates remain enabled.

## Completed behavior

### Backup creation and verification

The interface distinguishes a requested operation, generated ciphertext, initiated download, user-confirmed retention, and successful verification. A download event never proves durable storage.

After an encrypted export, the user can select the retained file, confirm retention, and enter its passphrase. The saved-file flow first requires the selected file to equal the generated export, then authenticates and validates its private/public key relationships. Same-name files, another valid archive, wrong passwords, public-only records, oversized files and stale asynchronous results cannot mark that generated backup verified.

The separate **Verify backup without importing** action authenticates an existing encrypted export and returns only public recovery details. Temporary private material is disposed before returning. It installs no wallet and changes no session custody flags.

A failed browser download request now leaves the generated encrypted file available for an exact retry. Retrying does not repeat key derivation or encryption and does not imply retention or verification. Lock, session replacement or navigation removes the pending export.

### Safe replacement and lifecycle

In the Spec 18 recovery interface, replacing an existing master session requires explicit fresh confirmation, including a session with a verified or saved copy. Consent binds the exact held recovered-key object, operation and session revision.

A vault-only recovery claim is checked again during confirmation. If another tab deleted that copy, the interface requires the stronger sole-copy warning and fresh consent. That check is a current storage observation, not a guarantee that another tab cannot delete a copy later.

Session installation now stages the replacement public summary and all three SecretBoxes before clearing the old session. A failure while staging the replacement summary or secret boxes preserves the old usable keys, custody state and revision, disposes staged material, and wipes owned incoming scalars. Tests execute each of the three secret-box allocation failures. A successful replacement emits one completed state; this is not a guarantee against process termination or post-install failures.

Selected payment, announcement, chain, archive selection or RPC changes invalidate pending export authority. Lock, cancellation, closing, unmount, new file selection and session replacement cannot allow an obsolete import or verification result to install keys or report success. Editing the verification passphrase also clears prior success.

### Independent recovery and authority

All five existing file types have documented recovery behavior:

| File | Recovery scope |
| --- | --- |
| `ghostpay-stealth-public.json` | Public payment record only; contains no spending key and cannot verify as a secret backup. |
| `ghostpay-stealth-keypair.json` | Authenticated encrypted key for one one-time payment address. |
| `ghostpay-stealth-keypairs.json` | Authenticated encrypted keys for the listed one-time addresses on one recorded chain. |
| `ghostpay-stealth-master.json` | Authenticated encrypted spending/viewing pair; can derive a payment omitted from all archives when its announcement is available. Excludes the invoice-signing key. |
| `ghostpay-stealth-private-key.txt` | Plaintext one-time EVM key and identifying metadata; independent `cast` address reconstruction and local spending were executed. |

The standalone reader uses Node crypto and two pinned noble libraries, imports no GhostPay package, and performs no hosted recovery. Fresh read-restricted processes opened all five types outside a GhostPay checkout. An independent Foundry 1.8.5 test reconstructed the expected address and signed a successful synthetic loopback transfer.

The guide now precisely distinguishes recorded chain identity from key authority: the chain label does not cryptographically restrict a private scalar to that chain. Encrypted headers authenticate their metadata; standalone public records and raw files do not. The export path checks for empty account code, and delegated/contract-account recovery remains unsupported. The documentation no longer makes the incorrect universal claim that an EIP-7702-delegated key cannot originate a transaction.

Payment-key files omit the master and viewing secrets. The guide and UI explain the existing scheme-1 relationship: combining a private viewing key, a one-time payment private key and that payment's public announcement can reconstruct the master spending key. A master backup does not preserve the separate invoice-signing key and cannot silently satisfy the full seller-keystore backup policy.

### Secret lifetime, messages and accessibility

Owned mutable passphrase and derived-key buffers are wiped on success and failure where practical. The standalone reader now wipes previously received passphrase chunks when input fails, not only after successful input. It bounds file reads, rejects unexpected options without echoing arbitrary text, and prints private payment keys only after the explicit reveal flag.

The application adds no plaintext storage, key telemetry, backend custody, escrow, mandatory account, or hosted recovery dependency. Fixed download names contain no address, key, chain or timestamp.

The existing localization architecture is preserved. New security messages have explicit English fallback in Spanish, Japanese and Arabic catalogs; they remain marked unreviewed rather than being presented as validated translations. Hosted catalog checking found zero errors and 572 warnings. Keyboard activation, mobile viewport verification, public/malformed refusals and no-install verification are exercised in real Chromium journeys.

JavaScript strings, garbage-collected copies, operating-system copies and eventual deletion of user files are outside a complete-erasure guarantee. Verification proves recoverability at the time of the check; it cannot prove future retention.

## Confirmed defects and regressions

| Finding | Repair and regression |
| --- | --- |
| Replacement staging failure could discard existing keys | Stage all replacement material before clearing; `session.atomicity.test.ts` injects failure at each of three allocations and checks preservation, disposal, zeroization and one-notification success. |
| Failed download discarded generated ciphertext | Retain generated file plus independent download-start state; three panel regressions and a real browser retry case prove retry of the same file without another export. |
| Verification success could outlive an edited passphrase | Clear verification state when passphrase changes; verification regression retains the full refusal and cleanup checks. |
| Failed stdin could retain earlier passphrase chunks | Cleanup in `finally`; red test reproduced retained bytes, then green test proves cleanup and redacted diagnostic. |
| Newly exposed verify action made legacy browser selectors ambiguous | Six precise `exact: true` selectors in backup, core journey and Pages devnet tests; no assertions, timeouts or skips changed. |
| New test fixtures failed typed lint/typecheck | Bind captured methods, use typed codec inspection and correct fixture annotations; preserve all security assertions. |
| Two real-crypto UI tests started their DOM deadline before verification settled | Await the exact call-through verification Promise inside React `act`; require the actual wrong-password rejection. Full web coverage now passes without changing cryptography, assertions or deadlines. |

The first four findings have executed focused red/green or failure-path evidence. The selector issue was reproduced by hosted full, lean and Pages jobs. Its corrected-source hosted result is recorded below.

## Independent review

[THREAT_REVIEW.md](THREAT_REVIEW.md) maps all twenty requested threats to implementation and regressions: password failures; corruption; metadata tampering; KDF exhaustion; versions; obsolete operations; cross-tab vault changes; export/import locks; consent; duplicates; chain confusion; logs; filenames; storage; failed downloads; false verification; sole-copy loss; correlation; and offline authority.

Three separate workers performed repository/provenance review, crypto/offline review, and lifecycle review. The independent final source reviewer found no additional feature blocker in the pinned runtime diff and independently passed fourteen focused selection/download/atomicity cases. The crypto reviewer independently cleared the final five-file test correction; its exact diff SHA-256 is `8bcd9f34f4c972d187e2aa5b962d93308d706f8a1ff27fa4326aa7031fe9d92a`.

These reviews use the Caveman investigate-first approach and the repository security-invariant/package-map instructions. They do not represent separate human audits or vendor certification.

## Executed validation

### Local and independent checks

| Check | Actual result and scope |
| --- | --- |
| Full ux-vault original coverage | 353/353, ten files, no skips; statements 97%, branches 94.24%, functions 99.5%, lines 98.89%. Original thresholds passed. Node 22.23.5, serialized retry. |
| Full core-crypto original coverage | 76/76, ten files; statements 98.5%, branches 98.16%, functions 100%, lines 98.21%. Original thresholds passed. |
| Standalone recovery, final source | 22/22, no skips; all five formats, tampering/bounds, independent fresh-directory recovery, archive authority, omitted-payment master derivation and error cleanup. |
| Independent raw-key authority | 1/1 with `REQUIRE_ANVIL=1`, pinned Foundry 1.8.5; address match and accepted synthetic transfer on loopback. |
| Lifecycle review | 104 unique passing cases across seven files after a targeted correction. The broad invocation was 103 pass/1 selector failure; corrected verification file then passed 14/14. This is not described as a single all-green invocation. |
| Independent final source reviewer | 14/14 across selection, download and atomicity, Node 24.22.1; overlapping focused evidence, not fourteen additional distinct tests. |
| Final atomicity fixture | 4/4 after receiver binding, Node 22.23.5, one worker. |
| Combined feature regression selection before promise synchronization | **156/156 across all 13 export/recovery/session/vault test files**, no failures or skips, local `7d99c223`; 33.303 seconds, Node 22.23.5, original assertions. Focused run with coverage disabled; full coverage gates remain separate. |
| Final promise-synchronized verification / combined selection | **14/14** in the verification file and **156/156** across the same 13 files; the 14 are included in the 156. Node 22.23.5, one worker, real crypto retained, reviewed test blob `1488d51d`. Source subsequently committed as local `8461dbdf`; exact file hashes accompany the runs. |
| Browser discovery after selector fixes | 16 tests in three files, exit zero; discovery itself is not browser execution. |
| Catalog checking | Four catalogs, zero errors, 572 warnings; no suppression or false translation approval. |
| Canonical message extraction | 2,285 used, zero missing, 139 unused. Optional fail-on-unused had failed on pre-existing unused messages; canonical command passed. |
| Secret scan, action pins and source/docs whitespace | Passed; 113 action references checked. Raw evidence logs intentionally retain original trailing spaces/blank lines; unrestricted diff checking reports those log artifacts. No gate/configuration was changed. |
| Local full web coverage | Exit 1: 2,905 passed, 13 skipped; four workers received SIGKILL before completion. Partial coverage exceeded thresholds but the invocation failed; it is not a passing coverage gate. |

### First hosted candidate: published 82f909eb

[CI run 44418861275](https://github.com/djshellshoxxx/GhostPay/actions/runs/44418861275) executed the exact local `58995408` tree through the synthetic merge identified above.

| Hosted check | Result |
| --- | --- |
| All-workspace typecheck | Passed, including web and ux-vault. |
| ts-check | Passed: source builds, catalog checks and `npm audit --omit=dev --audit-level=high`; production audit found zero vulnerabilities. |
| Clean npm install | Passed. Installation reported 17 low-severity findings in the complete dependency graph; this is not a full zero-vulnerability audit claim. |
| Full Chromium suite | 82 passed, 4 failed, 1 skipped. All eight Spec 18 cases passed; three legacy backup selectors failed; the separate hostile-text test aborted navigation. |
| Lean Chromium suite | 71 passed, 3 failed, 3 skipped. All eight Spec 18 cases passed; two legacy backup selectors failed; the same hostile-text navigation failed. |
| [Pages build and artifact checks](https://github.com/djshellshoxxx/GhostPay/actions/runs/44418861209/job/135206356708) | Passed: source libraries rebuilt, 95/95 Pages tooling tests, app typecheck/build, bundle scan and site verification. |
| [Pages artifact on Anvil](https://github.com/djshellshoxxx/GhostPay/actions/runs/44418861209/job/135206357114) | 9 passed, 1 failed, 6 not run; failed at the same legacy Verify backup selector. |
| Full typed lint | Failed: three new test issues corrected in the next commit; one unchanged chain-adapter fixture issue remains inherited. |
| rest-0 tests | 247 passed, 3 failed, zero skipped in the failing Node test section. Failures are unchanged map/dependency-owner gates, detailed below. |
| rest-2 tests | Passed, including the vault workspace. |
| Full web unit/coverage job | Cancelled while Unit tests were running; no completed full-web result from this run is claimed. Corrected-source execution is separate. |
| [Beta acceptance](https://github.com/djshellshoxxx/GhostPay/actions/runs/44418861092) | Passed (library, CLI and browser on Anvil). |
| [Hosting kit](https://github.com/djshellshoxxx/GhostPay/actions/runs/44418861163) | Both jobs passed. |
| [CLI qualification](https://github.com/djshellshoxxx/GhostPay/actions/runs/44418861291) | Ubuntu, macOS and Windows jobs passed. |
| Contracts | Tests, coverage, static analysis, Slither and configured extra contract jobs passed. No contract source was changed. |
| Secrets and egress | Passed. |
| Publishing and deployment | Skipped. |

The eight Spec 18 browser cases cover public/encrypted/raw export and exact-file retention verification; blocked-download retry; credential requirements without a vault; fresh-session opening and wrong password; mobile verify-only malformed/public rejection; requests/console/URL/history/storage/IndexedDB/clipboard leakage checks; idle-lock cancellation; and wiping while the master KDF runs.

These are Chromium automated checks. Emulated viewports do not establish native mobile-browser, hardware-wallet, screen-reader or third-party-wallet compatibility. The broader accessibility jobs also report incomplete rules; zero automated violations is not a complete accessibility certification.

### Corrected candidate: published b536b1c5

The final test-only correction preserves runtime source and adds no gate relaxation. Hosted jobs checked out merge `3177702f25d36a54e24837f69175b4787ecc04a5`; an independent Git fetch verified its tree equals the local `7d99c223` and remote `b536b1c5` tree `142627469a1c2a28f910283425d774e0d9c53b42`.

- [Pages build](https://github.com/djshellshoxxx/GhostPay/actions/runs/44420520708/job/135211940688): passed, including clean installation, source library rebuilds, 95/95 tooling tests, app build and artifact verification.
- [Pages artifact on real Anvil](https://github.com/djshellshoxxx/GhostPay/actions/runs/44420520708/job/135211939647): **16/16 passed**, no failures or skips. The earlier legacy-selector failure is resolved.
- Attestation, deployment and post-deployment steps were skipped.

| Corrected-source check | Actual result |
| --- | --- |
| [Full Chromium](https://github.com/djshellshoxxx/GhostPay/actions/runs/44420520704/job/135212473010) | **85 passed, 1 failed, 1 skipped**. All eight Spec 18 journeys and all repaired legacy backup cases passed. The remaining failure is the unchanged hostile-text navigation harness. |
| [Lean Chromium](https://github.com/djshellshoxxx/GhostPay/actions/runs/44420520704/job/135212473168) | **73 passed, 1 failed, 3 skipped**. All eight Spec 18 journeys and both repaired core backup cases passed. The remaining failure is the same inherited navigation harness. |
| [All-workspace typecheck](https://github.com/djshellshoxxx/GhostPay/actions/runs/44420520704/job/135212473041) | Passed. |
| [Build, catalog and production audit](https://github.com/djshellshoxxx/GhostPay/actions/runs/44420520704/job/135212473061) | Passed. |
| [Typed lint](https://github.com/djshellshoxxx/GhostPay/actions/runs/44420520704/job/135212472929) | No web or ux-vault lint errors. Overall job failed only on the unchanged chain-adapter rejecting mock; all three new test errors are resolved. |
| [rest-0](https://github.com/djshellshoxxx/GhostPay/actions/runs/44420520704/job/135212473161) | Same three inherited map/dependency-owner failures; failing Node section 247 passed, 3 failed, no skips. |
| [Beta acceptance](https://github.com/djshellshoxxx/GhostPay/actions/runs/44420520905) | Passed. |
| [CLI qualification](https://github.com/djshellshoxxx/GhostPay/actions/runs/44420521029) | Ubuntu, macOS and Windows passed. |
| [rest-2 / ux-vault](https://github.com/djshellshoxxx/GhostPay/actions/runs/44420520704/job/135212473116) | Passed. Vault 353/353, no skips, original coverage 97% statements / 94.24% branches / 99.5% functions / 98.89% lines. Other workspaces in the shard have five existing skips (external-pools one, payer-sponsor four). |
| [Full web unit/coverage](https://github.com/djshellshoxxx/GhostPay/actions/runs/44420520704/job/135212473022) | **2,998 passed, 2 failed, 1 skipped**; both failures are new verification UI tests whose default one-second DOM polling expired while real cryptography was pending. No worker errors. Coverage summary and subsequent nocov suite did not run. A test-only synchronization repair is required; this is not an accepted final feature gate. |


### Final real-operation synchronization candidate: published 07a7497d

The full-web run exposed a real test synchronization defect: both real-crypto UI assertions started Testing Library's one-second DOM polling deadline while verification was still pending. The tests now observe the component's actual verification Promise through a call-through spy and await that exact Promise inside React `act`. The wrong-password case additionally requires its real rejection. All original DOM, announcement, custody and disclosure assertions remain. No KDF, timer, timeout, workflow or runtime setting changed.

The independent crypto reviewer cleared test-file SHA-256 `1ecbf2fb1b1ee9321f8b72e1d5e9c9a45b2c8b5a932cdd760240df637b3e476d` and diff SHA-256 `a36c8f7c6a7ee5625183d17b5824cbd38574fc860947fefa711c8da643a2855f`. Local verification passed 14/14 and the full focused selection passed 156/156. The final hosted web job in [CI 44423317037](https://github.com/djshellshoxxx/GhostPay/actions/runs/44423317037) **passed**, including both previously failing cases and all fourteen verification tests. The original coverage thresholds and subsequent separate nocov suite both executed and passed.

| Final-source check | Actual result |
| --- | --- |
| [Full web unit/coverage](https://github.com/djshellshoxxx/GhostPay/actions/runs/44423317037/job/135221701253) | **3,000 passed, 1 skipped**, 221 files passed and one skipped; 645.22 seconds. Coverage: **93.31% statements / 89.52% branches / 95.06% functions / 97.04% lines**, passing the unchanged 90/85/90/90 thresholds. The sole skip is an existing BTC regtest case. The separate nocov phase also passed **3/3**, 12.72 seconds. No worker errors or failed assertions. |
| [Full Chromium](https://github.com/djshellshoxxx/GhostPay/actions/runs/44423317037/job/135221700941) | **85 passed, 1 failed, 1 skipped**. All eight Spec 18 journeys passed. Only the inherited hostile-text navigation harness failed. |
| [Lean Chromium](https://github.com/djshellshoxxx/GhostPay/actions/runs/44423317037/job/135221701169) | **73 passed, 1 failed, 3 skipped**. All eight Spec 18 journeys passed. Only the same inherited navigation harness failed. |
| [Pages build](https://github.com/djshellshoxxx/GhostPay/actions/runs/44423317214/job/135221639687) | Passed, including 95/95 tooling tests, clean installation, source builds and artifact verification. |
| [Pages browser on Anvil](https://github.com/djshellshoxxx/GhostPay/actions/runs/44423317214/job/135221640221) | **16/16 passed**, no failures or skips. Attestation, deployment and post-deployment steps were skipped. |
| [All-workspace typecheck](https://github.com/djshellshoxxx/GhostPay/actions/runs/44423317037/job/135221700874) | Passed. |
| [Vault / rest-2](https://github.com/djshellshoxxx/GhostPay/actions/runs/44423317037/job/135221701273) | Passed. Vault **353/353**, ten files, no skips; 145.08 seconds. Original coverage **97% statements / 94.24% branches / 99.5% functions / 98.89% lines**. Five existing skips remain in other workspaces in this shard. |
| [Core crypto](https://github.com/djshellshoxxx/GhostPay/actions/runs/44423317037/job/135221701208) | **76/76 passed**, ten files, no skips; 39.50 seconds. Coverage **98.5% statements / 98.16% branches / 100% functions / 98.21% lines**. |
| [Typed lint](https://github.com/djshellshoxxx/GhostPay/actions/runs/44423317037/job/135221701031) | Web and ux-vault passed; overall job failed only on the unchanged chain-adapter `require-await` error. |
| [Build, catalog and production audit](https://github.com/djshellshoxxx/GhostPay/actions/runs/44423317037/job/135221701147) | Passed; four catalogs, zero errors, 572 warnings; production audit found zero vulnerabilities. Clean installation reported 17 low-severity findings across the complete dependency graph. |
| [rest-0](https://github.com/djshellshoxxx/GhostPay/actions/runs/44423317037/job/135221701284) | Failing Node section **247 passed, 3 failed, 0 skipped**; the same inherited package-map and two dependency-owner checks. |
| [Beta acceptance](https://github.com/djshellshoxxx/GhostPay/actions/runs/44423317133) | Passed. |
| [CLI qualification](https://github.com/djshellshoxxx/GhostPay/actions/runs/44423317411) | Ubuntu, macOS and Windows passed. |
| [Hosting kit](https://github.com/djshellshoxxx/GhostPay/actions/runs/44423317156) | Passed. |
| [Secrets and workflow pins](https://github.com/djshellshoxxx/GhostPay/actions/runs/44423317037/job/135221638981) | Passed, including 113 action references pinned to full SHAs. |

The final code-candidate jobs are terminal. Overall CI remains failed because of the inherited lint, package-map/dependency-owner and browser-harness failures listed below. The final documentation/evidence commit changes no implementation, test, dependency or workflow byte; it does not convert the inherited failures into passed gates.

## Failed and restricted attempts retained

- Two clean local offline `npm ci --ignore-scripts` attempts exited 137. Dependency preparation reused installed trees only after lockfile and workspace manifest byte equality was checked; workspace links resolve within this isolated checkout. Hosted clean installation subsequently passed.
- The first vault coverage invocation ended with two SIGKILL workers, 262 collected tests passing and incomplete coverage below thresholds. The unchanged-threshold serialized retry passed all 353. The kill cause was not established.
- The local full web coverage run finished with 2,905 passes, 13 skips and four SIGKILL worker errors (TagArchive, Pay, BTC Esplora and ReconciliationLedger). It exited 1 after 1,000.145 seconds. Partial coverage was 91.16% statements, 86.83% branches, 93.27% functions and 94.86% lines; these numbers do not turn an incomplete run into a pass. The run began at local 58995408; the receiver-binding-only atomicity fixture repair was made while it was running. The start-time HEAD is therefore not proof that every test file was read from one immutable tree. Corrected hosted execution remains the immutable candidate check.
- Local whole-web typecheck attempts at small heap limits were killed or explicitly exhausted V8 memory. A larger serialized run completed and reported eight test typing errors; these were corrected. The subsequent local run was killed without diagnostics. Hosted whole-workspace typechecking passed local `58995408` / published `82f909eb`. The killed local records identify the then-current Git HEAD, and some included uncommitted fixture repairs; their HEAD/tree fields are not proof of an immutable tested worktree. None is counted as successful exact-source validation.
- Local scoped typed ESLint was killed without diagnostics. Hosted lint supplied actual actionable test errors, which were repaired without disabling rules.
- Local Chromium aborted before any application assertion at `chrome/browser/process_singleton_posix.cc:297`: `socket() failed: Operation not permitted (1)`. No sandbox or access-control bypass was used. Hosted browser execution supplies the actual acceptance evidence.
- An early verification regression expected the wrong retry label and failed. The expectation was corrected to the implemented user-facing label, then all fourteen tests in that file passed.
- The first hosted selector failures remain recorded as failures, not retrospectively relabelled passes.

## Remaining integration and release limits

1. **Dependency-owner closure gates remain red.** Unchanged base inputs introduce `@ghostpay/hygiene` and `@ghostpay/metadata-hardening` into the web closure, and `@ghostpay/metadata-hardening` into the relayer closure, outside the gate's reviewed/pending lists. Owner review is required; deleting manifest entries or expanding lists simply to pass would not resolve the review.
2. **The generated package map is stale in the base.** The map, generator, test and manifests are unchanged by this feature. Regeneration belongs in the integration scope.
3. **The chain-adapter lint fixture is inherited.** `payments.bulkCancellation.test.ts` has an `async` rejecting mock without an `await`, triggering `require-await`. Its blob is identical at base and candidate. No unrelated source was changed to hide that failure.
4. **The hostile-text browser harness aborts fresh navigation.** Its dialog handler dismisses the legitimate sole-copy `beforeunload` prompt. The test, fresh-navigation helper and AppShell guard are unchanged from the base. The original XSS assertions were neither removed nor weakened.
5. **Full release qualification remains open.** A successful Slither job does not clear historical Mythril findings or establish a new CodeQL result. This task does not claim an executed full release/security matrix where no current evidence exists. Main merge and deployment remain unauthorized.
6. **Support boundaries remain explicit.** Only the existing scheme-1 EVM EOA export path is in scope. Generic wallet import instructions are not certification of a particular wallet. Bitcoin, policy, contract-account and delegated-account recovery are outside this feature. Non-English security-message translations still require review.

Final feature acceptance is supported by the completed corrected-source checks above. Full product release remains blocked by the inherited gates; native-device, named-wallet and additional-account support are not implied by this acceptance.

## Reproduction and handoff

Use Node 22 with the repository lockfile, build workspace libraries through the existing scripts, then run the repository's original checks. The evidence files retain exact commands, source hashes, exit results and versions. Focused checks do not replace original coverage or browser gates.

Relevant commands include:

```sh
npm ci --ignore-scripts
npm run typecheck
npm run lint
npm test
node --test scripts/recovery/stealth-export-recover.test.mjs
REQUIRE_ANVIL=1 node --test scripts/recovery/raw-key-anvil.test.mjs
npm run test:e2e -w @ghostpay/web
node scripts/i18n/check.mjs
node scripts/i18n/extract.mjs
```

Use the workflow-pinned Foundry toolchain and the repository's browser/devnet scripts for their respective matrix entries. Recovery script commands and required two-library standalone setup are in [the user guide](../../user/recover-stealth-payment-keys.md). Byte-level authentication, bounds and schemas are in [the format reference](../../specs/18-stealth-keypair-export-formats.md).

Changed files are listed in the final evidence manifest and PR diff. Product changes are confined to the export/recovery components, their helper/session transaction, portable-codec cleanup, standalone reader, localization and directly relevant tests/docs. Evidence artifacts contain synthetic tests and public CI output, never real wallet material.

The PR remains reviewable and stacked on #238. The original concurrent branch and all unrelated working trees are preserved.
