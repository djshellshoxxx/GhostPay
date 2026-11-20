# SellerKeys preflight ownership continuation — 2026-11-20

## Scope and provenance

Branch: `fix/ghostpay-backup-preflight-20261120-r2`.
Base: final idle source/docs `7417881ac7f243b50f7b5c1682c66a4e3f87c736`,
tree `9cf5006b14404c3d96ea0d040a42b5feab8d87ca`.
The idle runtime remains `1ca7105e050f7d76aee18fe3efee3cd02cd72cb4`.

Refreshed PR #314 donor: `e6ed3ee64a786c33b1af06b5fc7a51d742eb6544`;
runtime commit `49535f3bdbdda6f133e397097e56a8dde8413d94`.
The donor operation model is broader than this recovery and would remove idle
suspension visibility if copied wholesale. Retain current separate cancellable
unlock and durable-write lifetimes, all current regressions and own-installation
guards. Recover only the missing preflight/export/write ownership behavior.

| Source | Donor blob | Recovery |
|---|---|---|
| `apps/web/src/views/SellerKeys.tsx` | `d509e675dda2910850c4a95a5697761107807f69` | Selective reconciliation after controlled RED |
| `apps/web/src/views/SellerKeys.operation.test.tsx` | `05c846289be5827c2e9028c28661b1c2f242c9b0` | Exact additional `SellerKeys.ownership.test.tsx`; 17 cases |
| `apps/web/e2e/backup-ownership.spec.ts` | `78bc60dcd7e871166d632dd3b92302cc643eac8e` | Exact new file; two browser journeys |

The original five-case `SellerKeys.operation.test.tsx` remains unchanged, including
its deletion/session-replacement boundary. This checkpoint records tests before
runtime edits. The ownership claim was recorded before either.

## Acceptance

- Own the recoverability read before awaiting it. Cancellation, input edits,
  supersession, session replacement and unmount must retire its continuation.
- Retain the same controller from preflight into decryption. A false or failed
  preflight releases its own busy state without clearing a newer operation.
- Recheck current controller and session after export authorization, before
  encryption. Obsolete authorization cannot begin new encryption or download.
- Give durable save/delete a synchronous owner separate from cancellable work;
  refuse duplicate/colliding writes and unlock during a pending write. Only the
  initiating write may release its busy state.
- Preserve idle suspension visibility, own-import/unlock completion, verified
  backup gating, and the independent durable-write lifetime across app locks and
  session changes.

## Validation status

No tests have run for this continuation at this checkpoint. The parent coordinator
will schedule a bounded controlled RED against unchanged runtime, then qualify the
reviewed adaptation with existing configuration and dependencies. No install or
dependency copy is permitted for this work.

The original refreshed #314 browser attempt failed before Chromium could launch;
neither browser body ran. The same local socket restriction remains. These two
journeys are authored acceptance, not execution evidence. Hosted full/lean browser
checks remain required. No local retry or policy bypass is planned.

Root owns publication and integration. No main merge, release, deployment,
contract, fee, relayer, cryptographic-format, dependency or configuration change
is part of this continuation.
