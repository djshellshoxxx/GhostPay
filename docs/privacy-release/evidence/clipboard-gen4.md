# Clipboard privacy — remaining caller fixtures, generation 4

Branch: `privacy/v1-clipboard-20261120`. Predecessor: `17df2a8e651483c9e66ebccee38f57187d7eb374`. Ownership claim: `70c27ed84c7942d4d19990c5f22bfcc51b22524c`. Tested fixture repair: **`6a71c69caac9b6c31e26e45bcea0651dd29398e4`**, tree `c450f130e192faeb9322f0b4a12f9e8b9791ff12`.

**The remaining BTC and TRON backup clipboard fixtures are corrected. Production code is unchanged.** This follow-through maintains existing client tests; it introduces no platform feature, external source copy, dependency, configuration or release-gate change.

## Published baseline and current reproduction

Generation 3's handoff identified the original BTC copy/Lock and denied-write retry cases, plus the original TRON copy/Lock case. All three supplied `writeText` without `readText`, although the published runtime already required readable matching contents before cleanup.

Independent immutable-source review verified identical published/current view and test blobs:

| File | Blob at published `13762896` and current `70c27ed8` |
| --- | --- |
| `features/btc/BtcView.test.tsx` | `283bb07fb7866c114c67d238d827203ae5d02d63` |
| `features/btc/BtcView.tsx` | `640097f71621009a82c2f3f81d4bf831506b5121` |
| `features/tron/TronView.test.tsx` | `1e2b9535454af35c4dbb07062bfdcf1ac2d974cd` |
| `features/tron/TronView.tsx` | `bc28c9d2d442e92da89328121da5be24c332ad18` |

The bodies of `clearClipboardIfUnchanged` and `clearCopiedBackup` are also unchanged. An unavailable read returns `denied` before an empty write. The original BTC retry fixture therefore never reaches the denied-write condition it intends to exercise. Generation 2's current-copy predicate affects new-copy dispatch rather than this cleanup path.

The original cases were executed on both sources before repair, using the original configuration:

| Source | Result | Exit / Vitest duration |
| --- | --- | --- |
| Published `137628961463fc5abd8b7927b2efe6b18a0a206a`, tree `da95c2f24426fd9dfd01e38472f07f5dc466cbf9` | Same three original assertions fail; 26 cases explicitly filtered | 1 / 12.00 s |
| Current claim `70c27ed84c7942d4d19990c5f22bfcc51b22524c`, tree `536276df920ff29778b3c93abd2b50a923295979` | Same three assertions fail; 26 cases explicitly filtered | 1 / 6.07 s |

Both used this command from `apps/web`, with `NODE_OPTIONS=--max-old-space-size=1024`:

```sh
../../node_modules/.bin/vitest run src/features/btc/BtcView.test.tsx src/features/tron/TronView.test.tsx --testNamePattern 'copies the (backup seed|key backup) only after a warning|empties the clipboard at the next click' --coverage=false --maxWorkers=1 --reporter=default
```

The published execution used a separate detached checkout. Package sources, root/package lock, web package manifest and Vite configuration were verified unchanged before reusing prepared dependencies and same-source build outputs. The temporary checkout and its owned dependency links were removed after execution. These results establish an inherited fixture mismatch; unconditional cleanup would violate the existing privacy contract.

## Fixture changes and preserved behavior

Only `apps/web/src/features/btc/BtcView.test.tsx` and `apps/web/src/features/tron/TronView.test.tsx` change under application paths. Each uses the small stateful read/write fixture pattern already established in generation 3's Solana tests. There is no new shared runtime helper or production state.

Both copy/Lock cases retain the warning, absence of copying before confirmation, exact initial backup write, eventual empty write and exactly two writes overall. They now check actual clipboard contents and disappearance of backup/payment presentation after Lock. `waitFor` observes asynchronous cleanup without changing assertions or timeouts.

The BTC retry case preserves the original sequence: the copy succeeds; a readable, matching cleanup attempts an empty write that rejects; the copied value remains; the next explicit activation clears it once, for exactly three writes overall; and a later Lock performs no additional write. The fixture now reaches the denied-write branch it previously could not reach.

Six new actual-view cases cover external replacement, denied reads and unavailable reads in both callers. They preserve the exact single-copy count and appropriate clipboard contents while checking the locked UI. Teardown unmounts the view and settles retained retry ownership against a readable empty clipboard, following the existing SecretBackup/Solana pattern.

The negative mocks settle immediately. These view assertions do not establish delayed native-operation, real permission-prompt or browser/OS-history behavior. UI removal is distinct from memory erasure; existing actual key-lock tests are included separately in acceptance.

## Complete focused acceptance

Exact source `6a71c69c`, cwd `apps/web`:

```sh
NODE_OPTIONS=--max-old-space-size=1024 ../../node_modules/.bin/vitest run src/features/btc/BtcView.test.tsx src/features/btc/BtcView.secrets.test.tsx src/features/tron/TronView.test.tsx src/features/tron/TronView.lock.test.tsx src/features/solana/SolanaView.test.tsx src/features/solana/SolanaView.lock.test.tsx src/lib/clipboardPrivacy.test.ts src/components/Common.clipboardPrivacy.test.tsx src/components/SecretBackup.clipboardPrivacy.test.tsx src/views/Settings.clipboardPrivacy.test.tsx src/components/SecretBackup.test.tsx src/components/SecretBackup.views.test.tsx src/components/Common.test.tsx --coverage=false --maxWorkers=1 --reporter=default
```

**137/137 passed in 13 complete files, zero skips, exit 0**, Vitest duration 49.22 seconds; wrapper duration 49.75 seconds. This includes all BTC/TRON/Solana caller tests selected above, their key-lock tests and the prior clipboard/backup/settings selection. Counts overlap predecessor and coordinator results and must not be summed as unique coverage.

On the same source, `bash scripts/scan-secrets.sh` and `git diff 17df2a8e..HEAD --check` passed. No full typecheck, typed lint, coverage, build, browser or hosted check ran in this lane. Those original gates remain coordinator-owned and open.

Five compressed logs and exact source, command, exit and source-comparison receipts are in [evidence.json](clipboard-gen4/evidence.json). Each original RED log contained two ephemeral generated backup values. The committed logs redact these standalone 64/128-hex values and record original raw, sanitized and compressed SHA256 hashes. The passing and integrity-check logs required no redaction. All compressed files were verified against their sanitized contents and hashes.

## Independent review

Fresh reviewer `/root/clipboard_gen4/caller_fixture_review` compared published/current sources, then reviewed immutable `6a71c69c` against `70c27ed8`. It confirmed the two-file fixture-only diff, inherited mismatch, preserved warning/write-count/clear/retry behavior, six no-clobber cases, asynchronous assertions and teardown isolation. **No blocker found in this bounded repair.** The reviewer made no writes and ran no execution checks; the test results above belong to this worker.

## Internal successor handoff

1. Reinspect the current branch, ownership registry and source pins. Merge this released feature branch into the standalone v1 candidate and then reconcile it into the cumulative v1.1 candidate. Preserve generation 2's queued-copy runtime and generation 3's Solana repair; this generation adds only BTC/TRON fixture/evidence changes.
2. Freeze the combined source before resuming original qualification. Do not reuse the coordinator's failed coverage blob from `573901ee` as though it came from the repaired source, or infer an original-suite pass from this 137-case focused selection.
3. The coordinator's three remaining caller cases are now addressed. No additional fixture mismatch was established by this lane. Further repairs should follow an actual failure and source comparison, preserving readable ownership and the no-unconditional-clear boundary.
4. Complete original type/lint/coverage/nocov/build/browser/hosted gates on the appropriate candidate when resources permit. The supported caller tests and immediate mocks do not replace built-browser clipboard/permission/activation acceptance. Specification milestone M3 remains open.
5. Preserve native clipboard races, denied access, already-dispatched writes and OS-history limits. Do not broaden this test maintenance into future privacy features, client activation, dependencies, crypto/fee/contract changes, remote publication, main/shared integration mutation, deployment or release.

All test processes stopped before the coordinator reclaimed the heavyweight window. The temporary published-baseline checkout was removed. Owned source paths and evidence are released; no remote mutation occurred.
