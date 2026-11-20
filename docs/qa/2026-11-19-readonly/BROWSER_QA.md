# GhostPay browser/workflow QA — read-only source and local component execution

## Source and execution scope

- Repository: `djshellshoxxx/GhostPay`.
- Main tested: `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
- Runtime: Node `v24.22.3`, exact committed npm dependency lock; Vitest `5.0.5`; one test worker.
- User request: investigate QA/QC/stress/fuzz issues and leave notes for a separate repair worker. No production source, committed test, dependency manifest, workflow or configuration was edited by this lane.
- New controlled workflow probes and all logs were kept outside the repository. They exercise the existing React components using synthetic session/keystore data and deferred async seams. No live payments, public RPC load, or external services were used.
- The candidate issue below was independently corroborated by the QC lane against recent source branches. That comparison is source evidence, not fresh execution of those branches.

## Confirmed finding BROWSER-QA-01 — overlapping backup actions strand the previous form's busy state

**Priority:** Medium / P2 functional recoverability workflow defect.
**Status:** Confirmed in local component execution on main. Pending repair by a separate worker.
**Affected main blob:** `apps/web/src/views/SellerKeys.tsx` = `437c684af1fac0f759607bb3fe4f8e37238a3d89`.

### Expected behavior

When starting a different backup operation cancels an existing operation, the cancelled operation's form must return to an actionable state. The UI should either serialize incompatible operations explicitly or end the previous operation's busy indication when it is superseded. The backup-export action should be enabled when no export is pending. A cancelled verification should stop displaying “Cancel verification”.

### Actual behavior

Two ordinary action sequences expose the same underlying defect:

1. Start **Download encrypted keystore** and, while its asynchronous work is pending, start **Verify backup** using a previously saved file for those synthetic keys. The second action is enabled. It aborts the first controller. Once verification and the abandoned export settle, **Download encrypted keystore** remains disabled because `busy` is still `true`.
2. Start **Verify backup** and, while verification is pending, start **Download encrypted keystore**. Export is enabled, aborts verification and completes. Once both promises settle, the UI still displays **Cancel verification** and the **Verify backup** button remains disabled because `verifyBusy` is still `true`.

The first sequence interrupts a core backup workflow. A stale busy state persists in the mounted Seller keys view rather than clearing after async settlement. The second sequence also presents an operation as pending after it has been cancelled. The controlled tests establish a UI-state defect; they do not establish key corruption or loss of funds.

### Cause and locations

- `SellerKeys.tsx:123–127`: `stopOperation()` aborts and clears the shared controller and operation kind but leaves all form busy flags unchanged.
- `SellerKeys.tsx:170–174`: `startOperation()` calls `stopOperation()` for every export, import, unlock and verification, so separate forms share cancellation ownership.
- `SellerKeys.tsx:216–227,247–255`: export sets `busy=true`, but a superseded export returns before either its success or failure cleanup reaches `setBusy(false)`.
- `SellerKeys.tsx:285–304`: verification sets `verifyBusy=true`, but superseded success/error paths return before `resetVerify()` or `setVerifyBusy(false)`.
- `SellerKeys.tsx:571,596–597`: each action is disabled only by its own busy flag. Starting the other action during the first operation is an ordinary enabled UI interaction.

The latest candidates inspected by the independent QC lane (`#278`, `#300`, `#302`, `#303`) use SellerKeys blob `2c17d389ad6d108a68470e075caf98d0a987cd33`. Its changes add recovery/suspension UI; the shared-controller/busy-state code relevant to this issue is unchanged. The issue therefore remains a source-level concern on those candidates. Only main was executed in this lane.

### Execution evidence

Scratch test selection: four focused component cases against the actual main component.

| Case | Result |
| --- | --- |
| Export → verification, then settle both operations; expect export enabled | Failed: expected `disabled=false`, received `true` |
| Verification → export, then settle both operations; expect verification no longer pending | Failed: “Cancel verification” still present |
| Control: single completed export returns its own button to enabled | Passed |
| Control: explicit verification cancellation removes its pending state | Passed |

Initial run: **2 failed, 2 passed**, one test file, 9.75 seconds, exit 1. The failures are intended desired-behavior assertions and constitute the observed regression evidence. The async public helper seams were held or completed with synthetic results to make action order deterministic; actual UI handlers, state, cancellation/version checks and rendering remained unchanged.

Command, from `apps/web`:

```text
node ../../node_modules/vitest/vitest.mjs run \
  --config /workspace/scratch/cba2a7a04ebf/qa-browser/workflow.config.mts \
  --coverage.enabled=false --maxWorkers=1 --reporter=verbose
```

Intermediate evidence retained in the QA workspace: `workflow-probes.test.tsx`, `workflow.config.mts`, `workflow-probes.log`. The first external-config startup used `.ts` outside an ESM package and failed with a CJS/top-level-await loader error. Renaming that scratch-only configuration to `.mts` resolved the harness setup error; it was not a product failure. No project configuration was changed.

### Repair handoff and acceptance

Assign a focused Seller keys operation-state fix. Model cancellation and busy state together, or explicitly serialize the forms. When an operation is superseded, clear only the busy state owned by that operation. Preserve the independent save/delete lifetime: the existing comments intentionally prevent cancellation from re-enabling a still-running local-vault write.

Add regressions for both action orders above, plus verification/unlock transitions where applicable, late success and late failure, explicit Cancel, navigation/unmount and idle lock. Confirm that all settled/superseded actions have accurate enabled states and no stale success message. Keep backup verification, session guards, step-up checks and the save/delete lifetime intact. Existing single-operation and explicit-cancel controls must remain passing. Re-run the SellerKeys component suites and a browser journey with delayed local operations after repair.

## Confirmed QC finding BROWSER-QC-02 — ledger activation test observes presence before click readiness

**Priority:** Low / P3 test reliability issue.
**Status:** Observed in the broad selection, original file passes in isolation; a controlled diagnostic confirms the synchronization gap. This finding concerns the test's observation/interaction sequence.

`apps/web/src/components/ReconciliationLedger.test.tsx:200–215` starts preview and immediately clicks the element returned by `findByRole('button', { name: 'Activate previewed historical records' })`. Presence alone does not establish that the button is enabled.

The actual preview handler (`ReconciliationLedger.tsx:566–574`) sets `preview` before the enclosing `run()` finishes its additional `current.readState()` await (`:319–324`) and clears `busy` (`:336–340`). The preview therefore briefly contains an activation button with `disabled={busy}` (`:586–590`). An ordinary click during that interval is correctly ignored. The existing test then waits for imported records even though it never performed an effective activation click.

### Evidence

- Broad 80-file selection: the case failed after 1,211 ms, unable to find “Imported historical observation”. The DOM retained the preview and zero stored records with no product error.
- Original `ReconciliationLedger.test.tsx` run alone: **17/17 passed**, 10.71 seconds, unchanged source and tests.
- A separate scratch-only diagnostic deliberately held just the post-preview `readState()` tail. It confirmed that the button was present but disabled, the presence-only click invoked no activation, and releasing the readback did not replay that ignored click. Waiting until enabled and clicking then invoked activation exactly once and displayed the imported historical observation: **1/1 passed**, 9.20 seconds.

This accounts for a timing-sensitive test failure without claiming lost records or a broken import operation. Related nearby test sequences that click an asynchronously rendered action immediately after `findByRole` deserve the same enabled-state check.

### Repair handoff and acceptance

Have the test wait for the existing activation control to become enabled before clicking. Retain its assertions that imported records are historical/untrusted and that preview activation is explicit. Add a controlled delayed-readback case so the wait is justified by a real intermediate UI state. Do not replace this state assertion with a longer arbitrary sleep. A focused original-file rerun and the delayed-readback case should both pass; the component's intended disabled state should remain unchanged.

Intermediate evidence: `workflow-selection.log/json`, `ledger-original-isolated.log/json`, `ledger-probes.test.tsx`, `ledger.config.mts`, `ledger-timing-diagnostic.log`. None of these scratch test files was added to the repository.

## Local execution and limitations

Focused runs disable coverage; they do not satisfy the repository's full coverage gate.

| Local run | Observed result | Qualification limit |
| --- | --- | --- |
| Supplemental backup-overlap probes | 2 failed desired-behavior assertions, 2 passing controls; 9.75 s | Confirms BROWSER-QA-01 on main; deferred helper seams, real React handlers/state |
| Broad 80-file web workflow/component selection | 880 passed, 1 failed, 11 unfinished of 892 collected cases; 639.20 s, exit 1 | One ledger click-readiness failure and one SIGKILL'd worker; not a clean pass |
| Original ledger file, isolated | 17 passed; 10.71 s, exit 0 | Does not retroactively turn the broad run green |
| Delayed ledger readback diagnostic | 1 passed; 9.20 s, exit 0 | Confirms BROWSER-QC-02 cause and a successful explicit action after readiness |
| Original SellerKeys file, isolated | 3 completed passes of 39 collected cases, followed by worker SIGKILL; 15.28 s, exit 1 | No clean local qualification for this original file; no assertion failure preceded the process kill |
| Existing scanner protocol and tag concurrency selection | 18 scanner/protocol + 13 tag concurrency/lifetime cases completed successfully; combined command 54.27 s, exit 1 | The additional one-million-wire fuzz file in this command was interrupted by worker SIGKILL and is not a pass |
| Supplemental native Node scanner workload | 1,000,000 generated wire entries in 200 batches passed the empty-match/scanned-count assertions; 114.980 s, exit 0 | Actual scanner source, same generator and seed; separate diagnostic rather than a completed Vitest gate |

The interrupted broad-run worker was running `SellerKeys.test.tsx`. Console output reports **78 passed files, one failed file, one interrupted file**, plus an unhandled worker `SIGKILL`. The JSON's file status misleadingly labels SellerKeys as passed, while its assertion list contains **11 pending cases**. The report uses the actual per-assertion and worker evidence. Process-kill cause was not established; high host load and limited available memory were observed during the run. After the coordinator's heavy work completed, one original-file rerun also ended in SIGKILL, this time after three completed assertions. Both SellerKeys attempts had a 1,536 MiB V8 heap cap and one worker. No further repetitions of that memory-heavy file were attempted. These interruptions remain execution/qualification limits, not confirmed product defects. The original broad run is not relabelled green based on partial or focused reruns.

The scanner/tag command used a 1,024 MiB V8 heap cap and one worker with unchanged test cases and deadlines. Its JSON top-level `success: true` conflicts with process exit 1 and the recorded SIGKILL: the interrupted `scannerCore.fuzz.test.ts` assertion is `pending`. **Do not use that JSON success field or file status alone as an acceptance signal.** The existing repository fuzz test has not completed in this run. A lower-overhead, scratch-only native Node invocation imported the actual scanner source and used the same seed/batch generator. It completed successfully; its result is separate diagnostic evidence, not a substitute for the interrupted original Vitest gate.

### Bounded scanner workload

The native counterpart imports `apps/web/src/lib/scannerCore.ts` directly and uses the checkout's built `@ghostpay/core-crypto`. It copies the existing `scannerCore.fuzz.test.ts` wire generator unchanged: xorshift seed `0x47504d31`, 200 batches of 5,000 generated entries. After each batch it asserts an empty match list; at the end it asserts `scanned === 1_000_000`. The generated wire corpus is deterministic; the owner-key fixture is freshly generated, as it is in the original test. The original test file's baseline blob is `77ce0bd28772235418d9e241b0da84028068035f`.

The run completed **1,000,000 generated entries in 114.980 seconds**, exit 0, under a **384 MiB V8 heap cap** and an **outer 180-second deadline**. Samples taken after each batch observed peak heap use of **176,276,456 bytes** and peak RSS of **318,287,872 bytes**. These are sampled observations from this environment, not exhaustive process-memory maxima or a throughput service-level guarantee. This is one generated-property workload with one wire seed; it is not one million independent test cases, broad input-space exhaustion, or an original-suite pass.

Existing test selection, from `apps/web`:

```text
NODE_OPTIONS=--max-old-space-size=1024 node ../../node_modules/vitest/vitest.mjs run \
  src/lib/scannerCore.test.ts src/lib/scannerCore.fuzz.test.ts src/lib/tagsConcurrency.test.ts \
  --coverage.enabled=false --maxWorkers=1 --reporter=verbose --reporter=json \
  --outputFile=/workspace/scratch/cba2a7a04ebf/qa-browser/scanner-tag-stress.json
```

Completed supplemental command:

```text
timeout 180s node --max-old-space-size=384 \
  /workspace/scratch/cba2a7a04ebf/qa-browser/scanner-native.mjs \
  > /workspace/scratch/cba2a7a04ebf/qa-browser/scanner-native.log 2>&1
```

Intermediate evidence: `scanner-tag-stress.log/json`, `scanner-native.mjs`, `scanner-native.log`. No scanner or committed test source was changed. No further stress repetition was needed after this bounded diagnostic completed.

### Functional selection scope

Direct source review covered `AppShell`, `SellerKeys`, `Settings` and settings exchange, `Scan`, `BackupPanel`, `SecretBackup`, `Common` copy/download controls, `ErrorBoundary`, `Home`, `ContextHelp`, `PaymentRequestQr`, `QrView`, the IndexedDB tag adapter and scanner protocol, together with relevant existing tests and prior notes. The local workflow selection additionally exercises the application shell, all `views`, ordinary `components` and `i18n` tests (80 files selected; `QrFrame.security.test.tsx` excluded). Transitive execution does not mean every source file was manually reviewed.

Broad workflow command, from `apps/web`:

```text
NODE_OPTIONS=--max-old-space-size=1536 node ../../node_modules/vitest/vitest.mjs run \
  src/App.test.tsx src/AppLean.test.tsx src/AppLean.fragment.test.tsx \
  src/AppShell.i18n.test.tsx src/AppShell.idleClock.test.tsx \
  src/views src/components src/i18n \
  --exclude src/components/QrFrame.security.test.tsx \
  --coverage.enabled=false --maxWorkers=1 --reporter=verbose --reporter=json \
  --outputFile=/workspace/scratch/cba2a7a04ebf/qa-browser/workflow-selection.json
```

### Native browser preflight

Playwright `chromium.launch()` with the installed `/usr/bin/chromium` and the repository's `--no-sandbox` launch argument failed **before creating any page**:

```text
process_singleton_posix.cc:297
socket() failed: Operation not permitted (1)
process exit: SIGABRT
```

The short preflight would only have rendered a local static `<h1>`; it never reached that step. This is an execution-environment restriction, not a GhostPay browser failure. No local Chromium, Firefox, WebKit, responsive-layout or accessibility acceptance pass is claimed. Existing hosted results, if included in the coordinator's report, must retain their own source/merge SHA and run identity.

The repository's Playwright projects emulate Pixel/iPhone/iPad viewports using Chromium. They do not provide real Safari/WebKit or physical-device coverage. No such cross-browser coverage was obtained in this lane.

### Final source integrity check

After the final local workload, `git rev-parse HEAD` remained `c977b5d6723f6822c3b5d86cd6b231712c53c395` and `git diff --name-only -- . ':(exclude)docs'` returned no tracked changes. All supplemental harnesses and logs in this lane remain outside the repository. The coordinator owns the documentation-only publication and any comparison with main commits that arrived during the audit.
