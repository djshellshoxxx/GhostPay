# All-branch comparison and focused remaining repairs

Worker: `chatgpt-f80482f352bc` (`/root`), with independent source reviewers.
Branch: `integration/all-branch-review-20261124`.
Base main: `706188000c38b3dde5a3a362370a530870aa7587`.
Date: 2026-11-24.

Compare every live branch (683 at the initial fetch) with current main, preserve
donor histories, identify existing successors, and qualify useful remaining work.
The first isolated implementation batch carries original PRs #289, #505, #507,
#509, #511, #516, #529, #536, #538, #557 and #593. None is an ancestor of current
C1 #504. All selected source paths except #289 have no changed-path overlap in
the 345-open-PR census. The identical #289 guard is already copied into later
recovery/privacy stacks; integrate it once without replacing their broader work.

## Owned paths

- `packages/invoice-schema/src/base64url{,.test}.ts`
- `packages/metadata-hardening/src/web{,.anchor-attributes.test}.ts`
- `packages/payment-uri/src/solana.ts`, `solana.reference-snapshot.test.ts`,
  `tron.ts`, `tron.input-snapshot.test.ts`
- `packages/ux-presets/src/seal{,.cryptokey-boundary.test}.ts`
- `packages/ux-fiat/src/view{,.quote-accessor.test}.ts`
- `packages/ux-notify/src/reminder-bridge{,.accessor.test}.ts`
- `apps/web/src/lib/sanitize{,.marker-script.test}.ts`
- `packages/ux-intake/src/text{,.japanese-script.test}.ts`
- `packages/ux-vault/src/confusables{,.group-kind.test}.ts`
- `packages/merchant-billing/src/money{,.uint256-roundtrip.test}.ts`
- Additive `docs/ai/ACTIVE_WORK.md` claim and this evidence directory.

## Acceptance

Preserve valid payment URI serialization, invoice encoding, native WebCrypto
keys, ordinary fiat/reminder behavior, text warnings and bounded billing amounts.
Retain each donor's regression coverage. Run affected package test/coverage,
typecheck, lint and build gates and the web checks applicable to the combined
tree. Correct demonstrated integration or test defects. Record exact heads,
paths, reviews, commands and outcomes. Refresh main, original heads and ownership
before promotion, satisfy required hosted CI, and follow the repository
integration-lock protocol.

Existing active continuations (#504/#525/#531, #568/#574, #601/#604, privacy,
recovery, QR/mobile, seller reconciliation and wallet-journal stacks) remain
under their owners. This batch does not change their branches. Historical
hosted/native/CLI/contract and future privacy work remains preserved for scope
and qualification review. Deployment and release are outside this task.
