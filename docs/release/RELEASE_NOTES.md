# GhostPay 1.0.0-beta.1 — prepared release notes

**Unpublished draft.** This document does not create a tag, GitHub Release or readiness verdict. Candidate: `73124433c08c8ef6835f11d03709060c6eea7a3f`. Main at preparation: `c977b5d6723f6822c3b5d86cd6b231712c53c395`.

## Intended first milestone

A static, lean EVM demonstration with payment execution disabled. It supports browser-local seller keys, authenticated key exports, encrypted backup, exact-file backup verification, restore, signed invoice creation/viewing and help. No GhostPay-operated backend, account, database or relayer service is required.

A later testnet milestone may activate only the test networks covered by an approved, authenticated deployment manifest and completed acceptance. Pages mainnet functionality remains disabled.

## Changes consolidated

- Retained the current recovery, sleep-aware session, private-checkpoint and authorization work from the qualified source lineage, preserving older branch history.
- Recovered #269's payment-key export flow. A secret export obtains fresh, narrowly scoped network permission after authentication and uses the original verified endpoint; it does not revive an expired scan grant. Public records remain exportable without that network check.
- Integrated #272's explicit balance and quote lifecycle into the newer privacy implementation. Destination, balance, endpoint, network settings and review changes invalidate pending work.
- Added helper checks before key derivation, signatures and handoff so a valid session cannot preserve an obsolete review.
- Required a newly read native balance to equal the balance the user reviewed before a direct sweep can sign. A changed balance requires a fresh explicit review.
- Repaired session expiry at authorization entry and prevented cancelled reviews from publishing stale errors.
- Made network grants fail closed on invalid or decreasing clock samples; retained non-renewal semantics for mere authority checks.
- Incorporated #274's monotonic invoice wait-expiry floor and retained #270's canonical-array/scanner hardening.
- Added reproducible regression evidence and independent agent source checks. Complete release qualification remains separate.

See [BRANCH_CONSOLIDATION.md](BRANCH_CONSOLIDATION.md) for exact provenance and [TEST_RESULTS.md](TEST_RESULTS.md) for executed counts, failures, omissions and source pins.

## User-facing boundaries

A backup download is not evidence of recoverability until its actual bytes have been verified. Keep independent recovery material outside the original browser and follow the [recovery guide](../user/recover-stealth-payment-keys.md). Importing one key format does not implicitly restore unrelated signing identities or every application-history record.

Stealth addresses reduce address reuse; they do not provide complete anonymity. RPC providers observe requests, public chains expose payment relationships and timing, and destination reuse or gas funding can create visible links. Read [privacy limits](../user/privacy-limits.md).

The demonstration cannot move funds. Testnet payments, when separately qualified, use test assets only. Native sweeping is the end-to-end acceptance target; ERC-20 sweeping needs native gas at the one-time address and separate qualification. Optional relayer client code requires a user-selected service; no GhostPay relayer is provided or mandatory. Tor/private-path reachability is not yet qualified.

## Known release blockers

Dedicated-origin hosting and ADR-0029 approval, fresh full-source CI and browser acceptance, native gas/fee preview, exact artifact/reproducibility verification, unresolved security-analysis gates, independent external review and testnet signing/deployment/real-wallet evidence remain open. See [RELEASE_BLOCKERS.md](RELEASE_BLOCKERS.md).

## Release asset record

| Asset/identity | State |
| --- | --- |
| Tag 1.0.0-beta.1 | Not created; check for existing published tag before any creation |
| Source archive / source commit | Candidate above; final approved commit must replace it |
| Pages site archive | Not yet qualified or published |
| SHA256SUMS and exact inventory | To be produced from final artifact, not inferred from source |
| pages-evidence.json / lean module report | Required for final artifact |
| Build provenance / independent reproduction | Required before release |
| Test and security qualification records | These documents plus source-pinned receipts; unresolved gates explicit |

Use the established [Pages build guide](../pages/README.md) and [developer guide](../developer/README.md). Do not distribute this draft as a verified payments-enabled beta.

## Publication provenance

Implementation commit identities above refer to preserved local development history. The GitHub connector preserves each tree and ordered parent history while normalizing commit metadata. `PUBLICATION_MAP.json` maps implementation commits to their published identities. Fresh publication, artifact and hosted-check records will be appended after final qualification.
