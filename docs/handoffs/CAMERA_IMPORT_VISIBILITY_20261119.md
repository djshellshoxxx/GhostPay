# QR import visibility cancellation — 2026-11-19

## Source and scope

- Base: `e454de6abfefda70d82784fafc1d8949b277c334`.
- Ownership claim: `0807cb20` on `automation/20261119T073600Z/bug/camera-visibility`.
- Runtime and regression source: `d6e9dd38c8713e2fdb2449297529001cf84d0ec2`.
- Changed runtime: `apps/web/src/components/CameraImporter.tsx`.
- New regressions: `apps/web/src/components/CameraImporter.visibility.test.tsx`.

The current open-PR changed-path inventory contained no claim on either runtime or test path.
The task preserves all separately owned recovery, session, scanner, transport and integration work.

## Confirmed gap

The importer promises a shared lifetime for camera, pasted text and image imports. Its visibility
handler only stopped operations when a camera was active; pending paste/image operations used a
different controller and remained authorized when the document became hidden. Its visibility helper
also ignored document visibility. A delayed image result could call the consumer while hidden or after
the page returned, and a cooperative pending consumer never received the abort it needed.

Preview invalidation invokes a caller callback synchronously. That callback can close or hide the
owning UI, so camera/image dispatch and consumer delivery must recheck authorization after it returns.

This is a confirmed lifecycle/privacy defect. It does not establish remote code execution, network
exfiltration or a payment authorization bypass. An abort cannot undo a consumer action that has already
completed, and consumers must still honor the documented signal after their own asynchronous work.

## Change

- Reject new dispatch and delayed delivery while the document is hidden.
- Revoke pending paste/image work on `visibilitychange`, just as camera work is revoked.
- Require a new explicit action after visibility returns; discard the old result even if decoding
  ignores cancellation.
- Recheck authorization before calling the consumer and after synchronous preview invalidation.
- Retain unsubmitted draft text and the existing multipart/camera handling and localization keys.
  Clear a cancelled local operation's stale reading/status message without claiming a camera ran.

## Verification

Runtime: Node `24.22.3`, Vitest `5.0.5`. Tests use the repository's unchanged
`apps/web/vite.config.ts`; no coverage threshold or workflow is changed.

| Check | Actual result |
| --- | --- |
| New visibility regressions on unchanged base runtime | **9 failed / 9**, before the runtime repair; missing aborts and unauthorized dispatch/delivery were observed |
| Same nine tests after the repair | **9 passed / 9**, exit 0 |
| Existing `CameraImporter.behavior.test.tsx` | **12 passed / 12**, exit 0, with a 512 MiB Node heap |
| Existing base, lifecycle, multipart and localization importer tests | **56 passed / 56** across four files, exit 0, serialized with a 512 MiB Node heap |
| Changed component/test TypeScript import closure | **0 diagnostics**, applying the existing web compiler options to the two changed files and `vite-env.d.ts` |
| Changed component/test typed ESLint with that bounded program | **0 errors / 0 warnings**, unchanged repository rules, exit 0 |
| Independent source review and new visibility regression rerun | **No source blocker; 9 passed / 9**, exit 0 in 17.79 seconds on `d6e9dd38`, separate security reviewer |
| Independent lower-level camera/decoder tests | **37 passed / 37** on unchanged main library source; separate library evidence, not added to the 77 component-test count |
| `git diff --check` | Passed |
| Normal chain-adapters build, including core-crypto/invoice-schema | Passed; needed to resolve the normal Vite configuration |
| Normal qr-exchange build | Passed; needed for typed imports |
| Whole-project typed ESLint invocation on the two changed files | Exited 137 without diagnostics under local resource pressure; not a pass |
| Initial combined six-file importer run | Interrupted after startup without a test result (exit 130) to relieve resource pressure; not a pass |

Focused commands run from `apps/web`:

```sh
../../node_modules/.bin/vitest run src/components/CameraImporter.visibility.test.tsx --maxWorkers=1
NODE_OPTIONS=--max-old-space-size=512 ../../node_modules/.bin/vitest run src/components/CameraImporter.behavior.test.tsx --maxWorkers=1
NODE_OPTIONS=--max-old-space-size=512 ../../node_modules/.bin/vitest run src/components/CameraImporter.test.tsx src/components/CameraImporter.lifecycle.test.tsx src/components/CameraImporter.multipart.test.tsx src/components/CameraImporter.i18n.test.tsx --maxWorkers=1 --no-file-parallelism
```

The normal config's first startup attempt failed before any tests because unbuilt
`@ghostpay/chain-adapters` exports could not resolve. That setup failure is not RED behavioral evidence.
After the normal library build, the new tests produced the genuine nine-failure result above.

The passing runs above contain **77 distinct tests across six files**, with no failures or skips.
The scoped static check created a TypeScript program from the existing web compiler options and
the component, new regression and `vite-env.d.ts` roots, following their imports. ESLint used that
program instead of loading the entire web project; all repository rules remained enabled. Its
temporary helper is `/workspace/scratch/d1e766b82a50/camera-scoped-check.mjs`.

Temporary execution logs are `/workspace/scratch/d1e766b82a50/camera-visibility-red.log`,
`/workspace/scratch/d1e766b82a50/camera-visibility-green.log`,
`/workspace/scratch/d1e766b82a50/camera-existing-regressions.log` and
`/workspace/scratch/d1e766b82a50/camera-regressions.log`.
This source-pinned record preserves their outcome without relying on those transient paths surviving.

## Remaining gates

Independent review is complete for the scoped repair. Reconcile any newer main or owner changes and
require applicable combined-head hosted checks before any eligible merge. Whole application/coverage/browser/release
qualification is not claimed. Physical camera, real mobile/browser and Tor acceptance were not run.
No deployment, release, contract, cryptographic or dependency change is included.

## Source fingerprints

| File | SHA-256 |
| --- | --- |
| `apps/web/src/components/CameraImporter.tsx` | `f5725a3c854b60414ce10330922941110bb5bd20058048d46bc89256e9f1fb13` |
| `apps/web/src/components/CameraImporter.visibility.test.tsx` | `27d24dd0ff8be898f514fe56e19e92f7bc6159c8706fe807f538e67bd7e954d5` |
| Temporary genuine RED execution log | `90c2b96470a385955b849d130e805a64b838758551c28baec5c83147b3b521eb` |
| Temporary GREEN execution log | `7c2051b54ba6ea8f8aaa1bbd8b3e7813d5d7f8b73f8af095640e964bcd285504` |
| Temporary remaining-existing-tests log | `16bc3667d6d54314cbadb734ecf2c43ced84b91faf4d74332cda5b546dc7f0b8` |
| Temporary scoped static-check helper | `4db42958fc409f3345482bc795780316f1fefd3f163fe8bf9d9fe4d5af683eeb` |
