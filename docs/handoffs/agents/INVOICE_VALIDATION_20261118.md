# Shared invoice signer-policy extraction — 2026-11-18

## Outcome and source pins

This main-based branch restores the additive `ParseOptions.requirePinnedSigner` API from PR #218.
It does not change browser trust policy. Main Pay already blocks invalid signatures and distinguishes
valid unpinned signatures from trusted seller keys; this work is not evidence of a missing browser
invalid-signature check.

- Branch: `chatgpt/ghostpay-invoice-validation-20261118`.
- Worktree: `/workspace/scratch/fb6d03ffb806/invoice-validation`.
- Base / inspected `origin/main`: `dfc75ef2087fa6463ae59e0818abec01796c578d`.
- Source PR #218: `b1327d4d0e263fdfc7d4fb0b5546b18de2d7434e`.
- Compatibility comparisons: #209 `b5e2ea3e5030b56c79063eb1f91c8a634ee5d740` and
  #211 `a92658b1ef6b95ff0145b2e1933d0047d51289d5`.
- Failing regressions: `e3a34d4081aa63d05f36c2e82961299fadaf3f76`.
- Guard, errors and package documentation: `964b60d68fca81dc3cb4fb8fcb9e982b0e110e00`.
- Final product/test source: `079222115f494d966f1f25be31ffca4d66346461`. Its only delta from
  `964b60d6` is the coordinator-requested catalog wording correction distinguishing an unknown seller
  identity from the payment destination already present in the invoice. Subsequent handoff/claim changes
  do not change product code, tests or dependencies.

## Behavior restored

`parseFragment` and `openFragment` share the guard after the invoice is decoded, decrypted where necessary,
and its signature verified. When requested, an invalid signature throws `InvalidSignatureError`
(`INVALID_SIGNATURE`) before pin membership is considered. A valid signature from an unpinned key throws
`UntrustedSignerError` (`UNTRUSTED_SIGNER`). Every returned invoice therefore has `trust: 'trusted-seller'`.

An absent or explicit `false` option preserves default review results. Other values from untyped callers
enforce the policy. Empty or missing pins trust nobody; keys compare case-insensitively without stripping
a `0x` prefix. The new errors have fixed messages without invoice data and distinct static `ux-core`
guidance. Format/schema/decryption/passphrase errors retain their earlier types. `openFragment` may return
`needsPassphrase` before authentication; that header is not a trusted invoice. A caller must retain its
chosen policy when supplying the passphrase and still perform expiry and payment-policy checks.

New regressions use real signatures and ciphertext: a different self-signed payee, edited public payees
in plaintext/A256GCM links, a substituted signer field, and a validly authenticated passphrase envelope
containing a changed signed invoice. They check error precedence, accepted pins, default compatibility,
malformed option values, passphrase prompts and earlier error classes. The catalog regression checks
that invalid and valid-but-unpinned signatures remain distinct recognized failures.

## Consumer and overlap review

`Pay.tsx` passes only `pinnedSigners` at its QR-preview, fragment and passphrase `openFragment` call sites.
Neither main nor #218 opts in. `lib/pay.ts` retains the invalid-signature blocker and valid-unpinned review
warning. `ReceiptPanel.tsx` uses default parsing; `lib/receipts.ts` additionally re-verifies signatures,
requires the loaded seller signing key and meta-address, and checks canonical payment facts/recipient.
Those stronger receipt requirements, stale-result guards, lean-chain filtering and expiry/chain/token/
manifest blockers are unchanged.

The four consumer files have identical blobs in main, #218, #209 and #211:

| Path | Blob |
| --- | --- |
| `apps/web/src/views/Pay.tsx` | `579cbe531c39c83745e9a188b176b5a479a32a6b` |
| `apps/web/src/lib/pay.ts` | `479341df5a6a5a5f90038520d3934fe2d4fcdea8` |
| `apps/web/src/components/ReceiptPanel.tsx` | `b81b4868434aae0891c5cd4a664ac48aecf3f947` |
| `apps/web/src/lib/receipts.ts` | `cf880e0b9ee40a1d30c76a15e08e1c06674d71c1` |

#209 and #211 have no invoice-schema source delta from main. No CLI, relayer, backend, experimental,
contract, dependency or lockfile changes from #218 are imported. Signing bytes, invoice/envelope formats,
encryption, passphrase derivation and all browser sources remain unchanged. The shared API is available
to lean and full consumers but does not activate a new network or change their imports.

The browser's localized `INVOICE_TEXT` mapping does not explicitly name these two optional-policy errors.
If surfaced there, they safely use the existing generic invoice-rejection message. The static `ux-core`
catalog distinguishes them. A future browser opt-in and distinct translated messages need their own
policy/UI review; this branch makes neither claim.

## Executed verification

Tests use Node 24.22.1 and Vitest 5.0.5 from the existing root install; dependency manifests are unchanged.
`node_modules` was reused with relative workspace symlinks resolving into this worktree. Compiled package
outputs were copied with `shutil.copytree`, not hardlinked. Both affected packages were then rebuilt here;
the changed outputs have different inodes and link count 1 from root outputs. Package tests import source;
web tests resolve this worktree's rebuilt `invoice-schema` and `ux-core` distributions.

Commands below are run from the worktree root unless the directory column says otherwise.

| Source / directory | Command | Actual result |
| --- | --- | --- |
| RED `e3a34d40`, `packages/invoice-schema` | `../../node_modules/.bin/vitest run src/pinnedSigner.test.ts --coverage.enabled=false --maxWorkers=1` | Exit 1: 10 failed, 3 passed; requested policy silently returned invoices. |
| RED `e3a34d40`, `packages/ux-core` | `../../node_modules/.bin/vitest run src/errors.test.ts --coverage.enabled=false --maxWorkers=1` | Exit 1: 1 failed, 14 passed; new codes mapped to `UNKNOWN`. |
| Guard source `964b60d6`, `packages/invoice-schema` | Same focused signer command | Exit 0: 13/13. |
| Guard source `964b60d6` | `npm run test -w @ghostpay/invoice-schema -- --maxWorkers=1` | Exit 0: 728/728 across 13 files, 184.45 s. |
| Final source `07922211` | `npm run test -w @ghostpay/ux-core -- --maxWorkers=1` | Exit 0: 119/119 across 5 files, 3.08 s. |
| Invoice source unchanged since `964b60d6` | `npm run typecheck -w @ghostpay/invoice-schema`; `npm run lint -w @ghostpay/invoice-schema`; `npm run build -w @ghostpay/invoice-schema` | All exit 0. |
| Final source `07922211` | `npm run typecheck -w @ghostpay/ux-core`; `npm run lint -w @ghostpay/ux-core`; `npm run build -w @ghostpay/ux-core` | All exit 0 after the wording correction. |
| `964b60d6`, `apps/web` | `../../node_modules/.bin/vitest run src/lib/pay.test.ts src/views/Pay.test.tsx src/components/ReceiptPanel.test.tsx src/components/ReceiptPanel.invoice.test.tsx src/lib/receipts.test.ts --coverage.enabled=false --maxWorkers=1` | Exit 0: 153/153 across 5 files, 27.58 s, using rebuilt local packages. |
| Built exports | Node ESM import of both new errors and `ux-core.recover('UNTRUSTED_SIGNER', ...)` | Returned `INVALID_SIGNATURE`, `UNTRUSTED_SIGNER`, `UNTRUSTED_SIGNER`. |
| Source hygiene | `git diff --check` | Exit 0. |

Original coverage thresholds were retained. Invoice-schema: statements 98.09%, branches 97.73%, functions
100%, lines 99.26%. Final ux-core: statements/functions/lines 100%, branches 97.94%. The full invoice suite
includes its existing separate bigint ECDSA verifier and Node/OpenSSL AES-GCM/scrypt checks; these are local
automated compatibility tests, not an external audit or browser/wallet acceptance. The 153 consumer tests
are DOM/unit tests at `964b60d6`; the final catalog wording change has its own full package rerun. No new
Pages build, full-web typecheck or actual browser suite was run for this extraction.

## Independent review and integration

Coordinator source review at `964b60d6` found no blocking behavior issue and requested the identity wording
correction included in `07922211`. Privacy reviewer independently confirmed the unchanged Pay and stricter
receipt consumer behavior. Both reviewers then cleared exact product/test source
`079222115f494d966f1f25be31ffca4d66346461` with no blocking finding.

At that exact source, the privacy reviewer independently ran the focused signer command above (13/13,
exit 0) and the focused `ux-core` catalog command (15/15, exit 0). The coordinator independently reran
the same signer command (13/13, exit 0). These reruns overlap author coverage; they are independent
execution of the same regressions, not additional unique cases, external audit or browser qualification.
Logs are `/workspace/scratch/fb6d03ffb806/invoice-signer-independent.log`,
`/workspace/scratch/fb6d03ffb806/invoice-errors-independent.log`, and
`/workspace/scratch/fb6d03ffb806/invoice-guard-independent.log`.

Integrate this small main-based series, including both new error definitions and the mirrored catalog;
do not cherry-pick the larger #218 branch for this task. Recheck current main, PR heads and ownership,
resolve any overlapping future parser work, rebuild the two packages before consumer tests, and require
fresh exact-head hosted CI. Existing #209/#211 privacy/session work remains separate. Main browser pinning
policy requires a separate decision if stricter authentication is desired. No remote branch/PR mutation,
merge, deployment, release or transaction was performed by this worker.
