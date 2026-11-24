# GP-BUG — QR camera attachment failure leaks acquired tracks

Date: 2026-11-23 UTC; repository: `djshellshoxxx/GhostPay`; target: existing static Pages QR camera flow only.
Branch: `automation/20261123-r12/bug/qr-camera-attach-cleanup`. Live main baseline `8ddb344973e80b8e1eda6821e970ee6a2b808b29`.

## Live discovery and ownership

Read `AGENTS.md`, `docs/ai/WORKFLOW.md`, `docs/ai/HANDOFF.md`, `docs/ai/ACTIVE_WORK.md`, live `main`, #390, its reviews and its exact-head Actions, and the independent integration metadata ref. PR #390 head `b655bc273a6704c9c140287b8adcdf4085b91882` has five completed successful workflow groups and Snyk success, no submitted reviews or review threads; its owner branch was not modified. GitHub marks #390 open and non-draft; this is not merge authorization.

All 257 open PR changed-filename inventories in REST list pages 1-3 through #502 were inspected. No other PR modifies `packages/qr-exchange/src/camera.ts` or the new `packages/qr-exchange/src/camera.attach-boundary.test.ts`. Broad #262/#264/#278 did not own camera; #294 changes assembler, not camera. Reinspect before any integration, as ownership is not a permanent lease. Integration lock ref `automation/ghostpay-integration-lock` pointed to `082e754f44944ebb4be283f89176b966bf8f7b4f`: status `released`, generation 12, owner `claude-keen-volta-8ctx9x`. No lock acquisition or protected-branch modification.

## Confirmed failure and root cause

Base source blob `d849dfa89a64837e9ede9eca2c03fa3064cafcf5` in `packages/qr-exchange/src/camera.ts`. Once `getUserMedia()` acquires a stream, `startCamera` assigns `video.srcObject = stream` outside any error-cleanup handler. A video host that throws from its attachment setter causes the native error to escape, leaving the newly acquired tracks live; this violates `startCamera`'s documented stop-on-failure contract. In a Node 22.16.0 source-body-matched V8 reproduction using a setter throwing `Error('attach fail')`, the original function performed zero track stops and never called `play()`.

## Regression-first isolated changes

- Ownership claim commit: `be8e1f6d0ae7688d2ad4bcc9b5560493b538724d`.
- New dedicated failing regression commit, before production edit: `94041effdf99c51f03b8c6d558582918785ad9a7`; tests the throwing setter, previously active stream preservation, acquired-track stop exactly once, typed error, and normal success path.
- Smallest production repair commit: `bdd363ef0fd9c0f23b5d2cde2660215db5edcb33`. Changes only the acquired-stream attachment assignment: catch assignment failure, stop the newly acquired stream, throw existing `QrExchangeError('CAMERA_UNAVAILABLE')`.
- Repaired source blob: `33bf6e0a532745b2daf3f1b9ec3316e182a533f9`.

## Execution evidence (precisely scoped)

Node.js 22.16.0 executed the extracted original and repaired `startCamera` production body after stripping TypeScript-only syntax, with isolated helper stubs, not a repository checkout. Original failure: error `attach fail`, new-track stops 0, previous-track stops 0. Repaired: `CAMERA_UNAVAILABLE`, new-track stops 1, previous-track stops 0, previous stream retained. Neighboring checks preserved successful attachment/playback, play rejection cleanup, pre-abort, and abort after stream acquisition. Five source-body probe categories satisfied their asserted outcomes on the repaired blob.

The newly committed Vitest file has **not been executed locally**. Native GitHub clone failed because `github.com` DNS could not resolve in the local container. Full repository Vitest, typecheck, lint, build and browser tests were not run locally. The actual hosted exact-head CI, applicable browser verification and an actual independent submitted review must all be verified before merge.

## Gates and boundaries

Keep scoped PR **draft** and unmerged while hosted jobs or review gates remain outstanding, regardless of released lock metadata. Do not acquire the integration lease unilaterally. No new features, redesigns, dependencies, contracts, payments, production requests, deployment or release. No other worker branch or owned test was modified. Recheck current `main`, PR heads, ownership and lock before any future integration.
