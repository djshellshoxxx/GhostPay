# GhostPay — wallet-attempt first-hash integrity correction

## Cycle and exact sources

Cycle: `20261121T2235Z`, November 21, 2026 UTC. One ChatGPT coordinator performed sequential discovery, targeted source review, baseline replay, regression authoring, repair and consolidation triage. No native subordinate agent or independent verifier ran. No Caveman runtime execution or paid agent was used.

Base default branch: `main` at `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
Isolated branch: `automation/20261121T2235Z/bug/journal-hash-integrity`.
Original product blob: `b8c2ec1915b833a5b78286b9b9caca1c247e827c`.
Ownership commit: `78e58ae9e0e95a0a89cdf3572efb12b31afc778d`.
Test-first commit: `ed5fa6b512fe6a1851d4451c20c7de387ffac369`.
Production repair: `38385d4903d9e51c9a04940a75328980faf95c0f` (product blob `44b9f9d8c23e3c37307b8c777f9c70c8181f12e4`).

## Confirmed exported-helper data-integrity defect

In the unmodified implementation, `finishAttempt` removed an existing record with the same id and appended the caller-provided submitted record. Calling it twice with two different transaction hashes therefore overwrote the first persisted submitted hash, even though that first hash may refer to a broadcast transaction. Exact source used in the review: `apps/web/src/lib/duplicateAttemptJournal.ts` on the base commit.

This is a defensive journal-integrity defect with a concrete helper-level reproduction; application-level repeated provider callback reachability and actual funds loss have **not** been established. One ordinary `sendViaWallet` call invokes `finishAttempt` once after `eth_sendTransaction` returns. Do not claim an on-chain exploit.

## Repair and acceptance

- When the same attempt id is already `submitted` with an identical canonical hash, return idempotently without rewriting storage.
- When that id is already submitted with a different hash, fail closed, preserving the original record.
- Refuse an existing id whose action key, chain, account, kind or creation timestamp differs from the provided attempt.
- Preserve existing evidence-retention behavior: a returned hash after an explicitly cleared in-flight request is recorded, even when an explicitly initiated replacement already exists.
- No changes to wallet signing, key material, external provider calls, persistent storage schema, contracts, dependencies, runtime services, build settings, deployment configuration or fee policies.

New focused regression file `apps/web/src/lib/duplicateAttemptJournal.hashIntegrity.test.ts`: four scenarios covering those invariants. Existing `duplicateAttemptJournal.test.ts` remains untouched.

## Executed evidence and limits

- Node v22.16.0 baseline replay of the original `filter(id) → append(new hash)` structure demonstrated `0xbb…bb` being replaced with `0xcc…cc`; this was a **source-equivalent replay**, not the repository's TypeScript/Vitest run.
- Node v22.16.0 post-fix source-equivalent `node --test /tmp/ghostpay_wallet_hash_after.mjs`: **4/4 passed**, including first-hash retention, idempotence, action collision refusal, and late completion preservation. The scratch file is not durable and is not a substitute for repository tests.
- The four Vitest scenarios were committed before the production change; **not locally executed**. Git checkout failed `Could not resolve host: github.com`. Local workspace typecheck, lint, build, security scans and browser E2E were **not executed**.
- Actual repository CI and independent verification on the exact final head are pending at handoff creation.

## Consolidation and lock

Live main remained `eb59d93cffed7848c4aac37d0e9650b87239c6da` at discovery. Inspected changed-path inventories from PRs #278/#293/#307/#372/#390/#416/#419/#422 and current main `docs/ai/ACTIVE_WORK.md`; none claimed the two owned journal files in that bounded review. This is not an exhaustive audit of all open PR path claims.

The existing metadata lock branch `automation/ghostpay-integration-lock` was at `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`; lock file generation **11**, status **held**, owner `994a0d214fb9-root-r3`. Expiry is not takeover authority. No shared integration branch or protected main update was attempted.

Read-only composite review: PR #422, exact head `f846464db3cb2f12c221d0c2f56e3aa3702d4fcb`, had all five pull-request workflow groups completed successfully at this cycle's inspection (CI, Pages, Beta acceptance, Hosting kit and CLI). Its two donors #390 and #419 remain open and require independent verification/legitimate integration; this cycle did not modify them. The passing composite CI is unrelated to and does not qualify this journal fix.

Pages workflow `.github/workflows/pages.yml` at blob `5ef7f8f55035f852da2e1398ae39fc6455a91ebb` gates actual publication on an explicit `workflow_dispatch` on main with `deploy=true`; the pull-request event runs validation only. No deployment was triggered.

## Next cycle

1. Inspect final PR exact-head CI jobs, especially `ts-test (web)`, typecheck, lint, build and browser/Pages acceptance; repair any actual failures in a separately owned child branch.
2. Have a distinct verifier independently confirm the exact production patch, identity invariants, preservation of late hashes and compatibility with all old journal tests. Do not self-approve.
3. Reconcile current main, all active path claims, branch protection and deployment triggers with the integration coordinator. No main merge while the generation-11 lock is held; preserve this draft until all required gates pass.
4. Continue priority audit of payment/recovery/transaction integrity without duplicating already active #372 and #422 work.

No shared ledger write, main merge, tag, release, deployment, production-setting update, real-funds operation, source-branch deletion or force-push occurred.
