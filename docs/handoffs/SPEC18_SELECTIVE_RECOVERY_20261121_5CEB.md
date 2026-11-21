# Selective Spec 18 recovery integration

## Ownership and scope

- Worker: `/root/recovery_integration`; coordinator: `5ceb6203640a-root`.
- Branch: `integrate/ghostpay-spec18-recovery-20261121-5ceb`.
- Exact base: PR #367 `50ccf5c8b396247b524e5115ebe51575ca79d318`.
- Exact donor: PR #361 `4ccb3db334de7d7cada305a11243c9e3efddc4f6`, preserving the #239/#355 Spec 18 implementation and #346 interoperability regression.
- Owned recovery paths: the existing donor `StealthExport*` components and tests; `paymentKeyExport*`, `paymentExportRpc*`, `stealthExport.ts`, export credential and session atomicity tests; additive export authorization in `keyVault.ts`, `session.ts`, `networkAuthorization.ts`; bounded export controls in `Scan.tsx` and `SellerKeys.tsx`; corresponding locale/security keys; the portable stealth-export codec and exact tests/exports/errors under `packages/ux-vault`; standalone recovery decoder/vector fixtures; recovery browser acceptance and source-pinned documentation. Preserve all other workers' claims.

## Acceptance criteria

Recover existing portable payment-key export and saved-file verification without recreating the implementation. Preserve the current sleep-aware guards, backup operation ownership, durable writes, F03 support, source dependencies, RPC consent and newer base fixes. Retain real cryptographic verification, production-cost application-to-independent-decoder interoperability, failed-replacement preservation, expiry/cancellation and standalone recovery tests. Source-pin every copied file and document every adapted integration hunk. Run applicable focused tests, typecheck/lint/build and seek independent review before publication.

## Integration choice

A whole-tree merge of #361 onto #367 would import 547 application/package differences, including unrelated private-scan, privacy and dependency changes, and generate 17 conflicted files. This branch selectively recovers the accepted recovery feature instead. Original donor branches remain unchanged. The larger privacy lineage still requires its own coordinated integration.

## Status

Claim recorded before source edits. No test or source-completion result is asserted yet. No remote mutation, release, deployment, live RPC or real-funds operation is authorized for this worker.

## Scope correction before source changes

The selective plan is superseded: the #361 export wrapper depends on its network-authorization service and consent-scoped RPC client API, absent from #367. Recovering only the wrapper would drop accepted endpoint grant protections. This worker instead prepares a source-preserving full composition of the two existing accepted privacy/recovery stacks in `integrate/ghostpay-recovery-privacy-20261121-5ceb`. The authoritative additive ownership entry records the 17 conflict paths and requires independent review and whole-candidate qualification. No selective product transplant was made.
