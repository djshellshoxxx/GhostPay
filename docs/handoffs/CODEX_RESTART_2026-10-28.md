# GhostPay branch restart handoff — 2026-10-28

## Identity and local state

- Repository: https://github.com/djshellshoxxx/GhostPay
- Owned branch: `ghostpay-local-lean-boundary-20261027`.
- Role: Qualified local lean entry and artifact boundary.
- Pinned implementation/tested-or-evidence source: `405c1680fcd058cd8141e2fbd4c8d28313693d75`; tree `dea77f979c9053bcee117e45db824bc1ea9b8b5b`.
- HEAD before this document-only commit: `405c1680fcd058cd8141e2fbd4c8d28313693d75`. This new commit adds only this Markdown file. Resolve the documentation head with `git rev-parse HEAD`; it is not a newly tested application head.
- Worktree in the original executor: `/workspace/ghostpay-intake/lean-boundary`.
- Before the update: tracked clean, no untracked files, no upstream configured. After commit/push, verify `git status --short` and compare the branch with `git ls-remote --heads origin refs/heads/ghostpay-local-lean-boundary-20261027`. Final document heads are recorded in the private coordinator backup manifest.
- Exact package-lock SHA256: `2d63da8923d5eacebb4a6f3d815dc6e9656710230543ce5462d0fc1eb8b27819`.
- Tested local lean source; not integrated with newer PR37 runtime.

## Completed work and recorded evidence

Eight-path delta from a734: App/AppShell/AppLean, AppLean tests, Vite profile hook and localBuildProfile helper/declaration/tests. Full profile preserved; lean production excludes four optional view modules and two SDK public assets. Does not exclude all shared tags/fiat/buffer/embed dependencies. FocusedApp13pass; helper10pass+4externalregressions at61; types/lint/full+leanbuilds at61; browser/module/publicasset evidence at342 reused only through exact final artifact byte correspondence. Full grouped405coverage1287pass/4skip and separate archivefuzz1pass.

Ignored node_modules uses487 exact-lock links, including an @ghostpay/web link to this candidate, and other compiled workspace exports in a retained a734 repro clone. The three package dist/index.js files do not exist directly in this worktree. This linking is local setup, not a portable dependency installation or a claim about PR37 lockfile.

Recorded local lean coverage is91.25/86.58/92.65/95.19% against unchanged90/85/90/90 thresholds. The405million-log assertion usesseed0x47504d31 and1,000,000generated logs: original185.237s/180s failure retained; controlled exclusive-file-group run137.114s/180s passed, with no overlapping positive-duration files. This does not prove the original failure had only a contention cause. Four skips are one optional live-bitcoind and three anvil registry cases. No source was changed or test/build rerun for this restart note; results at other source pins are historical evidence, not results for this branch's new document head.

## Integration and ownership

PR37 last verified head is `6a3e85c084661532619d72475641732e21b7f740`, branch `claude/ghostpay-autonomous-completion-y4sk2h`. Its external security integrator retains those runtime paths. Recheck live GitHub head, dirty work and the actual writer/path map before applying anything. This coordinator owns only the separate branch named above. No active paid request, native worker or local test job remains.

The recovered branch and PR37 are not interchangeable. PR37 already has transactional vault guards/CAS delete/final payment validity and newer direct/relayed sweep journal safeguards. Private additions include seller completion/cancellation/same-file retry/actual-store refresh, honest confirmed-approval reporting, and focused recovery/payment/Worker receipt acceptance. Session/keystore/pay/payExec source matches across the inspected fixed parents. Do not reimplement matching code.

The existing merge rehearsal found13conflicts (retained evidence; not rerun): en.json, seller-vault IDB script, embedHeaders test, payExec test, sweep library/test, state.tsx, Pay view/test, SellerKeys view, Sweep view/test and nginx embed headers. It was aborted without manual runtime edits. Preserve newer journal write-before-handoff/hydration/fail-closed behavior, relayed nonce/finalized canonical expiry and explicit pre-broadcast refusal classification. Adapt private stale-attempt/session oracles under the existing sweep owner, not by replacing newer files with memory-only versions.

PR37's SDK-scoped Viem override and exact lockfile are the selected remote dependency direction. Historical84/a734 local vendor/normalizer work remains preserved, but do not overwrite that newer accepted override or claim either parent qualifies a future merge. The eight-file lean profile is already implemented and tested separately, not an unstarted feature.

## Remaining ready versus blocked

- Ready after exact ownership release: integrate paired seller fixes/oracles and approval-reporting fix/oracle; reuse existing recovery/native/browser/Worker acceptance; adapt concurrent sweep oracles to the newer journal; qualify the combined immutable source and final lockfile. Do not duplicate the ongoing external security audit or edit a reserved file.
- No independently dispatchable, demonstrably unowned new feature is established. Nineteen new English sweep keys lack es/ja/ar translations, but locale ownership is unreleased. The prepared TagArchive UI-exclusion seam overlaps SellerKeys/AppShell and is not assigned. Optional extensions stay preserved and outside the lean denominator unless actually qualified or excluded with proof.
- Supported chain/assets/contracts/registry/signing/trust-root configuration remains unverified/unapproved. Intercepted84532 fixtures and repository31337 deployment inventory are not selection or deployment authority.
- Native solc0.8.28 acquisition remains stopped: recorded official URL `https://binaries.soliditylang.org/linux-amd64/solc-linux-amd64-v0.8.28+commit.7893614a`, HTTP403/curl22; response body/headers were not retained, so proxy versus upstream cause is unknown. Expected official SHA2569a0fb7e0db2c0641dbae1c5cc645dc686820c83af516226abb1c0a2f76636f25. Do not retry, change host/version/environment or route around it without fresh applicable authorization/evidence.
- Signature-data acquisition remains separately stopped: npm audit-signatures exit1 after1.596s, “Failed to download”; exact failed URL/status were not captured. A default TUF mirror in source is not observed endpoint evidence. No retry/reroute is authorized by this document.
- Contract-backed EVM flow, final combined artifact/source qualification, independent exact-build review and mandatory deeper security acceptance remain. No release/deployment/live funds or PR approval is granted.

## Restart commands and prerequisites — unexecuted here

First inspect `git status --short`, `git log -5 --oneline` and `git rev-parse HEAD`. Verify the source and package-lock hashes above. Source backups do not include node_modules, generated exports, raw temporary jobs or credentials. Use existing pinned project tools and documented locked setup only; inspect lifecycle steps before running them. Do not upgrade dependencies or install replacement tooling to route around a denial. Keep API/GitHub credentials and unrelated secrets out of test/build subprocesses; the private shared runner uses a minimal environment.

Existing repository commands, from repository root, when prerequisites are available:

```text
npm ci --ignore-scripts
npm run build:libs
npm run typecheck -w @ghostpay/web
npm run lint -w @ghostpay/web
node apps/web/scripts/test-seller-vault-idb.mjs
npm run test:e2e -w @ghostpay/web -- e2e/recovery.spec.ts e2e/flows.spec.ts
```

`npm ci`/build steps are prerequisites for a fresh permitted checkout, not work already performed for this handoff. A missing/blocked prerequisite must remain missing/blocked. The combined recovery tests do not all exist on PR37 parent until the released integrator adds them.

From apps/web after the corresponding files are integrated:

```text
node ../../node_modules/vitest/vitest.mjs run src/lib/keyVault.test.ts src/views/SellerKeys.test.tsx src/views/SellerKeys.completion.test.tsx src/views/SellerKeys.recovery.test.tsx src/views/SellerKeys.storage.test.tsx
node ../../node_modules/vitest/vitest.mjs run src/lib/payExec.test.ts src/lib/payExec.acceptance.test.ts src/views/Pay.test.tsx
node ../../node_modules/vitest/vitest.mjs run src/lib/sweep.test.ts src/lib/sweepAttemptJournal.test.ts src/lib/relayerClient.test.ts src/state.sweep.test.ts src/views/Sweep.test.tsx src/embedHeaders.test.ts
```

Focused commands do not replace the existing full root/workspace, web coverage+coverage-off fuzz, build/bundle and browser/contract gates. Schedule timing-gated runs exclusively; reuse the documented grouped config in the private evidence package without changing source, corpus, seed, coverage or deadline. No automatic flaky retry. Record actual command, exact source/lock/tool versions, skipped tests, logs and terminal state. Do not turn interrupted, timed-out or missing-prerequisite work into passing evidence.

## Durable evidence and budget continuity

Published recovered-source milestone: `codex/ghostpay-recovered-lean-checkpoint-20261028` at0f8c82ce5c3391f0dfb7123ab149f2ff3269b38a before this restart note. Full private coordinator handoff remains Library `libfile_b3b4b194e3f0819187c623078a52ad91` v2, SHA2566cfdebaf630aaea82dfc5b02cc2a0fb8044fc5e8bd0b069e3eb8a91e3b1f3cfd. Portable recovered lean evidence is `libfile_19b6f3833720819181eff75fca468fdf` v0, SHAb34a719d068d7f3d56342e326f314d388038633eb4223d17faaeb33935d01021; exact13-file conflict/source-hash handoff is `libfile_852a9162e0dc8191bedd461b2203c0b1` v0, SHA3542da258a9e9ec562326c56d2a143096275de6f3aa38d08678fc838dbe98fcb. Native readback of each was verified. Private artifacts remain private; a GitHub checkout alone does not grant access or supply installed state.

All projects share one existing Claude budget/atomic ledger, not a per-branch allowance. Exact spend, uncertainty holds and tranche/reserve capacity are in the private coordinator ledger/handoff; do not infer current Console balance from an old screenshot. Retain unresolved Opus011 and Fable039 reservations and no-retry state. Before any new paid dispatch, obtain the current shared ledger/guard and applicable owner scope; if unavailable, pause paid calls. No paid call, extra worker, expensive rerun, purchase or reserve change was needed for this branch handoff.
