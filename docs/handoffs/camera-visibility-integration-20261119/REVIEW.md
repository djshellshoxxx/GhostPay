# Camera visibility integration — 2026-11-19

## Source and inherited defect

This contribution merges exact PR [#258](https://github.com/djshellshoxxx/GhostPay/pull/258)
`84398a79e18673f3e371a405931bc464e1cca99a` into the consolidated candidate without
rewriting the upstream source. Its sole parent is `ffd982a7aea2856c186b40ef236a39720a1b81f5`.
The candidate base is `74e3111f994481e7c9201ddb0494cf4a8405eadd`; the pre-edit claim is
`52c9d7738949e473cd77b2213a038ba07f41238e`.

The runtime merge is `f0fe867d8bb257ecabb4cf36898962acb72839dc`, with the claim and original
upstream commit as its two parents. The candidate component was byte-identical to the upstream
parent, so this was a missing independent fix. The resulting component and new test are byte-identical
to the reviewed upstream source. The only conflict was the ownership registry: the original 16-line
upstream claim was prepended while preserving every existing candidate byte.

The visibility handler previously stopped camera activity but retained the separate pending image/paste
controller. The visibility helper did not check document visibility, allowing hidden dispatch and late
consumer delivery. The eight additions and three removals revoke pending local work on hiding, check
visibility before dispatch/delivery, and recheck after synchronous preview invalidation. They retain
idle pasted drafts, explicit retry, scope/disclosure cancellation and multipart reset behavior.

This establishes a lifecycle/privacy correction. Consumer callbacks must still check their AbortSignal
after asynchronous work; aborting does not reverse an already-completed consumer action.

## Fresh integration execution

All execution used Node **22.23.4**, Vitest **5.1.0**, the original `apps/web/vite.config.ts`,
512 MiB old-space, 32 MiB semi-space, one worker, and no file parallelism. No source aliases,
configuration changes, coverage exemptions or rule changes were used.

| Phase | Source and actual result |
|---|---|
| Baseline | New upstream test copied into unchanged candidate component at the claim: **9 failed / 9**, exit 1, 2.88 s. Missing aborts and hidden dispatch/delivery were observed. |
| Integrated replay | Exact merge `f0fe867d`: **77 passed**, six files, zero failures/skips, exit 0, 18.04 s. Includes all nine visibility regressions and every existing base, behavior, lifecycle, multipart and localization importer test. |
| Instrumentation startup | An earlier command using `/usr/bin/time` exited 127 because that executable was unavailable, before any test started. Kept separately; it is not behavioral RED evidence. Successful invocation used the shell's `time` keyword. |
| Source and merge checks | Runtime/test hashes match upstream; original runtime matches upstream parent; `git diff --check` passed; only the intended importer pair and additive records differ from the candidate. |

The coordinator's compiled package outputs were copied into this isolated checkout before testing;
565 JavaScript files across the 41 available package output directories matched their source hashes.
Workspace links resolve within this clone. This is reuse and byte verification of coordinator outputs,
not an independent rebuild of all packages. The detailed copy receipt is retained under `evidence/`.

From `apps/web`, the behavioral command prefix was:

```sh
/home/agent/.npm/_npx/361c55be1121897e/node_modules/node/bin/node \
  --max-old-space-size=512 --max-semi-space-size=32 \
  ../../node_modules/vitest/vitest.mjs run
```

The baseline selected `src/components/CameraImporter.visibility.test.tsx` and added
`--maxWorkers=1 --no-file-parallelism`. The green run selected exactly:

```text
src/components/CameraImporter.test.tsx
src/components/CameraImporter.behavior.test.tsx
src/components/CameraImporter.lifecycle.test.tsx
src/components/CameraImporter.multipart.test.tsx
src/components/CameraImporter.i18n.test.tsx
src/components/CameraImporter.visibility.test.tsx
```

It used the same two execution flags. Raw red/green logs, source/configuration hashes, copied compiled
input hashes and explicit result metadata are in `EVIDENCE.json` and `evidence/`.

## Independent review and remaining qualification

The recovery worker independently pinned the review to `f0fe867d8bb257ecabb4cf36898962acb72839dc`
and found no introduced source blocker. They verified both merge parents, original upstream ancestry,
component/test blobs, all 11 source/configuration hashes, all four artifact hashes, and the exact retained
registry bytes. They read the complete fresh red/green logs and reviewed the unchanged lower-level camera
cleanup. This is source/log inspection; the 77-test execution belongs to this integration lane and is not
a separate reviewer runtime replay.

No broad typecheck, typed lint, whole-web coverage or browser test was run by this contribution. Earlier
upstream scoped checks are preserved only as historical evidence in `CAMERA_IMPORT_VISIBILITY_20261119.md`;
their bounded TypeScript program is not equivalent to a full-project lint pass. Coordinator qualification
must run on the final combined source. These jsdom tests do not establish physical-camera, mobile-browser,
Tor, release or main-promotion qualification.
