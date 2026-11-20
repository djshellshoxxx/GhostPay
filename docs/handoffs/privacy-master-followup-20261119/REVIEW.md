# Privacy follow-up on the existing master consolidation

## Pinned scope

Base: `b529a720cfbfa3c1056cc71085b4f163078e7591`. The existing master already combines the broad #248/#249/#251/#256 work, including Spec 18 export integration. Earlier reconstruction was compared and deliberately not integrated. This follow-up contains three bounded implementation commits:

- `df06544c82afa7357b393025204c30da08ecb800`: shared strict profile parsing and preservation of a profile draft's original storage revision.
- `78b16292449461a3149a4f95c79faf1f156bfc47`: private checkpoint policy recheck plus the final #248 app-lock/performance tail from `18b367457103fb1731a5b4ef5c51faa37a010e47`.
- `1aaa29322933469dc02776a639d58c526077f0e7`: final #249 configured-origin CSP qualification tail from `c17e5c387e3c2b83f48b02ac33a669c44c69ced6`.

The #251 blocked-profile assertions from `5ec15534` were reconciled with the master's strict saved-profile loader and current UI wording. The existing `d37b0ab3` real-UI save/remount test remains; no raw saved-secret fixture or scanner suppression was restored. AST source-sink scanning, `ownOrigin` checks and all-HTML scanning remain intact.

## Reproduced failures and corrections

A present incomplete saved policy was rejected by standalone RPC selection but accepted by production network authorization, which supplied missing fields with weaker defaults. Five incomplete-policy cases fail on the pinned master; the absent/complete-policy control passes. Production authority now calls the shared strict saved-profile reader. Previous grants are revoked when the raw policy changes, and malformed or pending policy cannot create a fresh grant.

A cross-tab storage event erased an unsaved Settings draft and advanced its saved revision. The original component fails the targeted draft-preservation regression. The event now refreshes the displayed saved status while preserving the draft and its original revision. A later save checks that revision, refuses an already-observed conflicting write and refreshes the form. This is an optimistic localStorage revision check, not a transactionally atomic cross-process compare-and-swap.

A profile change before its storage event could commit an already-pending encrypted journal page after the last RPC. The new regression gates the actual encrypted compare-and-swap, changes the profile without dispatching a browser event, and demonstrates the baseline incorrectly replaces the previous tombstone with ciphertext. Including `WEB_NETWORK_SELECTION_KEY` in the synchronous scan snapshot prevents the stale commit. The storage-event invalidation list also includes this key.

Both scan RPC grants remain action `scan`, category `rpc`, bound to the selected chain and endpoint, and linked to the scan abort signal. Setup, manifests, continuation and checkpoint persistence remain guarded. Successful scans retain the scoped RPC client used by explicit payment-key export; this patch does not introduce a conflicting blanket-finally abort.

The upstream app-lock tail synchronously disarms an already-due automatic scan, stops new timers and aborts in-flight private work while preserving a sole seller-key copy. Its performance fixture asserts work/ciphertext bounds and equivalent verified discoveries; elapsed times are observations, not a gate or a browser/network throughput claim.

The CSP tail exempts only validated origin tokens in the actual enforcing `connect-src` attribute. Unrelated directives, attributes, scripts, workers, resources and other HTML documents gain no host exemption. Parser source ranges reject duplicate attributes, entity substitution and ambiguous syntax.

## Executed qualification

| Selection | Result | Runner |
| --- | --- | --- |
| Strict profile regression on master | 5 failed, 1 control passed | Source-focused Vitest |
| Draft preservation on original Settings source | 1 failed, 26 unrelated skipped | Source-focused Vitest, only component replaced by a pinned baseline alias |
| Journal profile change before storage event, baseline | 1 failed, 19 unrelated skipped | Source-focused Vitest |
| Authority and strict profile consistency | 96 passed | Source-focused Vitest |
| Service authorization, saved profiles, network guards and adapters | 37 passed | Source-focused Vitest |
| Settings | 27 passed | Source-focused Vitest |
| Private checkpoint UI, including new profile race and app-lock tail | 20 passed | Source-focused Vitest |
| Private scan performance fixture | 1 passed | Source-focused Vitest nocov pass |
| CSP and configured-origin artifact boundary | 79 passed | Native Node test runner |
| Existing bundle/AST scanner | 63 passed | Unchanged repository Vitest configuration |

The seven green selections total **323 tests**. Node was `24.22.3`, Vitest `5.1.0`; tests ran serially with a 384 MiB old-space bound. Captured output is in `evidence/`; only trailing blank lines are removed. `git diff --check` passed. Source hashes pin all changed runtime and test files.

The runtime/UI selections used an untracked local Vitest config that maps workspace package exports to this checkout's own source, with one worker and coverage disabled for the focused run. The nocov fixture used the same aliases and the repository's nocov include/exclude pattern. No tracked config, coverage threshold, test assertion or gate was relaxed. Temporary baseline source/config files were removed. The full unchanged compiled-package gate remains the coordinator's responsibility.

A separate unchanged-config `buildScripts.test.ts` run passed 20 cases and failed one because this checkout had no compiled `@ghostpay/scan-source` entry. It is recorded as an environment/build prerequisite failure, not a test pass. Earlier dependency installs and the broader library build were killed with exit 137; interrupted or resource-killed attempts are not included as qualification. No complete build, lint, full-web coverage, browser/device, Pages deployment, live Tor or release result is claimed here.

## Commands

From `apps/web`, focused selections used `NODE_OPTIONS=--max-old-space-size=384 ../../node_modules/.bin/vitest run --config vitest.privacy-local.config.ts <files> --coverage.enabled=false`. Files were the authority/profile pair; four defaultServices/network-adapter files; `Settings.test.tsx`; and `Scan.privateCheckpoint.test.tsx`. The temporary nocov config selected only `privateScanPerformance.nocov.test.ts`. The actual scanner used the unchanged config: `vitest run src/scanBundle.test.ts --maxWorkers=1 --coverage.enabled=false`.

From the repository root, native CSP qualification used `node --test scripts/tests/privacy-csp.test.mjs scripts/tests/privacy-csp-bundle.test.mjs`. The authority baseline used the same regression against the pinned master parser; the journal baseline removed only the new snapshot key before applying the fix. The Settings baseline used a temporary alias to the exact `b529a720` component, preserving the current strengthened test.

## Integration remaining

The coordinator must combine these exact commits with its latest main/master, recovery and Bitcoin follow-ups, refresh the source-based egress inventory and run required combined-source CI. This child made no remote push, main merge, deployment or release change. Independent review of this patch is coordinated with the recovery worker.

## Independent reviews

The recovery worker independently reviewed runtime head `1aaa29322933469dc02776a639d58c526077f0e7` and reported no introduced source blocker in the shared strict profile boundary, draft/revision preservation, journal consistency guard, synchronous app-lock timer disarm or exact CSP masking ranges. Its independent Node 22 configured-CSP replay passed 49/49. Source hashes matched before and after the replay and were verified against this head; evidence is retained here. This is scoped independent review, not full web qualification.

This privacy worker separately reviewed recovery implementation `bdf6589f0dd07d9ab1935489c72160e1d99f2c82` and evidence head `16e0a4688e40e281d606ecbcf0c67577ac46120e`, authored by the recovery worker. No blocker was found in the novel recovered-key authority changes. The outer guard preserves the pre-decrypt session revision; both decrypted holders clean up partial allocations; raw-key and install operations synchronously check expiry and revision before releasing authority and dispose on rejection. The fresh empty-session control remains functional. The portable recovery harness selects a supported permission flag and explicitly checks repository-read denial, without an unrestricted fallback.

An independent unchanged-config Node 22 replay of `paymentKeyExport.expiry.test.ts` passed all six cases with `NODE_OPTIONS='--max-old-space-size=384 --max-semi-space-size=8'` and one worker. Reviewed source hashes were checked against the recovery worker's pinned manifest after the run. This review does not replace the full existing Spec 18, package or browser suite.
