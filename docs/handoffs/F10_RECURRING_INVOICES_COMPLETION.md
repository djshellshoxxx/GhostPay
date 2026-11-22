# F10 recurring invoices — implementation and verification checklist

Checkpoint: 2026-11-22 (Pacific). Source of truth is GitHub at review time; statuses below are scoped to the inspected refs, not a release declaration.

## Source pins and ownership

- `main`: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- #324 M1: `4a48f2f09b1334036a6a88bab4e51f958cee46dd` (open draft).
- #371 dormant consolidation: `1de6e0247e0f76afe6f1615b43e55007ece25d9b` (open draft, external integration lease held).
- #391 M2: `20a353d28e1aac89216ba2e8980000477307bf03` (open stacked draft).
- #396 M3: `7079eedfc67180c9a0012c7154758e41fe6208c9` (open stacked draft).
- M4 successor: `feature/f10-durable-cas-m4-20261122`, stacked on #396; test-first `262f3e91`, source `edbcdd43`. Read final branch HEAD and CI after publication.
- Do not modify other workers' PR branches or the held integration lease. No mainline merge, release, deployment or actual wallet activity is authorized by this branch.

## Status by component

| Component | Status | Evidence / next requirement |
| --- | --- | --- |
| Strict plan and snapshot parsing, UTC cadence previews | IMPLEMENTED_UNVERIFIED | #324/#371 dormant M1; historical tests on donor heads, not live Pages |
| Plan create/pause/resume/cancel/revision | IMPLEMENTED_UNVERIFIED | #391 M2 pure transitions; inherited lint corrected only on M4 branch |
| Review-bound local staged preparation | IMPLEMENTED_UNVERIFIED | #396 M3; prepared != signed/issued |
| Encrypted snapshot serializer and session-bound key slot | IMPLEMENTED_UNVERIFIED | M4 `vault.ts` plus dormant `browserVault.ts` F10-only HKDF; requires hosted verification and browser wiring |
| Same-origin atomic ciphertext compare-and-swap | IMPLEMENTED_UNVERIFIED | M4 adapter reuses existing IndexedDB CAS port; real browser contention test pending |\n| Browser seller-session key derivation, zeroization and invalidation | IMPLEMENTED_UNVERIFIED | M4 dormant `browserVault.ts` and five mock-session/WebCrypto tests; UI lock/unmount wiring pending |
| Reservation binding to M3 single-use review | IMPLEMENTED_UNVERIFIED | M4 `reserveReviewed`; confirmed success only after storage commit |
| Backup ciphertext export and restore to empty profile | IMPLEMENTED_UNVERIFIED | M4 limited path; import-over-live merge still MISSING |
| Encrypted multi-profile backup merge, migration, schema evolution | MISSING | Paused legacy import, identity/history merge and recoverable migration checkpoint |
| Live P04 authenticated invoice issuance, signed terms and nonce binding | MISSING | Must check newly reviewed merchant/fee/chain/asset authority after durable reserve |
| Durable delivery, export, paid and failure state machine | MISSING | Must not label prepared/issued as delivered or paid |
| Manual reminder and calendar-compatible export | MISSING | No mandatory services, background execution or third-party notifications |
| GitHub Pages recurring invoice UI | MISSING | Create/manage/preview/issue/export, lock/hide, i18n, a11y |
| Real browser multi-tab, crash, backup and wallet recovery testing | MISSING | Playwright and fault injection |
| Independent security review and full final-head CI | BLOCKED | Requires executable CI/independent reviewer, upstream PR ownership/lease release |
| Mainline consolidation and deployment | BLOCKED | Held lock + dependency and release qualification; do not merge or deploy |

## Immediate acceptance checks

- [ ] Verify newest `main`, all relevant PR heads and exact upstream branch parentage; preserve the changes already implemented.
- [ ] Execute M4 focused tests: `npx vitest run src/features/future/private-recurring/{model,review,lifecycle,prepare,vault,browserVault}.test.ts` from `apps/web`.
- [ ] Run `npm run typecheck -w @ghostpay/web`, `npm run lint -w @ghostpay/web`, full web tests, build, lean-bundle scan and required hosted jobs.
- [ ] Verify actual IndexedDB cross-tab CAS has one winner; lost acknowledgement must force a reload before any new period.
- [ ] Confirm ciphertext cannot be decrypted under wrong key, profile, AAD, malformed envelope or restored over newer history.
- [ ] Execute and verify M4 dormant browser key factory tests, zeroization and cross-profile isolation; connect real UI idle lock/unmount disposal. Sign only after a committed reservation and fresh authority checks.
- [ ] Complete browser UI, P04 signed invoice, exact payment status, backup merge and reminders with regression tests.
- [ ] Obtain independent code/security review and integration owner release; verify CI for final commit.
- [ ] Merge qualified stack in approved order, verify application reachability and Pages behavior. Do not equate library tests with production activation.

## Known failures and limits

M3 `7079eedf` hosted CI: `ts-lint` failed with redundant typed assertions at `lifecycle.ts:38` and `lifecycle.test.ts:54`; aggregate `typescript` job failed as a consequence. Separate M3 web test/typecheck and Pages browser jobs passed at that earlier SHA. Corrected lint assertions on M4 branch only. CI status for final M4 head must be checked independently.

Local GitHub clone/runner unavailable (DNS); no local Vitest execution, browser verification or separate security reviewer is claimed here. All M4 source changes remain inactive until explicit wiring into Pages. This checklist must not be marked VERIFIED_COMPLETE without runtime/browser evidence.
