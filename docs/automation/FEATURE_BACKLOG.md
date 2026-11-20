# Feature backlog

## Current source-backed backlog — 20261120T0115Z

Receipt transaction-status correctness is implemented in #298: a receipt must carry the requested
primitive 32-byte hash before success/reversion is accepted. Original-hash preservation and no resend
are covered at the payment consumer. Local and independent focused verification pass; hosted integration
qualification is pending. This does not add finality or authenticate a consistently lying RPC.

Owner-authored [issue #286](https://github.com/djshellshoxxx/GhostPay/issues/286) explicitly makes
five privacy UX requirements part of 1.0 beta. They are not removed by deferring broader privacy architecture:

| Requirement | Current source-backed state |
|---|---|
| Global sensitive-data masking | No global setting or all-view implementation in inspected #278 417f7c71 |
| Optional configurable clipboard cleanup | #293 helper/optional prop only; no production prop caller; #297 repairs test qualification |
| Account-change/lock privacy | Existing authority/vault/invoice invalidation controls; all-view privacy acceptance unverified |
| Private transaction history | Existing encrypted locked ledger/reveal; global privacy-mode policy and acceptance unfinished |
| Neutral exports/notifications | Fixed stealth export names and neutral title are partial controls; all surfaces unqualified |

Prioritize the pending same-value clipboard copy interleaving before activating cleanup through Settings.
Then implement Settings, persistence, translation and production call sites with browser acceptance,
coordinating with #293 and broad UI owners. Historical nine-family source assessment at a1386906 does
not establish these five later requirements. See the independent
[spec review](data/cycle-20261120T0115Z/privacy-spec-review/REVIEW.md).

Both Wiki guide sections and all 18 checked Home/Sidebar links remain intact. Active guide owners
#259/#273 retain their branches; dated Home narrative is historical, live Wiki publication unperformed.


## Current cycle qualification — 20261120T0035Z

- Base64url primitive-input rejection already exists in #289 and #278. Original #289 repository
  coverage passes 729/729, focused independent tests 5/5, package typecheck/build pass. The unused
  fixture-parameter lint failure is already repaired on #278; do not create another decoder or repair.
- QR classification from #285 is present in #278. Additional primitive-key guards were independently
  reproduced and implemented, then deduplicated against concurrent #290. Final #295 preserves only
  one missing unverified-hook regression and all eight flag combinations; 54/54 tests pass under both
  author and fresh reviewer. Hosted qualification and #290 target-conflict reconciliation remain.
- Recovery, per-address keypair export, session locking, wallet failures and invoice-bound payments
  remain with current #278/related owners. Helper coverage does not qualify their full user workflows.
- The separate #278 owner published browser/merchant follow-up at 417f7c71. New exact-source CI is
  pending; do not reuse this cycle's d74af79e failures/passes as final-head qualification.
- Wiki Home and Sidebar retain prominent User Guide and Developer Guide links. Active guide owners
  #215/#140/#259/#273 retain their edits; this cycle preserves boundaries and records drift.
  Live Wiki publication was not attempted and no publication is claimed.

This bounded cycle completes concrete verification, new regression coverage and evidence preservation;
it does not expand the static-client product scope or declare beta/release readiness.

## Historical backlog

Refresh current source, PR heads and ownership before assigning a task. This queue records requirements
and known owners rather than declaring whole features complete from passing focused tests.

| ID | Requirement | Owner/input | State and next acceptance |
|---|---|---|---|
| AUTO-001 | Durable repository-wide integration exclusion | Coordinator, current cycle | Implemented at d3749e45, independently verified 10/10; remote acquisition and production CLI readback passed. Hosted qualification still required before source merge. |
| UI-IMPORT-001 | Shared camera/paste/image cancellation lifetime | Camera worker, current cycle | Fixed in draft #258 (84398a79); 77 distinct tests, independent 9, scoped typecheck/lint passed; hosted qualification pending. |
| GP-RECOVERY | Spec 18 backup and independent recovery | #239 and #240 | Reconcile distinct changes and test combined recovery behavior; do not assume duplicate PRs. |
| GP-SESSION | Sleep-aware idle lock and revocation | #256 | Existing owner; await exact-head qualification and review. |
| GP-NETWORK | Browser network authorization and cancellation | #251 | Existing owner, stacked on #238; preserve dependency and integration gates. |
| GP-SCAN | Private seller checkpoints and discovery | #248 | Existing owner; qualify current head and resolve integration dependencies. |
| GP-SIGNER | Selected invoice signer validation | #243 | Existing owner, stacked on #238; preserve independent caller policy. |
| GP-SWEEP | Explicit displayed-balance consent | #252 | Narrow Pages candidate; complete current CI and review before merge. |
| GP-MYTHRIL | Relevant contract-analysis evidence | #255 | Analyzer gate failed with 11 findings (8 Low, 3 Medium); existing owner retains remediation/disposition. Contracts remain outside new Pages development scope. |

Keep non-Pages products, hosted services and unresolved owner decisions deferred. Signed provenance,
external-wallet/device acceptance and independent external security review remain separate evidence
requirements; no local source change substitutes for them. No documented requirement was removed.
