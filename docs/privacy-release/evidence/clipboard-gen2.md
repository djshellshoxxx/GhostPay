# Clipboard privacy — independent generation 2 milestone

Branch `privacy/v1-clipboard-20261120`; predecessor `52f1332f97a066c59318dfb8f7985f1deba2dd93`. Tested source **`a17bad1900d58c005efd42ca308907531b2bd9ed`**, tree `af710d89f790437fc56cc866f819ccb8fb304eb1`. Ownership `4a52a75b`, tests-only regression `54286f1a`. The predecessor's digest ownership and clear serialization are retained; no external code, dependency or cryptographic implementation was added.

## Independent review and repaired finding

**CLIP-M2-01 — queued copy outlives its control/reveal (privacy lifecycle defect).** `writeClipboardText` waits for an already-dispatched clear so that clear cannot finish after a newer app copy. However, its queued callback formerly dispatched the new copy without checking whether the source control or backup reveal still existed. A user could hide or leave the backup while the copy remained queued; once the earlier clear completed, the now-hidden backup was newly written. If a compensating read was denied, that backup remained on the clipboard. This is an undispatched local queue entry, distinct from a native write already handed to the browser.

The fix accepts a current-copy predicate and checks it immediately before dispatch, including after each queued wait. Common CopyButton supplies its existing attempt/text identity plus global copy intent. SecretBackup supplies its existing mounted/reveal/request identity plus global copy intent. Stale queued entries reject with neutral text. Immediate current copies still call the native write synchronously, preserving their activation opportunity. Native writes already dispatched retain existing completion/cleanup behavior; recovery sources and backups are not deleted.

Three regressions failed before the repair: backup Hide, backup unmount and ordinary CopyButton unmount while an earlier clear was pending. These actual component paths now pass. The broader original backup suites also exercise late native completion, replacement copies, queued clear order, failed replacement writes, retry activation, app lock and view exit.

The rest of the independent review found the intended boundaries intact: digest-only delayed comparison; intent reservation before native dispatch; cleanup revisions preventing cancelled preferences from rearming; two readable comparisons and current-intent checks before an empty write; no unconditional clearing after denied/unavailable reads; serialization of newer copies behind a dispatched clear; and retained cleanup ownership only where the current backup may still remain. Global cleanup intentionally survives the originating copy view until its bounded timer or app-level preference/lifetime revocation. SecretBackup cleanup retry retains a digest, not backup plaintext.

## Executed evidence

An initial root-cwd invocation found no files and exited1; it executed no tests and is preserved as setup failure. The corrected original-config RED ran at `54286f1a`: **3 failed,13 explicitly filtered,exit1**,3.08s.

Final command, cwd `apps/web`:

```sh
NODE_OPTIONS=--max-old-space-size=1024 ../../node_modules/.bin/vitest run src/lib/clipboardPrivacy.test.ts src/components/Common.clipboardPrivacy.test.tsx src/components/SecretBackup.clipboardPrivacy.test.tsx src/views/Settings.clipboardPrivacy.test.tsx src/components/SecretBackup.test.tsx src/components/SecretBackup.views.test.tsx src/components/Common.test.tsx --coverage=false --maxWorkers=1
```

**77 passed in7 complete original files,zero skips,exit0**,18.57s, at the source/tree above. The three RED cases are included in the77 and the predecessor24 checks overlap this run; do not add counts as distinct coverage. `bash scripts/scan-secrets.sh` and `git diff 52f1332f..HEAD --check` passed. Complete compressed logs and raw SHA256 hashes are adjacent in [evidence.json](clipboard-gen2/evidence.json).

## Browser review and honest limits

The existing `e2e/clipboard-privacy.spec.ts` has two relevant journeys: saved opt-in/expiry/replacement/disable after view unmount, and denied-read fault injection with successful real browser writes. Its second case deliberately injects a read rejection and does not qualify an actual OS permission prompt. I reviewed these cases but did not execute them while the coordinator schedules combined build/typecheck/browser gates.

Browser read/write is not atomic; an external copy after the last readable snapshot can still be overwritten by a clear already dispatched. Existing characterization tests retain that limitation. Browser APIs cannot erase clipboard history/synced copies, cancel native writes already dispatched, guarantee JS string zeroization, or guarantee cleanup when reads/writes are unavailable or denied. A pending copy may retain its input while its browser-dependent promise waits; this change prevents stale queued dispatch, not memory-erasure guarantees. No release/browser/full-suite qualification is claimed.

## Internal next-generation handoff

1. Integrate this released source into the standalone v1 candidate, preserving the newer Common and SecretBackup call sites and three regression cases. v1.1 must not become a v1 dependency.
2. Run original typing, typed lint and relevant original browser clipboard journeys on the exact combined candidate in the coordinator's quiet resource window. Add browser queue-fault coverage only if it resolves a concrete remaining uncertainty; preserve the granted-permission versus fault-injection distinction.
3. Verify both callers continue supplying current-copy predicates after shared-file reconciliation. Preserve normal immediate activation, late native-write bookkeeping and explicit backup recovery.
4. Keep full coverage, hosted/security and publication gates open until executed. No remote publication/deployment or gate waiver follows from this focused milestone.

Ownership is released at the evidence commit. No process remains active and no remote mutation occurred.
