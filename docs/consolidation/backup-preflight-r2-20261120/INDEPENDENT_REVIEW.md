# Independent source review: SellerKeys preflight ownership continuation

**Decision: approve the bounded runtime change. No blocking findings in the reviewed diff.**

This is a read-only source/test review. The reviewer did not execute tests, builds or browser journeys. The coordinator owns separate RED/GREEN and type/lint/build qualification.

## Exact source

- Repository: `djshellshoxxx/GhostPay`.
- Reviewer: `/root/backup_independent_review_r2`.
- Reviewed at UTC: `2026-11-20T18:45:00.329477+00:00`.
- Base idle source: `7417881ac7f243b50f7b5c1682c66a4e3f87c736`; published equivalent PR #331 is `f5e04a30bd538b5dba6202885c8e1c3cceb31fa3`.
- Tests-only checkpoint: `1a69f706223f8bb976ec62f86d317aca8103290b`.
- Reviewed runtime: `fde65b79e1cb97b06f627819f70ca7c88ecafed5`; tree `bb94ccbebf3b672dbb3a726174fd1529aae510c4`.
- Runtime blob: `eaa2b33de93edfab885ec2bbc98df6f2c8a23c19`.
- Fresh `git status --porcelain` was empty at review.

## Findings and rationale

### Cancellable unlock preflight

The unlock entry now creates its controller and busy state before any recoverability read. A current-owner check and the captured session revision guard gate its resolution. Cancellation, passphrase edits, another cancellable operation, app lock, session replacement and unmount therefore retire the old read's continuation. A successful recoverability read passes the same controller into decryption, preserving its original cancellation boundary and generation. There is no preflight `finally` that could release a newly started decrypt operation.

When recoverability is false, the preflight releases only its own controller and unlock busy flag before showing the existing replacement confirmation. A rejected read reports only while both controller and session remain current. A changed session silently retires the owned preflight, and an already-replaced controller cannot clear the newer owner's busy state. The direct path for no loaded keys or an external backup and the explicit replacement-confirmation path still use the original lower-level unlock checks.

### Export authorization

After awaiting authorization, the export continuation checks both the current controller and the captured session revision before calling encryption. An obsolete authorization therefore cannot start encryption. The existing post-encryption ownership/session checks still gate download, backup marking, QR output and completion notices. The encrypted recovery path for idle-retained keys remains available through the unchanged session helper; no raw-key or spending authority is added.

### Durable write ownership

A component-local symbol token replaces the save-only numeric sequence and is shared by save and delete. It is installed synchronously before starting a write, so form submissions before a render or programmatic submissions cannot start another write. A pending unlock blocks write acquisition, and both unlock entry paths refuse while a write token exists.

Cancellation, session changes and idle hooks do not modify this token. A write's callbacks report only for that token while mounted, and its matching `finally` alone releases the token and busy state. The write is therefore not mislabeled as canceled by a verification or unlock cancellation. Settlement still releases the token after unmount without updating unmounted UI. Successful save retains the existing captured-session check and reports `VaultSavedForPreviousKeysError` when appropriate; storage commit and error semantics remain unchanged.

### Preserved lifecycle and scope

The runtime-only commit changes `SellerKeys.tsx` by 57 insertions and 24 deletions. Its idle suspension subscription and visibility, cancellation/session effects, generation guard, `ownCompletion` identity check, verification handling, keystore import handling and UI markup are unchanged. Independent blob checks confirm the original operation controls, completion/recovery/lock tests, session/key-vault helpers, AppShell and Sweep are identical to the base. No dependency, configuration, cryptographic format, storage format, fee, contract or relayer change is present.

## Test evidence examined

Root's existing RED report on `1a69f706223f8bb976ec62f86d317aca8103290b` contains 22 cases: 19 pass, three expected behavioral failures, no skips. The original five operation controls all pass. The failures demonstrate stale export authorization starting encryption, a duplicate save after replacement, and unlock preflight failing to hold vault controls. I inspected this report; I did not execute it.

The additional 17-case ownership file is the exact refreshed donor operation-test blob `05c846289be5827c2e9028c28661b1c2f242c9b0`, retained beside the original five-case test `29fd9ccaf8226c501e7c1d6e075822960507017c`. It checks both successful and rejected stale completions, cross-operation supersession, edited passphrases, controller abortion, session replacement, idle lock, unmount, synchronous duplicate submissions and independent durable-write lifetime. The deferred helper seams deliberately test component ownership rather than cryptography. Existing real-vault/import completion tests remain unchanged and should be included in GREEN qualification.

The two authored browser journeys use native AES-GCM and the production KDF, delaying only native encryption/file-read completion, and retain positive retry/verification and negative download/notice assertions. They make no external network calls. This review does not claim either browser body ran. The known local browser launch restriction remains separate from the source review.

## Static verification and limits

`git diff --check 7417881ac7f243b50f7b5c1682c66a4e3f87c736 fde65b79e1cb97b06f627819f70ca7c88ecafed5` exited 0. The exact runtime parent is the tests-only checkpoint. Both recovered ownership and browser files exactly match the refreshed donor `e6ed3ee64a786c33b1af06b5fc7a51d742eb6544`. Full source/blob provenance and the hashed RED artifact are in the adjacent JSON.

GREEN tests, typecheck, lint, build, hosted checks and browser acceptance must be attached as their own execution evidence for this exact source. No runtime success is inferred from source approval. This review does not claim that cancellation prevents a durable write already in progress from completing, nor that a component-local token provides a global cross-tab lock; the underlying storage compare-and-swap remains responsible for durable record conflicts.
