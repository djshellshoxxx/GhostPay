# Plan: idea 02 (B7) claim-by-hash, deep scan, inbox filter

Spec: [../../../specs/ideas/02-claim-by-hash-and-spam-filter.md](../../../specs/ideas/02-claim-by-hash-and-spam-filter.md). Branch `claude/remote-extensions-3`, 2026-10-21. Owners are roles: CC = core-crypto, CA = chain-adapters, WEB = apps/web, DOC = docs. Estimates are single-engineer days and unverified guesses. 100% client-side: no task below creates or depends on a server.

## Preconditions
- Spec 01 (manifest read-back) merged or at least the router/announcer addresses come from a read-back manifest in tests; otherwise router-lane `verified` stays disabled behind a flag.
- Agree the A2 worker `start` shape (list of children) before step 3 so the protocol changes once.

## Steps (each is one PR, tests in the same PR)

| # | Task | Files | Owner | Days | Exit check |
|---|---|---|---|---|---|
| 1 | Tag-ignoring options, `matchEphemeral`, `deriveStealthSecretFromEphemeral`; wrong-tag vectors; property + differential tests | `packages/core-crypto/src/stealth.ts`, `index.ts`, `vectors.test.ts`, `properties.test.ts`, `negative.test.ts` | CC | 1.5 | old vectors byte-identical; new vectors pass; 100k-iteration property test green |
| 2 | `claim.ts` (`fetchClaimEvidence`, by-block/by-hash, canonical check, secondary agreement), `verify.ts` (`verifyAmount`, `nativeBalanceDelta`), `validateAnnouncementLog` `allowEmptyMetadata` option | `packages/chain-adapters/src/{claim,verify,logs}.ts`, `index.ts`, tests with `rpc.testutil.ts` | CA | 2 | table tests for every fetch failure in spec s9; C1-C8 verdict table |
| 3 | Worker protocol: `ignoreViewTag`, `claim`, `bench`, `tagMismatch` in `WireMatch` | `apps/web/src/lib/scannerCore.ts`, `scanner.worker.ts`, `scannerCore.test.ts` | WEB | 0.5 | no-network source test still green |
| 4 | `claimCode.ts`, `claim.ts` (`runClaim`), `inboxFilter.ts` + settings sanitize; `TagPayload` optional fields | `apps/web/src/lib/*` | WEB | 1 | parser fuzz 1M, zero non-UserFacing throws; categorize precedence tests |
| 5 | Payer: receipt v2, claim card after inclusion | `apps/web/src/lib/payExec.ts`, `views/Pay.tsx` | WEB | 0.5 | v1 + v2 receipt schema tests; Playwright: no code before inclusion |
| 6 | Seller UI: claim panel, deep-scan toggle with live estimate and caps, filter tabs with hidden count; Settings "Inbox" | `views/Scan.tsx`, `views/Settings.tsx`, `lib/scanClient.ts` | WEB | 1.5 | component tests per result state; no amount rendered unless verified |
| 7 | Sweep: tag-mismatch and C4 derivation paths; unknown-token block + override; dust warning | `lib/sweep.ts`, `views/Sweep.tsx` | WEB | 0.5 | anvil sweep of wrong-tag payment; refusal on address mismatch |
| 8 | anvil e2e for C1-C8; Playwright egress (by-block body audit); copy snapshot | e2e harness, `apps/web/e2e` (UNVERIFIED path) | WEB, CA | 1 | all green in CI |
| 9 | Docs: receive-and-scan, troubleshooting, privacy-limits, THREAT_MODEL D4/S3-02, amend spec 02 rule 2, README index | `docs/user/*`, `docs/threat-model/THREAT_MODEL.md`, `docs/specs/02-*.md` | DOC | 0.5 | spec s11 boxes ticked in PR |

Total about 9 days. Steps 1 and 2 can run in parallel; 3-4 need 1; 5 is independent after 4; 6-7 need 2-4.

## Measurements to record in PRs
- Browser us/op for ECDH+keccak and for the wrong-tag extra on a reference laptop (Chrome, Firefox), to replace the container numbers (2.4 ms and 0.55 ms) in the spec.
- Which public providers support `eth_getBlockReceipts` on each enabled testnet (record name, date, result); until recorded, copy must not claim block mode works everywhere.

## Gate (merge to main)
Spec acceptance list complete; regression suite and bundle scan green; reviewer walks the spec s14 audit checklist and records the result in `docs/reviews/`.

## Risks and fallbacks
- `eth_getBlockReceipts` missing on a provider: by-hash with explicit consent (already in the design).
- Deep scan too slow on low-end devices: keep it opt-in with caps; claim-by-hash covers the D4 case without scanning.
- Router-lane trust blocked by spec 01 delay: ship with router matches requiring a transfer-log check ("Confirm amount") until read-back lands.
