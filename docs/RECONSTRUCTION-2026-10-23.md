# Local reconstruction: 2026-10-23

This is expressly authorized reconstruction from the current remote baseline. Missing commits
`b9ac0c24bea625d69ed2857460da29b7edd3ba27` and `6b698af62278aef802f58699f8f99bf68b87aaae`
are not recovered or represented by the new changes. Earlier test claims do not count as fresh evidence.

**Publication update — 2026-10-24 01:13 UTC:** the user explicitly authorized regular GitHub source checkpoints for both projects. Non-default work branches may receive secret-checked source at coherent milestones; no force-push, branch overwrite, main merge, PR mutation, release/deployment or new credentials/security-setting changes. Earlier no-publication statements record the prior authorization state. Preserve unfinished work and report its test status honestly.

## Verified starting state

- Repository: `djshellshoxxx/GhostPay`; clean saved checkout initially on local `work`.
- Read-only GitHub repository, branches and open-PR queries, plus `git ls-remote` and fetch on 2026-10-23:
  main remains `dbee6786c5adf97e014318f55da4dfdbc1565cfc`; no open PRs.
- Main's direct parent is PR24 merge `ca30bf821f412f0af50b2725722b0e968e6fed12`.
  Implementation `bb011134c1bf9cd0e75090fec75d85235d637281` and PR20 integration
  `c206655ebfa747b3dd56b1dc9f4e7f16e641a833` are ancestors of main.
- All fetched source/doc branches have zero commits unique to them relative to main.
  Published `gh-pages` and prototype `claude/pages-site-1` are provenance, not integration inputs.
- Local integration branch: `integration/reconstruction-2026-10-23`, created from verified `origin/main`.
- No `AGENTS.md` in the checkout, `/workspace`, or `/` at start. Read specification index,
  scanner/payment spec 02, registry spec 06, encrypted archive spec 08, private scanning spec 10,
  relevant backup/receipt ideas, developer invariants, specification corrections, completion plan and handoff.
  Historical handoff branch and completion percentages are stale; they are not current acceptance evidence.

## Requirement-to-evidence ledger

This table records the first reconstructed safeguard tranche through frozen source `081b76b`, not exhaustive product or release completion. Later invoice-QR/wallet-discovery work is separately verified before integration.

| Requirement | Implementation/evidence | Remaining limit |
|---|---|---|
| Encrypted reconciliation and bounded exact-ciphertext CAS | HKDF/AES-GCM vault; seller/chain/session scope; native two-tab IDB/CAS tests; 737-pass web suite includes vault cases | Local storage/profile rollback or deletion cannot be detected cryptographically without an external anchor |
| Preserve legacy records as untrusted | Plaintext writer disabled; bounded untrusted read/export/delete only; legacy tests pass | Legacy records never become proof or silently enter encrypted verified history |
| Encrypted backup preview/activation and reorg tombstones | Explicit preview/apply; imported provenance untrusted; confirmed reorg invalidation and saturated read-only cap; native refresh/reorg tests | Offline source freshness is unknown; forged imported historical labels are not authority |
| Strict receipt/public-meta parsing and consent | Bounded strict schemas; receipt consent; existing payment verifier reused; registry scan only previews | Signed receipt alone never proves payment; indirect smart-wallet proof remains unverified |
| Allowlisted nonsecret settings exchange | Five allowed preferences; strict preview/explicit apply; credentials/URLs/pins/private keys excluded | Wider settings transfer requires a new reviewed schema |
| Real encrypted seller keystore transfer | Existing scrypt/AES-GCM envelope; encrypted/decrypted metadata and scalar checks; abort/session guards | Unlocked JS memory cannot promise forensic erasure |
| Camera/decrypt lifetime and real catalogs | Close/collapse/reset/unmount/scope invalidation; actual en/es/ja/ar catalogs; focused and browser regressions | Physical cameras, all UI translations, native-language and accessibility acceptance remain open |
| Final wallet/registry authority across awaits | Account/chain/net_version/provider/session/consent/invoice checks immediately before send; final-account browser zero-send test | Hostile wallet can lie consistently; final on-chain reconciliation remains required |
| Tab duplicate-attempt journal | Bounded write-ahead unknown state; no automatic expiry; explicit clear; late-hash Chromium case and post-broadcast readback regressions | Bookkeeping clear cannot retract a transaction or cancel a wallet prompt; storage failures retain typed hash-bearing outcome |
| Scanner keys and payment proof binding | Worker cancellation/wipe; deep opt-in full owner/address; payer-to-stealth ERC20; router/calldata/receipt/log chain identity and final reorg reread | Local/mock token tests are not independent live-provider acceptance |
| Sanitized failures and unsupported proofs | Fixed typed RPC errors; contradicting provider evidence rejected; 356 adapter tests including actual local Anvil reorg cases | No unsupported indirect proof is promoted to verified |
| Fresh qualification and preservation | Full required npm command: 8,082 passed/1 existing Bitcoin regtest skip; 19 Chromium E2E; normal build/bundle; local commits and verified history bundles | Independent audit blocked before intake; device/live-wallet/public launch/production ceremony gates open; no GitHub publication |

## Ordered implementation plan

**Goal:** rebuild the specified safeguards in testable local increments without claiming launch completion.
**Architecture:** reuse existing crypto, payment verifier, session and QR components. Add narrow persistence
and journal modules; keep proof authority at existing verified chain and wallet boundaries.
**Tech stack:** npm workspaces, TypeScript, React, Web Crypto, IndexedDB, Vitest, Playwright, viem.

Global constraints: no real funds or live transactions, no production deployment, no external scans, no
new credentials or paid infrastructure. Regular secret-checked non-default source checkpoints are now authorized; no PR mutations or release publication. Preserve OSS notices.
Do not reduce coverage thresholds or skip failures. Browser mocks do not establish device/audit acceptance.

Review focus: stale callbacks after scope changes; malformed/oversized data before expensive work; ambiguous
wallet outcomes; reorg evidence revived by backup; apparent proofs lacking exact chain/transaction binding.

1. [x] Verify remote state and ancestry, preserve checkout, create local integration branch.
2. [x] Observe failing regressions, then implement disjoint thin slices with four workers and one integrator.
   - Vault: `reconciliationVault`, legacy ledger, ledger component and Scan view.
   - QR: CameraImporter, keystore/session, SellerKeys, Settings, exchange parsing and four catalogs.
   - Wallet: Pay/payExec/wallet/txGuard, registry feature and duplicate-attempt journal.
   - Scanner: scanner core/client/worker and chain-adapters payment verifier.
3. [x] Integrator inspects each diff and targeted evidence; commit verified tranches locally with handoff notes.
4. [x] Freeze source edits for the first reconstructed tranche. Run library builds, workspace typecheck/lint/tests with existing thresholds,
   web build/bundle scan, local browser tests and defensive secret/action checks. Report every failure and
   unavailable capability. Fix only understood failures; repeat affected checks after changes.
5. [ ] Review the final frozen delta for security and functional regressions. Retain external acceptance gates.
6. [ ] Record exact branch/HEAD, commands, results, unresolved failures and next task in a handoff;
   create/verify complete-history bundle and SHA-256 manifest. Parent arranges authorized durable persistence.

## Execution notes

- Exactly four implementation workers plus this integrator in one active environment. Source ownership
  is disjoint; only the integrator commits. Broad tests wait for a source freeze.
- Node `v24.19.0`, npm `11.9.0`, Git and system Chromium are available. Foundry/anvil/solc are not on PATH.
- Initial `npm ci --ignore-scripts` failed because its default cache `/home/agent/.npm/_cacache`
  cannot be created. Retrying with a writable `/workspace/.npm-cache`; lockfile and integrity unchanged.
- The parent owns the continuation check for this same task, now every 30 minutes per the later user instruction.
  No extra environment task, migration or saved-setup deletion is authorized or needed.
- Later user steering assigns two existing workers to `/workspace/p2p-offramp` and two to GhostPay, with this
  shared integrator. QR/scanner workers finished their GhostPay slices and froze writes before transitioning.
- Separate recovery inspection of the other saved GhostPay setup found all 2,929 tracked files identical to
  remote main and no unique unfinished source. No recovery branch or upload was created. Reconstruction continues.

## Verified tranche: QR, settings and keystore

Integrator independently reran the worker's focused command: ten files and 78 tests passed, zero failures.
Command from `apps/web`: `npx vitest run src/views/Settings.test.tsx src/views/SellerKeys.test.tsx
src/lib/keystore.test.ts src/lib/session.test.ts src/lib/keyVault.test.ts src/components/CameraImporter.test.tsx
src/lib/settingsExchange.test.ts src/lib/qrPayload.test.ts src/i18n/catalog.test.ts
src/i18n/settings.integration.test.tsx --maxWorkers=1`.

Changes: duplicate-safe bounded keystore envelopes, decrypted-key/public-metadata consistency, independent
signing scalar, abort-aware session/key-vault import; camera/paste scope, close and disclosure cancellation;
strict public-meta parser; five allowlisted settings with preview and explicit apply. Four actual catalogs
en/es/ja/ar updated; no claim that all registered languages are translated. Broad coverage/browser gates
remain pending. Physical camera, native translation and independent audit acceptance are not established.

## Verified tranche: scanner and chain payment evidence

Fresh integrator targeted checks: `npx vitest run src/payments.test.ts --maxWorkers=1` in
`packages/chain-adapters` passed 31 tests; adapter typecheck and lint passed. Rebuilt adapter, then
`npx vitest run src/lib/scannerCore.test.ts src/lib/scanClient.test.ts --maxWorkers=1` in `apps/web`
passed 45 tests. Worker additionally ran the committed deterministic malformed-wire corpus: 1,000,000
logs in 5,000-log batches, zero throws/matches (109.80 s), and required local router anvil tests 3/3.
The broad frozen suite will rerun the corpus and required fixtures; targeted evidence is not full acceptance.

Changes bind direct-router transaction/calldata, exact receipt announcement and payer-to-stealth ERC20
Transfer, then reread the canonical block. Indirect smart-wallet calls remain unverified. A final integrator
regression demonstrated that two providers could disagree on payer while reporting identical event positions;
both new contradictory-evidence regressions failed before adding a domain-separated direct-call binding digest
and receipt sender/transaction chain consistency checks. Stable transfer consumption identity remains separate.
Worker cancellation immediately wipes/terminates; malformed constructor input is wiped; async reorg persistence
is awaited. Unexpected provider errors become fixed typed failures rather than leaking provider text.

## Verified tranches: wallet authority and encrypted reconciliation

Integrator rerun wallet/Pay/registry/journal command passed 105 tests across seven files; focused 13-file
ESLint passed. Final checks cover consent/account/chain/provider/session/expiry changes during wallet awaits,
same-invoice duplicates across payer accounts, pre-send journal durability, no automatic unknown-outcome expiry,
explicit clear and late-hash retention. Lost responses say outcome unknown; returned hashes survive session changes.
Pay receipt import requires consent and honors importer cancellation. Public-meta QR is a review-only sink;
it cannot install seller keys or publish registry data.

Integrator rerun vault/legacy/component/Scan command passed 62 tests across four files. Actual Chromium
script `GHOSTPAY_CHROMIUM=/usr/bin/chromium node apps/web/scripts/test-reconciliation-idb.mjs` passed
two-tab exact-ciphertext races, stale request-callback abort and cross-tab reorg refresh, with external egress blocked.
The vault uses HKDF/AES-GCM, bounded ciphertext/records, explicit backup preview/activation, scope/revision guards
and no plaintext document cache. Legacy plaintext is only explicitly untrusted read/export/delete.

Cross-review additionally fixed same-key session replacement, cross-tab stale rendering, final plaintext read
revocation and reorg-cap overflow. At 2,000 unique retained invalidation tombstones, further overflow commits
a persistent conservative read-only safety state before warning the user; save cannot revive omitted IDs.
Deletion/import retains that state. This capacity limit is explicit, and whole-profile deletion/rollback cannot
be detected without external authority. Known invalidated IDs remain invalid after old-backup activation;
fresh canonical live observations are preserved. Imported observations are untrusted historical data.

Final pre-suite review added explicit permanent read-only status to saturated backup previews and later
unlock, and unified action/event read generations so an old action result cannot overwrite a newer reorg
refresh. Integrator rerun of the same four files passed 67/67; actual Chromium CAS/reorg refresh rerun passed.
Source frozen afterward; dependency-ordered package build, web production build/bundle scan and committed
secret/action checks passed. Full workspace coverage/typecheck/lint and default-profile contract suites are running.
