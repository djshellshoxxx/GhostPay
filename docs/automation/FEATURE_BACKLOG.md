# Feature backlog

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
| GP-MYTHRIL | Relevant contract-analysis evidence | #255 | Security gate still pending; contracts are not new Pages development scope. |

Keep non-Pages products, hosted services and unresolved owner decisions deferred. Signed provenance,
external-wallet/device acceptance and independent external security review remain separate evidence
requirements; no local source change substitutes for them. No documented requirement was removed.
