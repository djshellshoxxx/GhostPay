# Manual invoice registration-time cleanup — 2026-11-21

## Disposition and exact source

The bounded persistent cleanup implementation is complete and locally verified. A fresh independent source review identified no functional blocker; its one whitespace finding has been corrected and independently rechecked. This slice removes only `RegisteredInvoice.registeredAt`. Broader v1.1 retention and M3 remain partial. Exact published native/browser CI, parent integration, formal review requirements and the shared integration lease remain gates before qualified integration. This worker made no remote ref, lock, main, deployment, release or funds change.

| Role | Exact identity |
|---|---|
| Assigned recovery base | `783231a46840cd869e39bd704751d4ab4c349c45`, tree `65e5cc6fdb7ab3337951ba0b0b58e87b71df095b` |
| Public parent mapping at assignment | PR #372 source `055d33e042c63edf1d5bbbdd7833d3c1ef93733d` was tree-equivalent to the recovery base; the coordinator must refresh live state before integration. |
| Ownership claim | `a101f8a36036104fbfc92cd011fae4f26ec80375` |
| Product implementation | `16204479269401403e869fda79ecfe405321ea7e` |
| Browser concurrency acceptance follow-up | `8cf505bae569fb2e8e3400a1489630991b71fa54`, tree `7cd2ccd97abb3808db44ac253da7a6e0e45f2ec2` |
| Whitespace-only qualification tip | `8a4f2775386b1710a086ca340287e7481c59dd0e`, tree `bec41c9c8e517d2619cb847f780cfe36f092f1ff` |
| Worker branch | `feature/ghostpay-invoice-timestamp-retention-20261121-5ceb` |

All package, application, unit-test and catalog blobs are identical from the product commit through the qualification tip. The test follow-up changes only the newly added browser spec; the qualification follow-up removes exactly one surplus final newline from `docs/ai/ACTIVE_WORK.md`. Every gate below records its actual source. This handoff adds documentation only; its containing commit is recorded in the external packet to avoid a self-referential hash.

## Implemented behavior and preservation

Registration v1 still requires a positive numeric local timestamp. Registration v2 explicitly uses `registeredAt: null` and is accepted only inside document v4. The encrypted envelope and existing HKDF/AES-GCM seller/chain binding remain v1. Document versions 1–3 remain readable; ordinary legacy writes retain v3. Reads, preview, cancellation and zero-count approval do not create or rewrite a vault. Unknown formats and saturated/read-only safety state preserve bytes and reject cleanup.

The preview exposes only category/count and retains encrypted snapshot text, not plaintext invoice rows. Confirmation consumes its opaque identity before awaiting work, verifies exact ciphertext and current handle/session/seller/chain authority, then makes one guarded compare-and-swap. It never retries against an intervening write. The actual ledger adds separate default-off consent for each mounted unlocked scope. Consent withdrawal, cancellation, quick-hide, lock and session/scope replacement revoke approval or pending action authority.

Complete invoices, observations, receipts, identity/amount fields, original invoice times, receipt times, reorg cutoffs/tombstones, keys and unrelated stores remain intact. Tests independently decrypt the saved document and compare it exactly apart from the intended format/registration-time changes, and verify identical matching/payment summaries. Existing local redaction survives duplicate registration, older-backup import, new-backup transfer and reload. Newly imported rows retain their metadata until fresh explicit cleanup. Older backup copies outside the current vault are unchanged; later explicit deletion of the complete registration is a separate existing operation. No deletion-history collection was added.

Ten messages are security-classified in all four catalogs. Existing entries remain unchanged; non-English catalogs retain the existing source-English fallback/review status. The UI explains that older GhostPay versions cannot open the updated v4 vault. No timer, provider/RPC, origin wipe, new sensitive collection, dependency, contract or wallet/Sweep/policy journal change was introduced.

## Executed qualification

The original full vault suite passed **369/369** across 12 files. The original full web coverage suite passed **4,413** tests, with **13 pre-existing skips**, across 320 passing and two skipped files; no tests failed. Its one-worker duration was 1,825.101 seconds. The prescribed non-coverage web pass passed **4/4** across four files. All original thresholds and assertions remain intact.

| Coverage | Statements | Branches | Functions | Lines |
|---|---:|---:|---:|---:|
| Vault actual | 97.05% | 94.37% | 99.75% | 98.91% |
| Vault unchanged minimum | 95% | 90% | 95% | 95% |
| Web actual | 93.53% | 90.44% | 95.59% | 97.30% |
| Web unchanged minimum | 90% | 85% | 90% | 90% |

The 13 skipped tests are existing live Anvil/contract or Bitcoin regtest fixture groups; they were not executed or counted as passes. Browser collection likewise is not execution. Test commands overlap and must not be added into a unique global total.

Affected TypeScript, including the CLI consumer of the portable API, ESLint, the vault package build and full/lean web builds all passed. Both web builds ran the existing CSP and bundle scanners. The CSP helper reported the existing default broad connect-src because `GHOSTPAY_CONNECT_ORIGINS` was unset; these local builds do not qualify a restrictive production endpoint policy. Static artifact SHA-256 inventories are retained. This is not a signed or reproducible release claim.

Committed-secret, action SHA-pin and tx.origin scans exited zero. `npm audit --json --audit-level=high` exited zero with **17 low** findings and **zero moderate/high/critical** findings. Dependencies and lockfile are unchanged; no automatic dependency mutation was applied. Node was `v24.22.3`, npm `11.19.1`. This worker installed its own exact-lock dependencies with `npm ci --ignore-scripts` and did not mutate a shared dependency symlink.

The following table and command list are generated from completed receipts, with actual workdir/source, duration, exit and raw-log hash.

| Check | Result | Source | Duration |
|---|---|---|---|
| final-package-coverage | 369 passed; 0 failed; 0 skipped | `16204479269401403e869fda79ecfe405321ea7e` | 258.591 s |
| final-web-coverage | 4413 passed; 0 failed; 13 skipped | `8cf505bae569fb2e8e3400a1489630991b71fa54` | 1825.101 s |
| final-web-nocov | 4 passed; 0 failed; 0 skipped | `8a4f2775386b1710a086ca340287e7481c59dd0e` | 27.005 s |
| final-ux-vault-build | exit 0 | `8a4f2775386b1710a086ca340287e7481c59dd0e` | 1.239 s |
| final-typecheck | exit 0 | `8a4f2775386b1710a086ca340287e7481c59dd0e` | 25.861 s |
| final-lint | exit 0 | `8a4f2775386b1710a086ca340287e7481c59dd0e` | 45.241 s |
| final-web-build-full | exit 0 | `8a4f2775386b1710a086ca340287e7481c59dd0e` | 20.865 s |
| final-web-build-lean | exit 0 | `8a4f2775386b1710a086ca340287e7481c59dd0e` | 20.325 s |
| final-secrets | exit 0 | `16204479269401403e869fda79ecfe405321ea7e` | 0.162 s |
| final-actions | exit 0 | `16204479269401403e869fda79ecfe405321ea7e` | 0.165 s |
| final-tx-origin | exit 0 | `16204479269401403e869fda79ecfe405321ea7e` | 0.156 s |
| final-dependency-audit | exit 0 | `16204479269401403e869fda79ecfe405321ea7e` | 16.215 s |
| final-browser-collection-followup | 2 collected; 0 executed | `8cf505bae569fb2e8e3400a1489630991b71fa54` | 1.277 s |
| final-source-contract-followup | exit 0 | `8cf505bae569fb2e8e3400a1489630991b71fa54` | 0.175 s |
| final-diff-check | exit 0 | `8a4f2775386b1710a086ca340287e7481c59dd0e` | 0.036 s |
| full-artifact-digests | exit 0 | `8a4f2775386b1710a086ca340287e7481c59dd0e` | 0.244 s |
| lean-artifact-digests | exit 0 | `8a4f2775386b1710a086ca340287e7481c59dd0e` | 0.03 s |
| final-product-equivalence | exit 0 | `8a4f2775386b1710a086ca340287e7481c59dd0e` | 0.003 s |
| review-whitespace-resolution | exit 0 | `8a4f2775386b1710a086ca340287e7481c59dd0e` | 0.076 s |

## Exact commands

- **final-package-coverage** — cwd `/workspace/scratch/5ceb6203640a/GhostPay-invoice-retention/packages/ux-vault`; `node ../../node_modules/vitest/vitest.mjs run --coverage --maxWorkers=1`. Raw log `final-package-coverage.log`; SHA-256 `27bf0dfac2dc906b7b32a4fcf82df41a96930921e3f834490220808ee8d5f034`.
- **final-web-coverage** — cwd `/workspace/scratch/5ceb6203640a/GhostPay-invoice-retention/apps/web`; `node ../../node_modules/vitest/vitest.mjs run --coverage --maxWorkers=1`. Raw log `final-web-coverage.log`; SHA-256 `bd18346e2900e3c050edd388b270227968fbfa2e2a2bcb38b1a0d99cd13cb075`.
- **final-web-nocov** — cwd `/workspace/scratch/5ceb6203640a/GhostPay-invoice-retention/apps/web`; `node ../../node_modules/vitest/vitest.mjs run --config vitest.nocov.config.ts --maxWorkers=1`. Raw log `final-web-nocov.log`; SHA-256 `8d96880053bbf09e58fa10d50afa8f2e89b7d2b20f50c63f51281023a78e326a`.
- **final-ux-vault-build** — cwd `/workspace/scratch/5ceb6203640a/GhostPay-invoice-retention`; `npm run build --workspace @ghostpay/ux-vault`. Raw log `final-ux-vault-build.log`; SHA-256 `893af1dd4f613c40fd51b3aa185370466ca550fdf626a7361d24c9422b38c22b`.
- **final-typecheck** — cwd `/workspace/scratch/5ceb6203640a/GhostPay-invoice-retention`; `npm run typecheck --workspace @ghostpay/ux-vault --workspace @ghostpay/web --workspace @ghostpay/cli`. Raw log `final-typecheck.log`; SHA-256 `5ee8f2bd70b182f7b5470c533447643369505a0a316a40a42cab86d6fbb209a3`.
- **final-lint** — cwd `/workspace/scratch/5ceb6203640a/GhostPay-invoice-retention`; `npm run lint --workspace @ghostpay/ux-vault --workspace @ghostpay/web`. Raw log `final-lint.log`; SHA-256 `bdc6f46d75021f3c511da1307373ba8faa1fd6fe635ffcda8e9671f53c9dc3e3`.
- **final-web-build-full** — cwd `/workspace/scratch/5ceb6203640a/GhostPay-invoice-retention`; `env GHOSTPAY_LOCAL_BUILD_PROFILE=full npm run build --workspace @ghostpay/web`. Raw log `final-web-build-full.log`; SHA-256 `5ad5d888d4bc8f29ef9410f3bfce2c7c4ce6ea796f2e215b7bc9d7c46255c3a8`.
- **final-web-build-lean** — cwd `/workspace/scratch/5ceb6203640a/GhostPay-invoice-retention`; `env GHOSTPAY_LOCAL_BUILD_PROFILE=lean npm run build --workspace @ghostpay/web`. Raw log `final-web-build-lean.log`; SHA-256 `88780dd591dd00f75b8e8da9322060829df69500c56ce954105076b0ce505e1e`.
- **final-secrets** — cwd `/workspace/scratch/5ceb6203640a/GhostPay-invoice-retention`; `bash scripts/scan-secrets.sh`. Raw log `final-secrets.log`; SHA-256 `c640ecf2e70ce55408b18915d1790def402b4b4d88dc9ae00204f43a55f7ba47`.
- **final-actions** — cwd `/workspace/scratch/5ceb6203640a/GhostPay-invoice-retention`; `bash scripts/check-actions-pinned.sh`. Raw log `final-actions.log`; SHA-256 `5ce60b1b7ae2628be29123af63f33de0efc71e32733c56b08be8d11e1edca152`.
- **final-tx-origin** — cwd `/workspace/scratch/5ceb6203640a/GhostPay-invoice-retention`; `bash scripts/check-tx-origin.sh`. Raw log `final-tx-origin.log`; SHA-256 `9d95acfba60449e36d81229c0ba5dbd3bd203e219648a67840da7ff16797dd25`.
- **final-dependency-audit** — cwd `/workspace/scratch/5ceb6203640a/GhostPay-invoice-retention`; `npm audit --json --audit-level=high`. Raw log `final-dependency-audit.log`; SHA-256 `a17277d7488032dd38b8d425d36a3832c72b4b3b665510c4e1f3090c662f17b1`.
- **final-browser-collection-followup** — cwd `/workspace/scratch/5ceb6203640a/GhostPay-invoice-retention/apps/web`; `node ../../node_modules/@playwright/test/cli.js test e2e/invoice-timestamp-retention.spec.ts --list`. Raw log `final-browser-collection-followup.log`; SHA-256 `d2974e784e20fd1aea26e0278daa7bb234c5abaa2e993d0a6a0358579fde455d`.
- **final-source-contract-followup** — cwd `/workspace/scratch/5ceb6203640a/GhostPay-invoice-retention`; `python /workspace/scratch/5ceb6203640a/invoice-timestamp-retention-evidence/verify_source_contract.py`. Raw log `final-source-contract-followup.log`; SHA-256 `1dce865ad89003358ba5dc74abd243b1c7741ba104aac5a7f77ed2fcdff186bc`.
- **final-diff-check** — cwd `/workspace/scratch/5ceb6203640a/GhostPay-invoice-retention`; `git diff --check 783231a46840cd869e39bd704751d4ab4c349c45...HEAD`. Raw log `final-diff-check.log`; SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
- **full-artifact-digests** — cwd `/workspace/scratch/5ceb6203640a/GhostPay-invoice-retention`; `python /workspace/scratch/5ceb6203640a/invoice-timestamp-retention-evidence/snapshot_build.py full`. Raw log `full-artifact-digests.log`; SHA-256 `32eaf47d547654cfc2e0a3ffd772ad91911d925c33e9285b3f51c745f0760e16`.
- **lean-artifact-digests** — cwd `/workspace/scratch/5ceb6203640a/GhostPay-invoice-retention`; `python /workspace/scratch/5ceb6203640a/invoice-timestamp-retention-evidence/snapshot_build.py lean`. Raw log `lean-artifact-digests.log`; SHA-256 `6a2ff79244f9996f026bc2ef67b1b920b8a7c42ec399d79a6b2e4eeee3a94d51`.
- **final-product-equivalence** — cwd `/workspace/scratch/5ceb6203640a/GhostPay-invoice-retention`; `git diff --exit-code 16204479269401403e869fda79ecfe405321ea7e HEAD -- packages/ux-vault apps/web/src apps/web/locales`. Raw log `final-product-equivalence.log`; SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`.
- **review-whitespace-resolution** — cwd `/workspace/scratch/5ceb6203640a/GhostPay-invoice-retention`; `python /workspace/scratch/5ceb6203640a/invoice-timestamp-retention-evidence/verify_review_fix.py`. Raw log `review-whitespace-resolution.log`; SHA-256 `e0ef1948bbbf5e73802b1e4667c5d12ca6225477803471b79047e0ff4d7ca79a`.


## Independent review and preserved corrections

Fresh reviewer `/root/invoice_retention_independent_review` reviewed exact `8cf505bae569fb2e8e3400a1489630991b71fa54` and independently passed **158 cases across 12 files** (34 package and 124 web), with zero failures/skips. It collected both browser cases and executed neither. Its structural review verified the protected symbols, original assertions, catalog entries and gate files. This is a local independent review, not formal GitHub approval or an external cryptographic audit.

The review's sole finding, `RET-REVIEW-01`, was the extra final blank line in the ownership ledger. Commit `8a4f2775386b1710a086ca340287e7481c59dd0e` removes exactly that one byte. After the author's byte and baseline-diff verification, coordinator `/root` independently wrote and ran a separate verifier: only `ACTIVE_WORK.md` changed, its old bytes equal its new bytes plus one LF, all other tracked bytes are identical, and the baseline diff check exits zero. The finding is resolved. Receipt `independent-review/root-docs-delta-review.json` has SHA-256 `539f32b477486d86319d7e5618972129a69c2fbb845f272629a6f1ba1282251e`. The original failed independent receipt remains preserved. No duplicate test execution or formal approval is inferred from this documentation check.

All earlier failures remain in the packet. The first focused web invocation could not resolve an unbuilt workspace package; building the pinned libraries corrected the prerequisite. The first ready focused run had 62 passes and two failures because new selectors used `Cancel` instead of the existing `Cancel cleanup` label; the corrected selection passed 65/65. Initial TypeScript found the missing required `PrivacyProvider.scope` in a new fixture. Initial lint found five unnecessary test assertions; explicit query generics preserve the same checks. No gate, timeout, assertion or coverage threshold was weakened.

## Native acceptance and next actions

Two browser journeys use real static UI, deterministic public unfunded fixture keys, native encrypted backup inspection and blocked foreign requests. They cover cleanup/import/reload with default-off consent, and a second tab registering an invoice after preview while stale approval must preserve both rows and the exact ciphertext. Both collect successfully. Local execution was unperformed because the browser executable restriction had already been established; no repeated blocked launch was used as evidence. Native engines, mobile viewports, Tor and wallet behavior are not inferred from jsdom or collection.

The coordinator should refresh the live parent PR and branch heads, publish this isolated candidate through the existing integration sequence, and obtain exact-source hosted full/lean/native results. Keep parent dependencies, formal review/approval requirements and the unreconciled shared integration lease in force. No direct-to-main shortcut is authorized by this packet.

Automatic persistent retention, other metadata fields including receipt archive time, terminal-record cleanup, reviewed non-English security copy and overall release qualification remain open. This slice preserves protected financial/security records and does not advertise refunds or guaranteed recovery.

The companion JSON carries the machine-readable source mapping, complete execution receipts and review mapping. Raw logs, LCOV, field-contract input, independent review, static artifact digests, a verified incremental git bundle and portable patch series are outside the worktree at `/workspace/scratch/5ceb6203640a/invoice-timestamp-retention-evidence`. The bundle prerequisite is recovery commit `783231a46840cd869e39bd704751d4ab4c349c45`; the patch series also records original commit provenance. The external SHA-256 inventory and final packet record the final documentation commit and artifact integrity.
