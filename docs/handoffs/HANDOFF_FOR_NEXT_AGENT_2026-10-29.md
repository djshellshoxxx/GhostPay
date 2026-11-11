# GhostPay handoff for the next agent (2026-10-29)

**2026-10-30 update:** see [the Codex checkpoint](CODEX_PROGRESS_2026-10-30.md) for selectively ported seller recovery and approval retention, fee hardening, relayer deadline handling, current validation and remaining environment limitations. The historical P1a list below predates those slices; the recovered tree itself has not been merged wholesale.

This handoff is written for any agent that picks up the work, ChatGPT included. It is self-contained: read it first, then follow the links. It records where the work stands on the commit that adds this file. Verify every SHA with git before you rely on it.

> **Authority.** This document grants no merge, release, deployment or real-funds authority. Pull request #37 is a draft, and merging it is the owner's decision.
> - Push only to the PR branch named below. Never push to `main`.
> - Never force-push, rewrite history, or make an empty commit.
> - Never deploy, publish mirrors or packages, or provision services or accounts.
> - Never guess contract addresses or invent trust evidence.
> - Describe AI review honestly: an AI agent's review is not an independent professional audit.

## 1. Where things are

| What | Value |
|---|---|
| Repository | `djshellshoxxx/GhostPay` |
| Default branch | `main`. PR #37 is not merged, so `main` has none of this work. |
| Work branch | `claude/ghostpay-autonomous-completion-y4sk2h` |
| Pull request | [djshellshoxxx/GhostPay#37](https://github.com/djshellshoxxx/GhostPay/pull/37) (draft). It supersedes #30 and #36, but close those only on the owner's decision. |
| Audit report | [audit 24](../audits/24-ai-assisted-security-audit-2026-10-28.md). It is AI-assisted, not a professional audit. |
| Audit data | [`docs/audits/data/24/`](../audits/data/24/). Regenerate the report with `python3 scripts/audit/gen-audit24-report.py`. |
| Tools | [`scripts/dev/README.md`](../../scripts/dev/README.md) covers the local CI runner, the non-root runner, the audit tools and the agent workflow scripts. |
| Earlier handoffs | [CONSOLIDATION_2026-10-28](CONSOLIDATION_2026-10-28.md) (source map, hosting qualification), [RESTART](RESTART.md), [LEAN_RELEASE_SCOPE](LEAN_RELEASE_SCOPE.md), [SESSION_STATUS](SESSION_STATUS.md). The older [NEXT_AGENT_PROMPT](NEXT_AGENT_PROMPT.md) is historical. |

### What the branch contains, in order

1. **Consolidation:** PR #30 (lean core), PR #36 and the sweep-lock fixes, merged into one branch. The source map is in CONSOLIDATION_2026-10-28.
2. **Nightly reproducibility fix:** an owner-approved root `overrides` entry, with the lockfile re-resolved for the privacy-pools SDK subtree only.
3. **Audit 24:** 8 review lanes plus a coverage-gap pass, with every finding adversarially verified. The result is 83 confirmed findings: 2 High, 12 Medium, 44 Low and 25 Info.
4. **Fix clusters, all merged:** each was implemented by an AI agent with a test that fails first, then reviewed by a separate AI agent. Rounds were repeated until approval.

   | Cluster | Area | Rounds | Main findings fixed |
   |---|---|---|---|
   | A | scanning | A, AR, AR2 | L4-01 (High), L3-F1..F5, L1-03, F5 |
   | B | sweep guards | B, BR | L2-F1, L2-F2, L4-02 |
   | B2 | pay | B2, B2R | G1-01, G1-03, L2-F3, L2-F4, L2-I2, L2-I3, L4-I3 |
   | C | seller keys | C, CR, CR2 | L1-01 (High), L1-02, L1-04, L1-06, L1-07, I-1..I-3, G2-05, G2-06 |
   | D | relayer | D, D2, D3 | L5-01..L5-07, L5-10, L7-L3 |
   | E | hosting | E (plus integrator fixes) | L7-M1..M4, L7-L1, L7-L2, L7-L4, L7-L5, L7-I1, L8-04, L3-F7 |
   | G | non-EVM chains | G, GR | G2-01..G2-04, L4-03, L4-04, L4-05, L3-F6 |
   | H | merchant plugins | H, H2, H3 | G3-01..G3-06 |

5. **Integration commit `9a00a7a`:** the app's idle timer now calls `notifyAppLock('idle')`, so the Bitcoin, Solana and TRON views wipe their keys and a copied backup is cleared. The views are also wrapped in `ErrorBoundary`.
6. **Reusable tools and this handoff.**

Result: 63 of the 83 findings are fixed, including every High and Medium. 16 are deferred with reasons and 4 are accepted by design. Each is listed in the report.

## 2. Build and test

Requirements: Node 22 and npm 10, PHP 8 for the plugin tests, and Python 3 for the audit tools. Foundry's `cast` is needed only for `scripts/testnet` tests.

```bash
npm ci
```

```bash
scripts/dev/local-ci.sh --log /tmp/ci-logs
```

```bash
scripts/dev/local-ci.sh --only build-libs,typecheck,lint
```

```bash
scripts/dev/local-ci.sh --only build-libs,pkg-chain-adapters --web-tests "src/views/Scan.test.tsx"
```

```bash
scripts/dev/nonroot-run.sh -- bash deploy/selftest.sh
```

`local-ci.sh` mirrors `.github/workflows/ci.yml`. The non-root run needs root to start, and it shows file-mode bugs that root hides. Coverage thresholds are 90/85/90/90 (statements, branches, functions, lines). They are enforced only in the web suite with coverage.

**Known flakes in small containers:** the 1M-log scanner fuzz test (180 s limit), the ReconciliationLedger "saturated backup" test and the invoice-schema passphrase tests under load. Each passes in GitHub CI and when run alone. Before you call a failure real, re-run the file alone with `--coverage.enabled=false`. Details are in `scripts/dev/README.md`.

**CI:** `.github/workflows/ci.yml` runs 27 checks on each push to the PR. The integration workflow (anvil, bitcoind regtest, solana-test-validator, in Docker) runs on path filters and nightly, and is slow.

## 3. Open work, by priority

### P0: keep the PR mergeable
- Read the CI results on the PR head. Fix anything red with a test first, never by skipping or weakening tests.
- If `main` moves, merge `main` into the branch (do not rebase it), then re-run the checks.

### P1a: integrate the recovered source (biggest open engineering task)

The consolidation handoff recorded the private recovered tree as missing: commits `fac0fbd` and `405c168`, tree `a1478b2c`. Another agent (Codex) has since pushed it to GitHub, on 2026-10-28.

**The branches.** None of them is merged into the PR branch. All of them branch from `main` `edb0051` and contain `fac0fbd`, whose tree is exactly `a1478b2c`.

| Branch | Contains |
|---|---|
| `ghostpay-cloud-recovery-2026-10-26` | `fac0fbd` and a doc commit |
| `ghostpay-offline-deps-2026-10-27` | the above, plus `84f5cdf` (dependency metadata) |
| `ghostpay-sbom-repro-2026-10-27` | the above, plus `a734e77` (SBOM provenance) |
| `ghostpay-local-lean-boundary-20261027` | the recovered line, plus `3d73ed9`, `61c3083` and `405c168` (lean fixtures, report paths, test label) |
| `codex/ghostpay-recovered-lean-checkpoint-20261028` | the most complete branch: the above, plus `0f8c82c` |

Codex's own coordination notes are on `codex/ghostpay-resume-20261028`, in `docs/handoffs/CODEX_RESTART_2026-10-28.md`. Read them first.

**What is unique there.** This list comes from Codex's notes, checked here by file comparison.

The recovered line adds features and tests that this branch does not have:
- seller-key completion, cancellation, same-file retry and actual-store refresh;
- honest reporting of confirmed approvals;
- recovery, payment and Worker receipt acceptance tests.

Compared with the PR head, `codex/ghostpay-recovered-lean-checkpoint-20261028` has 17 new non-vendor files and 144 modified files. The new files:
- `apps/web/e2e/recovery.spec.ts`
- `apps/web/src/AppLean.tsx`, `AppShell.tsx` and `AppLean.test.tsx`
- `apps/web/scripts/localBuildProfile.*`
- `apps/web/src/lib/payExec.acceptance.test.ts`
- `apps/web/src/views/SellerKeys.completion.test.tsx`, `.recovery.test.tsx` and `.storage.test.tsx`
- `scripts/tests/normalize-sbom.test.mjs`
- docs and evidence files

**How to integrate it.** Do not `git merge` it blindly.
- Codex's merge rehearsal against PR head `6a3e85c` already hit 13 conflicts: `en.json`, the seller-vault IDB script, the embedHeaders test, the payExec test, the sweep library and its test, `state.tsx`, the Pay view and its test, the SellerKeys view, the Sweep view and its test, and the nginx embed headers.
- The audit 24 fixes have since changed most of those files again.
- This branch already has newer vault guards, CAS delete, sweep-journal safeguards and the SDK-scoped viem override. Keep them. Codex's notes also say not to copy its `vendor/` topology.

Port the recovered work feature by feature. For each feature, classify every file as present, superseded, missing or conflicting. Then bring in its tests, adapt the code to the current guards, and run `local-ci.sh`.

**Other branches checked and not merged.**
- `claude/laughing-bardeen-4t20ys` and `claude/remote-extensions-10`: old snapshots from 2026-10-21. The first has no file that is missing here. The second's only such file is an old `apps/relayer/src/breaker.ts`, which is superseded.
- The three Dependabot branches: left for the owner.
- `gh-pages`: the published site. Never merge it.

### P1: open review follow-ups that touch safety

These were raised by the last AI review of each cluster. They are minor issues, not confirmed findings. The full table is in the report under "Open follow-ups from the fix reviews", and the full text is in `docs/audits/data/24/status.json` under `_clusters.<round>.review_issues`.

1. **CR2, fixed in `2fcab7f` (C-R12): key loss on unlock.** Unlocking could replace keys whose only vault copy another tab had deleted, without the confirmation. The unlock now re-reads the vault and asks first.
2. **D3, fixed in `de3ea97`: lapsed deadline reported as the wrong reason.** `runSettled` now rechecks the sweep deadline at lane entry and around the order-state read, preserving `deadline_too_soon` for queue/RPC delays without striking the owner. Three new regression cases and the full relayer suite pass.
3. **AR2, minor: dense windows refused after a sparse stretch.**
   - **Problem:** in `packages/chain-adapters/src/logs.ts`, `served` spans the whole fetch, so after a sparse stretch each regrown window in a dense, result-limited stretch is refused once. This costs requests only; no logs are lost.
   - **Fix:** reset `served` when the window regrows.
   - **Superseded (checked on `70d8bf6`):** the reset is in place at `packages/chain-adapters/src/logs.ts:330-331` and `:475`. See `WAVE-2-STATUS-2026-10-30.md`.
4. **B2R, fixed in `9cd80cf`: operator fee read as zero.** `readOperatorFee` now accepts only a positively identified plain revert as the absent-method fallback. A separate sanitized RPC flag preserves the existing broad dry-run failure classification; out-of-gas, opcode failures and unknown halts fail closed. Real transport-to-sweep regression cases cover the boundary.
5. **BR, nits: sweep lock edge cases.** In `Sweep.tsx` and `state.tsx`:
   - after 3 other hashes, the UI still offers a same-nonce replacement;
   - a `submitted` transaction the node dropped keeps the tab's lock with no in-app recovery;
   - an inconclusive final look shows the pending note.
   - **Partly superseded (checked on `70d8bf6`):** the first bullet is covered by the hash limit at `Sweep.tsx:62-63`. The other two bullets are still open or unknown. See `WAVE-2-STATUS-2026-10-30.md`.

### P2: integration leftovers and drift
- **Seller-keys gate:** `RegistryView.tsx` and `PolicyCreate.tsx` should pass `paymentsOnly` to `BackupGate`, because they never use the signing key (CR2 nit). `PolicyView.test` then needs generated keys.
  - **Superseded (checked on `70d8bf6`):** both files pass `paymentsOnly` (`apps/web/src/features/registry/RegistryView.tsx:247`, `apps/web/src/features/policy/PolicyCreate.tsx:102`). See `WAVE-2-STATUS-2026-10-30.md`.
- **Remove `requireSession`:** it is a deprecated compatibility API with no production caller. Remove it from `apps/web/src/lib/session.ts`, then migrate `pay.test.ts`, `session.test.ts`, `Scan.test.tsx` and `invoiceCreate.test.ts`.
  - **Superseded (checked on `70d8bf6`):** no `requireSession` match under `apps/web/src`. See `WAVE-2-STATUS-2026-10-30.md`.
- **One idle-lock signal:** `session.ts` `subscribeIdleLock`/`notifyIdleLock` and `lib/appLock.ts` `subscribeAppLock`/`notifyAppLock('idle')` now both fire on the idle lock. Move the three subscribers (`SellerKeys`, `Sweep`, `TagArchive`) to `subscribeAppLock` and delete the session copy.
  - **Superseded (checked on `70d8bf6`):** no `subscribeIdleLock` / `notifyIdleLock` under `apps/web/src`; the subscribers use `subscribeAppLock`. See `WAVE-2-STATUS-2026-10-30.md`.
- **Docs drift.** Remaining work and known corrections:
  - The C-R10 signer-only/idle-lock wording in the two troubleshooting guides, `docs/user/set-up-stealth-meta-address.md` and `apps/web/README.md` was already corrected in `bd45a32` (issue #38 finding 3); it is not open work.
  - `docs/user/bitcoin-silent-payments.md`, `solana-payments.md`, `tron-payments.md` and `docs/chains/bitcoin.md`: "shown once" backups and genesis-linked heights;
  - `docs/developer/api/chain-adapters.md`: the `reverted` codes, the `opStack` field and the enabled-chains line;
  - `docs/developer/api/README.md`: the address-case rule;
  - `docs/remote/usability/specs/webhooks.md` (R6 `IdempotencyGuard`) and `fiat-display.md` (ISO exponents against the app table).
- **Translations:** new English keys from the fixes have no es/ja/ar translations, and `node scripts/i18n/check.mjs` lists them. They need human translators, so do not machine-translate security copy.

### P3: deferred findings that must be closed before a feature is enabled
- **L4-I1:** add the domain prefix to release signatures before the first real release signature. The build validator, web loader, relayer config, ops monitor and e2e fixture change together.
- **G1-02:** before embedding is enabled, bind the embed profile to the invoice signer.
- **F1 to F4:** before the policy-scheme flag is turned on or anything is deployed, fix the policy contracts and builder.
- **L2-I1:** before any price feed is enabled, cap the price age and re-read the price before send.
- **L8-01 to L8-09, preserved packages:** sandbox them, give them a durable store, or package them before wiring any of them in.
- **L3-F9:** list the local identifiers in the THREAT_MODEL browser-profile row, and add a confirmed "forget local scan data" action.

### Owner decisions and external gates (not agent work)
- **PR #37:** merge it, or ask for changes.
- **Relayer defaults:** the defaults are untuned: the quote limit is 60/min with a burst of 20, and the clean-source share of the loss cap is 25%. `/healthz` reports degraded on a sustained revert rate, so it is not a liveness probe.
- **Cross-tab sweep lock:** this needs persistent storage, which leaves a privacy trace.
- **The lean-scope gates:** the private review packet, a verified network, registry, contract and trust configuration, an independent review of the exact build, the deeper audits, and no production funds or deployment without explicit owner, legal, security and network approval.

## 4. How the previous sessions worked
- **Isolation:** one git worktree per change cluster, each with explicit file ownership, so that parallel work merges cleanly. Merge with `git merge --no-ff`, which keeps the review history.
- **Proof of each fix:** write a regression test that fails on the base, make the smallest fix, and run the cluster's checks. An independent adversarial review re-runs the test against the base and tries mutants. Revise until approved.
- **Integration:** run `local-ci.sh` on the merge before pushing.
- **Records:** `docs/audits/data/24/status.json` keeps every round's items, commits and review issues. `record-cluster.py` writes it, and `gen-audit24-report.py` turns it into the report.

## 5. Environment pitfalls seen
- **Container restarts:** they lose uncommitted work and running jobs. Commit every finished item at once, and keep anything worth keeping out of `/tmp`.
- **Root-only test passes:** tests run as root hide file-mode bugs. Use `scripts/dev/nonroot-run.sh`.
- **`node --test` on a directory:** this fails in Node 22. Pass globs, as CI does.
- **Missing tools:** there is no Docker daemon, no `cast` and no live chain in the agent container, so Compose, nginx and the integration suites ran only in CI or on a scratch nginx. trongrid returned 403 through the container proxy.
- **Usage limits:** usage limits stopped the work twice. Long multi-agent rounds are expensive, so finish and push one cluster at a time.

## 6. Hardest parts and token-heavy parts

| Area | Why it is difficult | Why it uses many tokens |
|---|---|---|
| **Scanner under limited or hostile RPCs** (`packages/chain-adapters/src/logs.ts`, `scanVerify.ts`, `apps/web/src/lib/reconciliationVault.ts`, `views/Scan.tsx`) | Providers use one error code (`-32005`) for both "too many results" and "rate limited". Two RPCs must agree on reorgs, and a block can hold attacker spam. Every change trades completeness against request budget. It took 3 review rounds (A, AR, AR2) and still has follow-ups. | `logs.ts` is about 27 KB, `reconciliationVault.ts` about 39 KB and `Scan.tsx` about 30 KB. The tests are long simulations, and the 1M-log fuzz takes minutes. |
| **Seller-key custody and the session state machine** (`lib/session.ts`, `lib/keyVault.ts`, `views/SellerKeys.tsx`, `App.tsx` idle lock) | Several tabs can delete or replace vaults while keys are in memory. A wrong guard destroys the only copy of keys that receive payments. It took 3 rounds (C, CR, CR2), and one minor issue is still open. | `SellerKeys.tsx` is about 29 KB and `session.ts` about 21 KB. Production scrypt (N=2^17) makes each vault test take 20 to 30 s. |
| **Sweep lock, nonces and fees** (`lib/sweep.ts`, `views/Sweep.tsx`, `state.tsx`) | Same-nonce replacement, an unknown outcome after handoff, OP-stack L1 and operator fees, and differences between node clients in error codes (geth, reth, Nethermind). | `sweep.ts` is about 35 KB and `Sweep.test.tsx` about 55 KB. |
| **Relayer breaker and loss budget** (`apps/relayer/src/service.ts`) | Concurrency and timing: the probe and receipt timeouts, a deadline that lapses in the queue, and per-network fairness. | `service.ts` is about 35 KB, and `api.test.ts` about 84 KB is the largest test file. |
| **Full web suite** | It has time-limited tests that flake under load. | It runs about 16 min with coverage, and failures have to be read from long logs. Run targeted files first and the full suite once. |
| **Translations (es/ja/ar)** | Security copy must be exact, so it needs a human translator. | `en.json` is about 50 KB, and the i18n check output is long. |
| **Out of beta scope, but the hardest if enabled** | The policy-scheme contracts, privacy-pools and fhEVM packages, the Groth16 verifiers and trusted setup, and BTC best-chain selection and header sync (true SPV). Each needs specialist review, and some need a professional audit. | Each is a large codebase to read before any change. |

## 7. Next steps
1. Confirm the PR head and CI state.
2. Take the P1 items one at a time: write a failing test, make the fix, run the checks with `local-ci.sh`, commit and push.
3. Take the P2 items in small groups by file ownership.
4. Update this handoff's open-work list and regenerate audit 24 when a status changes.
