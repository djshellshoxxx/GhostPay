# Clipboard privacy — original-suite follow-through, generation 3

Branch: `privacy/v1-clipboard-20261120`. Predecessor: `9174ea73eb7d232b2e07a3b07238e6f216cd9226`. Ownership: `e077b1b1b155cab3bb372d4f9a17c2adeb46dbea`. Tested fixture repair: **`aeefe366cb89b9e571a521f18a0aa9b61fd92070`**, tree `e01f9be6c3b28045fcc4386a84416805ed7f7867`.

**The inherited Solana backup clipboard fixture is corrected. Production code is unchanged.** This follow-through adds no Solana feature, external source copy, dependency, configuration or release-gate change.

## Discovery and baseline classification

The coordinator's original coverage shard `1/8` on combined v1 source `573901ee1c66624e57143526571a3fd76f52f264` completed 512 passing cases and one failure across 36 files. The failing original Solana test supplied only `navigator.clipboard.writeText`, then expected Lock to write an empty string.

Published baseline `137628961463fc5abd8b7927b2efe6b18a0a206a` already required a readable matching clipboard before clearing. Its `clearClipboardIfUnchanged` calls `readText` inside a guarded block; an unavailable read returns `denied` before any empty write. `clearCopiedBackup` retains best-effort retry ownership. The generation 2 predicate changes new-copy dispatch, leaving this cleanup path unchanged.

Independent source inspection confirmed exact baseline/current equality for:

- `SolanaView.test.tsx`: blob `e03905fc598e4228ce609707c8ba6374a269bfbf`.
- `SolanaView.tsx`: blob `f9de347e9fac5ce8e370f00e479e6a9d1c785a92`.

The original case was then executed on both immutable sources using the original configuration:

| Source | Original selected case | Exit / Vitest duration |
| --- | --- | --- |
| Published `13762896`, tree `da95c2f24426fd9dfd01e38472f07f5dc466cbf9` | Same empty-write assertion fails; 1 failed, 13 explicitly filtered | 1 / 5.48 s |
| Current claim `e077b1b1`, tree `8cc40ed1706810b3ab057eabf9cbbde018e58fbe` | Same assertion fails; 1 failed, 13 explicitly filtered | 1 / 3.92 s |

Both runs used `vitest run src/features/solana/SolanaView.test.tsx --testNamePattern 'copies the backup seed only after a warning' --coverage=false --maxWorkers=1 --reporter=default`, from `apps/web`, with `NODE_OPTIONS=--max-old-space-size=1024`. The published run used a separate detached checkout. Package sources and lockfile were verified identical before reusing the coordinator's prepared dependency/build outputs. That temporary checkout was removed after execution; source objects and receipts remain.

This establishes an inherited fixture mismatch. Restoring an unconditional clipboard write would violate the existing specification.

## Fixture correction and preserved assertions

Only `apps/web/src/features/solana/SolanaView.test.tsx` changes under application paths. A mutable clipboard fixture now makes `readText` and `writeText` observe the same value. The positive case retains the warning, no write before explicit confirmation, exact initial seed write, eventual empty write and exactly two writes overall. It waits for asynchronous guarded cleanup and additionally checks actual clipboard contents and disappearance of the wallet/backup UI after Lock.

Three new actual-view cases cover external replacement, denied reads and unavailable reads. Each asserts that Lock removes the wallet/backup presentation while preserving the exact original one-write count and the appropriate clipboard content. No unconditional clear is accepted. The existing real-key app-lock test remains in the complete acceptance selection.

Test teardown unmounts the view and resolves retained denied-read retry ownership using the same working-empty-clipboard pattern as the existing SecretBackup suites. This isolates test state; it changes no production behavior.

## Complete focused acceptance

Exact source `aeefe366`, cwd `apps/web`:

```sh
NODE_OPTIONS=--max-old-space-size=1024 ../../node_modules/.bin/vitest run src/features/solana/SolanaView.test.tsx src/features/solana/SolanaView.lock.test.tsx src/lib/clipboardPrivacy.test.ts src/components/Common.clipboardPrivacy.test.tsx src/components/SecretBackup.clipboardPrivacy.test.tsx src/views/Settings.clipboardPrivacy.test.tsx src/components/SecretBackup.test.tsx src/components/SecretBackup.views.test.tsx src/components/Common.test.tsx --coverage=false --maxWorkers=1 --reporter=default
```

**95/95 passed in nine complete files, zero skips, exit 0**, Vitest duration 22.21 seconds; wrapper duration 22.69 seconds. This includes all 17 Solana view cases, the actual key-wipe app-lock case and the 77 predecessor clipboard/backup/settings cases. Counts overlap predecessor and coordinator selections and must not be summed as unique coverage.

On the same source, `bash scripts/scan-secrets.sh` and `git diff 9174ea73..HEAD --check` passed. No full typecheck, typed lint, coverage, build or browser command was run in this lane. The coordinator owns those remaining original gates.

Five verified compressed logs and exact source/command/exit receipts are in [evidence.json](clipboard-gen3/evidence.json). Failed assertion output contained ephemeral generated test seeds. Committed failure logs replace those standalone 64-hex values and retain both original raw and sanitized SHA256 hashes, plus hashes of the compressed sanitized files. The passing log needed no redaction. No raw seed value is included in this handoff or committed failure logs.

## Independent review

Fresh reviewer `/root/clipboard_gen3/clipboard_fixture_review` first compared published/current cleanup paths, then reviewed immutable `aeefe366` against `e077b1b1`. It confirmed the one-file fixture-only diff, preserved exact warning/write assertions, stateful ownership model, appropriate asynchronous positive assertion, three no-clobber cases and isolated retry cleanup. **No blocker found in the bounded change.** The reviewer ran no execution checks; test evidence above belongs to this worker.

The negative mocks resolve or reject immediately. They establish these view boundaries without claiming deferred native-operation, actual permission-prompt or browser/OS-history behavior. Clipboard comparison and writing remain best effort; already-dispatched native writes and external races retain the documented limitations.

## Internal successor handoff

1. Integrate this released fixture/evidence branch into the standalone v1 candidate, then reconcile it into the cumulative v1.1 candidate. Preserve the generation 2 queued-copy runtime and all original warning/exact-write assertions. There is no production change to reconcile.
2. The coordinator's narrow caller inventory identified similar ownership assumptions in `apps/web/src/features/btc/BtcView.test.tsx` (two cases around lines 65–103, including the cleanup retry) and `apps/web/src/features/tron/TronView.test.tsx` (around lines 74–87). A fresh generation must independently compare/reproduce those existing fixtures before repairing them, preserving readable ownership, explicit warnings, retry semantics, newer contents and lock/key cleanup. This generation did not execute or repair those cases.
3. Freeze the new candidate before resuming original qualification. The coordinator's previous failed shard belongs to `573901ee`; do not merge its blob with a different-source run or infer a rerun result from this focused acceptance. Preserve the 286-file inventory and separate original `.nocov` pass.
4. Run complete original type/lint/coverage/build/browser/hosted gates when the environment permits. Preserve failed/resource-killed outcomes and the existing clipboard permission/race limits. The 95-case selection does not close specification milestone M3.
5. Reinspect the current branch and active ownership before writing. No external publication, main/shared integration mutation, deployment, release or gate waiver is authorized by this milestone.

All test processes have stopped; the heavyweight execution window and owned source paths are released to the coordinator. No remote mutation occurred.
