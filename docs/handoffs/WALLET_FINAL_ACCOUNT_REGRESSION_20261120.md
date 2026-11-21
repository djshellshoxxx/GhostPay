# Silent final account reread — regression handoff

## Scope and source

Worker: `/root/r2_privacy_qualification`, delegated by `fc3db078ca12-root-r2`.
Branch: `test/ghostpay-wallet-final-account-r2-20261120`.
Base: integration PR #307 at `5a745d4b5fba69b66a9779f88aefc63c253a4f27`.
New test: `apps/web/src/lib/wallet.finalAccount.test.ts`, blob `f0500d9e1c137632fe2f6fd2fb930c3311401872`.

The existing `recheckWallet()` rereads `eth_accounts` after its chain/network awaits and rejects a mismatch before send or signature submission. Existing browser coverage emits an account-change event, which can invalidate the operation before that final equality guard is exercised. These four cases add negative coverage for the existing guard; no new runtime defect or runtime correction is asserted.

## Authored cases

| Case | Expected behavior |
| --- | --- |
| Silent account change before send | First account reread is the connected account; after `net_version`, the final reread returns another account. Reject with the account-change error before `eth_sendTransaction`, any attempt-store access or mutation, preserving an existing submitted record byte-for-byte. |
| Silent account change before signing | The same late account mismatch rejects before `eth_signTypedData_v4`. |
| Unchanged account sends successfully | Submit exactly once, retain the prior journal record, and append one submitted attempt with the returned hash. |
| Unchanged account signs successfully | Request the typed-data signature once for the captured account and return the mock signature. |

The provider wrapper is installed after a real `connectWallet()` call using the existing `MockWallet`. It records both account answers and the provider-call sequence. It emits no lifecycle event, changes no session field and supplies no application-authority revocation callback, so those earlier cancellation paths cannot explain rejection.

## Verification state

**Vitest execution, TypeScript checking, typed lint and independent source review are pending.** No dependencies were installed in this worktree and no test process was started. Node's syntax-only check passed; that does not establish TypeScript or Vitest success.

The staged whitespace check and original repository secret scan passed. The complete staged delta is exactly the three owned files; all prior ownership text and the selected wallet/journal runtime and existing-test bytes remain exact to the pinned base.

The coordinator has installed exact-lock dependencies and is building the original library closure in the separate #307/#344/#350 candidate. After review and composition, run the new file there with its original Vitest configuration, for example from `apps/web`:

```sh
NODE_OPTIONS=--max-old-space-size=768 ../../node_modules/.bin/vitest run --maxWorkers=1 src/lib/wallet.finalAccount.test.ts
```

Record the actual combined source/tree, command, exit code and test counts before claiming a pass. Complete candidate gates remain coordinator-owned.

## Preservation and ownership

Only the new test, this handoff and an additive `ACTIVE_WORK.md` entry belong to this contribution. The exact-path overlap check found no implementation history and only the coordinator's explicit reservation for this worker. Existing source/tests and the event-driven browser cases remain unchanged.

The base wallet runtime blob is `800cfa90810b887898d4184ff3f5ccfb2601c971`; its existing test blob is `0eef38ea9deb736072515d3240eeabfbd6b5e49b`; the attempt-journal runtime blob is `b8c2ec1915b833a5b78286b9b9caca1c247e827c`. Their receipt/hash and journal safeguards are retained. No remote ref, workflow, dependency, shared integration lease, deployment or real-funds operation was changed by this worker.
