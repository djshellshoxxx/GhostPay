# Spec 18 interoperability acceptance recovered onto the privacy stack

20 November 2026 (Pacific). Worker: `/root/r2_spec18_recovery`.
Coordinator: `539818ee134f-root`.

**The exact existing PR #346 interoperability test is recovered above the reconciled #355 privacy candidate. All 124 focused cases pass across six complete files; the recovered file's original typed ESLint check also passes. Production source is unchanged.**

## Source and scope

- Parent #355: `0fb2831a1b89430c69896f6db57306cd5518e55f`.
- Donor #346: `37760c3655c48fa190c0f2324072cb506cf1b88d`.
- Claim committed before the test copy: `e55ec7e74fd1598f5c0bfc71f3b9458298c1d50b`.
- Application/test source commit: `81bfa7bddaebdaaf059ad663fead05d59ec82cda`.
- Branch: `integrate/ghostpay-export-recovery-acceptance-20261121-539818`.
- Sole application-tree addition: `apps/web/src/lib/paymentKeyExport.interop.test.ts`.
- Exact donor/test blob: `48322f29d828f3fbdf4645c39a461e4044635a52`.
- Test SHA-256: `580c14f1549d2d35d07682a6e80fd669521008937afd984a20b63d46fcb55806`; 7,476 bytes.

#355 retains canonical #354 runtime/browser corrections and the additional mounted quick-hide tests. This child retains those files exactly. Existing application, codec, decoder, fixture, test, dependency, configuration, KDF, assertion and timeout inputs are unchanged.

The original test and broad Spec 18 owners retain their source branches. This is bounded recovery of existing acceptance work, not a second implementation.

## Why this work belongs on this candidate

Current main `aec179910c39081d820396409ff3139ff2264132` and integration #307 `5a745d4b5fba69b66a9779f88aefc63c253a4f27` lack the Spec 18 export/recovery modules. The newer privacy lineage already contains the #260 backup-byte and unload-custody safeguards, plus later expiry and session protections. Copying old runtime source would lose those subsequent protections.

The distinct #346 test was absent from #354/#355. It connects the actual application's fresh default-cost encrypted export to the unchanged standalone decoder and an independent wallet signature. The portable codec, decoder, reference vector, test utility and export wrapper are exact blobs across donor and target. The application export service differs only in the target's removal of address interpolation from a contract-account error. [SOURCE_COMPATIBILITY.json](SOURCE_COMPATIBILITY.json) records the complete comparison and exact source identities.

## What the recovered test establishes

The real application export service produces a fresh encrypted file using production scrypt parameters. After the seller session is cleared, the exact returned bytes are written to a temporary file. A separate Node process, restricted to a copied decoder and its two noble dependencies, authenticates those bytes. Default output remains redacted; an incorrect chain is refused. Only the deliberately decoded payment key enters the independent wallet API to reproduce the address and sign a public offline challenge.

Existing assertions retain the filesystem denial probe, no application fetch, unchanged session, wrong-message signature refusal and temporary-file cleanup. No transaction or network wallet client is created.

This does not establish browser download handling, future backup retention, external wallet UI import, physical-device behavior or actual spending. The separate Anvil spend test was not run here.

## Fresh environment after the reset

The first local attempt committed only an ownership claim, then failed to create the evidence directory because the workspace had no free bytes. No test was copied or executed before the subsequent workspace reset. [RESET_RECORD.json](RESET_RECORD.json) preserves the observed failure and lost-state boundary. The old installation and compiled-output evidence are not reused.

The coordinator restored the published parent and performed a fresh original `npm ci`: exit 0, 721 packages added. The worker independently checked all 789 installed lock entries against the unchanged lock metadata with zero mismatches. Node is `v24.22.3`, npm `11.19.1`, Vitest `5.1.0`, TypeScript `5.9.3`. The lock SHA-256 is `1b22ab3e9f780d27a01b1beaa8c31b223b3649106e454e78fc50ac8d6900f517`.

npm reported that the keccak and secp256k1 install scripts were not allowlisted by default. No allowlist/configuration change was made, and no execution of those scripts is claimed. [FRESH_INSTALL_METADATA.json](FRESH_INSTALL_METADATA.json) distinguishes coordinator installation evidence from the worker's metadata check.

The coordinator then ran the original `NODE_OPTIONS=--max-old-space-size=768 npm run build:libs`, exit 0, before any worker test. [FRESH_BUILD.json.gz](FRESH_BUILD.json.gz) retains the complete build output, exact input trees and all 2,289 compiled-file hashes across 65 packages. Every compiled file was compared again after qualification and still matched.

## Executed qualification

All tests ran sequentially on the same application/test source. Later execution heads add evidence only; each receipt records the actual head and verifies application/build inputs are unchanged from `81bfa7bd`. Vitest used the original project configuration with one worker and a 256 MiB heap. No coverage option, name filter, timeout or assertion change was supplied.

| Complete test selection | Result | Wrapper time | Receipt |
| --- | --- | ---: | --- |
| Recovered `paymentKeyExport.interop.test.ts` | 1 passed, 0 failed/skipped | 5.774 s | [INTEROP_EXECUTION.json](INTEROP_EXECUTION.json) |
| Existing `paymentKeyExport.test.ts` and `paymentKeyExport.expiry.test.ts` | 36 passed, 0 failed/skipped | 7.731 s | [EXPORT_EXPIRY_EXECUTION.json](EXPORT_EXPIRY_EXECUTION.json) |
| Existing portable export codec/vector and property files | 65 passed, 0 failed/skipped | 16.841 s | [CODEC_EXECUTION.json](CODEC_EXECUTION.json) |
| Existing standalone decoder test file | 22 passed, 0 failed/skipped | 8.304 s | [DECODER_EXECUTION.json](DECODER_EXECUTION.json) |
| **Total across six complete files** | **124 passed, 0 failed/skipped** | | |

The original typed ESLint configuration applied to the sole recovered file passes with no diagnostics, exit 0 in 7.018 seconds, at a 768 MiB heap. [LINT_EXECUTION.json](LINT_EXECUTION.json) retains the exact invocation. This is scoped lint, not a whole-project lint result.

The original repository secret scan and complete parent-to-head whitespace check also pass. [LIGHT_CHECKS.json](LIGHT_CHECKS.json) preserves the commands and full outputs. Every execution receipt stores complete output, byte count and SHA-256; the output hashes and build archive were independently reread by the worker before handoff. Successful execution receipts were committed incrementally before the next test.

No product test failed in the restored environment. The disk-exhaustion failure remains a failed preparation attempt; it is not relabelled as a test pass.

## Remaining qualification and ownership

These focused runs do not replace the original full-web/full-vault coverage gates, whole-web typecheck/lint, production builds, full/lean browser qualification or release checks. Parent #355's hosted CI was incomplete at assignment. Root must inspect fresh checks on the actual published child and any later integration composition.

Fresh independent review and publication remain coordinator-owned. This worker has made no remote write, shared-branch update, lease change, release, deployment or real-funds action. The exclusive local test window is released; no test process remains running.
