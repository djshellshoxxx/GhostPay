# Merchant-profile verification clock repair — 2026-11-19

Cycle: `20261119T095600Z`; one ChatGPT operator, sequential development/audit/verification phases, no independent second worker.
Base: main `14ded337a10c140d7a9f9a9238ec038587d925bb`.
Branch: `automation/20261119T095600Z/bug/merchant-profile-clock`.
Finding: `GP-AUD-208-01` (draft audit PR #266). Malformed time values cause `p.exp <= nowSec` to return false and previously allow a valid signed expired profile.
Regression commit: `e374f79b7b6886ca0797d8240c919dbc4e6253f8`.
Implementation commit: `e69e694921cb808f06bb35a9ffd8183bc30d7afd`.
Changes: `packages/invoice-schema/src/merchantProfile.test.ts` adds invalid-clock and valid/expired controls; `merchantProfile.ts` returns `format` for non-finite or negative time input before verifying signed profile. Canonical bytes, signatures, keys, and on-chain behavior are unchanged.

Verification:
- Node.js 22 standalone clock-predicate assertions: seven passed (five invalid cases plus valid/expired boundaries). This is logic reproduction, **not** the repository Vitest suite or execution of the full TypeScript module.
- The regression test was committed first; based on the observed baseline source, NaN and undefined were previously accepted. It was **not** executed against the repository baseline.
- Repository checkout unavailable in execution container because github.com DNS resolution failed. No Vitest, lint, TypeScript, browser or full CI pass is claimed. Hosted exact-head CI and independent verification are required.
- Current PR265 CI and PR261 CI remain queued/pending. PR258 Hosting kit targeted retry attempt 2 completed successfully. No further retry requested.
- Last observed integration metadata ref `3ae60de55add2763aa7d7a44033d11b96df13adb`, released generation 1. No lock acquired or shared integration attempted.

Next: obtain hosted CI; verify test fails against baseline and passes against patch; independently inspect acceptance and CI; recheck fresh main/PR ownership and release workflows before any protected merge. Keep this draft separate from JSON canonicalization PR265 and integration PRs.
