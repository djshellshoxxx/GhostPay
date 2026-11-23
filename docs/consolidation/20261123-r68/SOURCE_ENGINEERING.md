# GhostPay R68 — source-pinned qualification engineering and complete reconciliation

**Census:** 2026-11-23T16:10:42.293Z. **Protected main:** `8ddb344973e80b8e1eda6821e970ee6a2b808b29` (unchanged). **Prior R67 PR #471 head:** `085089954a65c5fdcd3d2840a3291a6b71f5db43`. R68 pre-publication ledger commit: `d7e0ec87660e718e5ddda7d05f3772b710cc2762`.

## Actual product test engineering (isolated, owner-safe)

Created [draft stacked PR #515](https://github.com/djshellshoxxx/GhostPay/pull/515), branch `audit/ghostpay-r68-jitter-expiry-qualification-20261123`, from the **exact** owner [invoice-expiry PR #274](https://github.com/djshellshoxxx/GhostPay/pull/274) HEAD `a4c6f945adef0438bfd0b347fb7c11057e3973ce`. Commits:

1. `10cfd989ecd079618e0fa622e4c0efc683dd6230`: additive claim in ACTIVE_WORK on the isolated branch before new code.
2. `47ad24de1788c17c05db4bbfaab6d33f1c9909d8`: six deterministic targeted Vitest regression cases in new `apps/web/src/lib/jitter.expiry-qualification.test.ts` (monotonic floor fractional expiry, Send-now after rollback, simultaneous due/expired, wall jump forward, nonfinite samples and final-state immutability).
3. `f2b262c2afe5d51c258e466d9be1d22798817135`: source-pinned qualified scope review document.

Untruncated exact [parent-to-PR diff](https://github.com/djshellshoxxx/GhostPay/pull/515/files) is 3 commits, **three files**: the new Vitest file, an additive task claim and a handoff. No changes to owner-held `apps/web/src/lib/jitter.ts`, existing `jitter.test.ts`, wallet, keys, payment execution, RPC, dependencies, contracts, workflows or releases. No network/funds exercised. This is **qualification work, not production integration into main**.

### Actionable source-level correctness question

The PR #274 `DelayScheduler.check()` expiration gate executes only while `status === 'waiting'`. Once status becomes `ready`, a subsequent expiry does not move it to `expired`; even `sendNow()` cannot revalidate. The owner was notified with a deterministic timeline and distinction between UI readiness and actual signing/broadcast in [comment #7106602537](https://github.com/djshellshoxxx/GhostPay/pull/274#issuecomment-7106602537). **Caller revalidation may deliberately make this safe**, and real-funds exploitability was neither claimed nor tested. Source owner to establish the intended contract and add end-to-end gate test if required. No competing modification was made.

### CI truth

- Parent #274 exact `a4c6f945...`: four GitHub check-runs completed success, **not** comprehensive release/browser qualification.
- Test-only child #515 exact `f2b262c2...`: new hosted workflow checks queued/in progress during checkpoint. **Do not claim passed until exact-head results**.
- R67 PR #471 exact `085089954...`: 28/28 GitHub check-runs completed success, including both browser E2E suites, but this does **not** imply R68 or PR #515 acceptance.
- Local git checkout blocked by DNS resolution to github.com, no native Vitest/repo TypeScript/lint/browser execution this run. GitHub hosted workflows constitute separate pending tests; source-level reasoning is not test execution.

## Independently reconciled complete branch/PR inventory

Source: GitHub REST /branches and /pulls with page size 100 and terminal empty page, independently checked against `/git/matching-refs/heads/`. **581 live branches** (100/100/100/100/100/81/0), **581 independent refs**, exact branch-name and SHA match **581/581**, zero mismatches, zero missing refs. **270 open PRs** (100/100/70/0), **97 stacked** PRs.

**317 finalized historical live dispositions**, unchanged from R67. **264 unresolved live + 2 retired deleted-but-unmerged = 266 globally unresolved**, up two from 264, precisely caused by new owner-held BUG-only [PR #514](https://github.com/djshellshoxxx/GhostPay/pull/514) and new test-only #515. No historical branch newly finalized and no protected-main merge observed. Self-publication branch #471 was the only existing branch that advanced since the R67 frozen snapshot: `2bab915f07f66f55e3c140ee045519643ec5870d` to `085089954a65c5fdcd3d2840a3291a6b71f5db43`; R68's own ledger/doc commits occur **after** the frozen census and must not be mistaken for donor changes. Complete PR SHA/owner/base alias overlays, previous classification and retired tombstones preserved in [SEMANTIC_DISPOSITIONS.json](SEMANTIC_DISPOSITIONS.json).

## Ownership/merge controls

The integration-lock Git ref remains exactly `082e754f44944ebb4be283f89176b966bf8f7b4f`. The previous generation-12 released metadata remains the last verified *semantic* lock status; no lock was acquired. Branch-protection read was previously denied HTTP 403 and remains unverified by this connection. PR #274 and P0 recovery/refund work remain owner-held. BUG-only PR #514 remains with its owner. No actual independent approval of PR #471 or #515; browser/payment-security acceptance unverified for new code. No protected-main merge, production implementation, deployment, release, ref deletion, force-push or real-funds operation.

## Next executable work

Inspect #515 exact-head Vitest/TypeScript/lint/browser CI, fix **new test file only** if demonstrated failures; route any `jitter.ts` contract changes to owner #274. Qualify monotonic expiry without changing custody or transfer behavior. Continue source-pinned uncapped donor comparisons and separately recover unowned uniquely safe product code. For #289 preserve owner and request lint repair; do not import P0-B refund absence without finalized canonical chain proofs. Qualified reviewed PR integration requires independent approval and verified lock/branch protection before protected-main merge.
