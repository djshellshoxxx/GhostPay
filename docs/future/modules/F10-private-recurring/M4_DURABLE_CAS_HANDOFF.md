# F10 M4 — encrypted durable CAS and restart-safe prepared period reservation

Date: 2026-11-22 (Pacific). Branch: `feature/f10-durable-cas-m4-20261122`.
Base: M3 `7079eedfc67180c9a0012c7154758e41fe6208c9` (#396), stacked over #391 and #371.
Observed main: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.

## Scope

M4 adds a dormant `RecurringEncryptedVault` with strict encrypted snapshot intake, versioned AES-256-GCM envelopes, 96-bit random IVs, profile-bound authenticated data, explicit session locking, and durable CAS through the repository's existing `ReconciliationVaultStore` interface. The active Pages host already provides `IdbReconciliationVaultStore`, whose `compareAndSwap` checks the previous ciphertext and session guard *inside* the IndexedDB readwrite transaction; M4 takes this interface through injection rather than building another unreviewed read+write store. No old branch or shared state lease has been updated.

## API and behavior

- `unlock(key)` accepts only a dedicated nonextractable AES-256-GCM 256-bit key; the host must derive it from the existing live seller/viewing-key architecture under a **new F10-specific HKDF info** and must call `lock()` on idle/session/profile changes. M4 now includes a dormant `browserVault.ts` factory that performs F10-specific HKDF key derivation from the seller's ephemeral viewing-key copy, zeroizes the copy, and revokes the returned handle via `subscribeSession`; no production UI or idle-lock/unmount wiring is activated.
- `load()` returns the authenticated, strict-decoded, profile-bound snapshot and an unforgeable, instance-local CAS handle (opaque ciphertext stored in a WeakMap). No signing consent is recreated on reload.
- `commit(previous, next)` validates the complete next snapshot, rejects stale revisions, missing prior plans, cursor rollback, removed or rewritten event/artifact references, and invalid outbox status regressions. The storage adapter atomically enforces the ciphertext CAS; no externally issued invoice is claimed until the transaction successfully commits.
- `reserveReviewed(controller, view, previous, context, artifactRef, nextRevision)` consumes the existing M3 live review, then commits a **prepared reference only** under CAS. A conflicting tab loses and must reload/review again.
- `exportEncrypted()` returns authenticated ciphertext only.
- `restoreToEmpty(ciphertext, newRevision)` is an explicit, safety-limited recovery path: same seller/profile key, empty destination only, all active imported plans paused, old outbox and cursor preserved. No merge-over-live implementation is claimed.

No browser key, spending key, unsigned wallet action, automated invoice sender, email channel, background job, or payment is introduced. **Prepared is not issued, exported, delivered, settled, or paid.** Cross-device exactly-once issuance still needs a separately designed shared reconciliation mechanism; M4 offers same-origin transactional protection only.

## TDD and qualification

- Tests were committed first at `262f3e910bda7a4a8ced81a02b38bcc800dea94b`, before implementation commit `edbcdd43162137eebf279a4008657bc44ff1206e`. This is a source-order receipt, **not proof the RED tests executed**.
- 21 focused Vitest cases now cover encrypted reload, wrong key, malformed/tampered envelope, foreign profile backup, unreviewed initialization, concurrent tabs and reviewed reservations, monotonic history, ambiguous write acknowledgement, lock between encryption and CAS, empty-store restore, key restrictions, rejection of forged issuance, stale handles across unlock, skipped initial cursors, immutable plan revision/UTC anchor/cadence, one unreviewed new-plan rejection case, and five dormant browser-session HKDF/zeroization/rotation tests.
- Inherited F10 M2 typed ESLint errors found in M3 hosted CI were corrected in this descendant only: remove redundant assertions in `lifecycle.ts` and `lifecycle.test.ts`. Those earlier M2/M3 PR branches were not changed.
- Full Vitest, lint, typecheck, coverage, static build, browser and independent review remain **UNVERIFIED** until actual results for the final M4 head are observed.
- Git clone is unavailable in the attached local container (external GitHub DNS fails); GitHub-hosted CI is the available execution gate.

## Additional required work

1. Independent security review of AES-GCM envelope bounds, IV generation, AAD and host key derivation; review the same-origin CAS and all failure-after-commit paths. Require actual browser IndexedDB concurrent-write tests.
2. Qualify the new dormant `createCurrentRecurringVault` browser-session factory in hosted CI and real browsers. Mount only after P04/UI gates; ensure the live UI disposes the handle at idle-lock, profile change and unmount and never exposes seller keys.
3. Bind P04 provider-signed invoice/nonce/asset/fee policy to the reserved plan-period, with an explicit *new* live seller authorization after CAS. Preserve P04 immutable invoice artifacts and signed terms. Define issuance/delivery status with durable outbox transitions.
4. Integrate F10 plan creation and management UI, reminders/calendar export, manual sharing, localization, accessibility, reduced-motion, and no sensitive locked-screen rendering.
5. Implement reviewed encrypted backup merge into existing profiles, migration of legacy data (pause unreviewed plans), schema evolution and recoverable recovery checkpoints.
6. Cover process crash before/during/after commit, multi-tab interleavings, storage eviction, clock changes, wallet disconnects, and browser acceptance. No exactly-once guarantee across uncoordinated devices.
7. Reconcile #371 → #391 → #396 → M4 ownership, finish hosted CI and independent security review, then merge only after the externally held integration lease has actually been released. Do not deploy from this draft.
