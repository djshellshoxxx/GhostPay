# Security review status

## Current bounded review — 20261120T0035Z

### GP-QR-RUNTIME-COERCION

- Source: #285 89942105c48df03b9351f777278b6a992e35a95e,
  apps/web/src/lib/qrKinds.ts lines 180 and 235; same helper at audited #278 d74af79e.
- Severity: low API-boundary correctness; confidence: high. Two separate native reviewers reproduced
  non-string acceptance and hostile/stateful conversion hooks in the exact source.
- Evidence: own-property checks coerce arrays/boxed strings/objects; the subsequent lookup may coerce
  again. Stateful hooks can select a different classification and throwing getters leak an unexpected
  exception. Committed Vitest RED/GREEN and preserved logs establish the behavior.
- Practical impact: helper classification/error inconsistency. Existing production callers use literal
  or typed-literal choices; no reachable payment exploit, fund-loss path or key disclosure was established.
- Mitigation: reject nonprimitive strings before own-key lookup, preserving fixed TypeError messages,
  all declared mappings, and secret/bearer warning precedence.
- Repair ownership/disposition: this cycle's local 2df03bde / published d8857b10 was independently
  reviewed and passed 23/23. Concurrent #290 supplies equivalent guards on the integration lineage;
  our redundant #291 is closed and its branch preserved. No second runtime repair is proposed.
- Required regression/verification: #290 preserves its seventeen-category malformed-input matrix and
  hostile-getter controls. Final #295 adds unverified-hook rejection and exhaustively tests all eight
  flags for every payload mapping. Author and fresh /root/final_independent_review passed 54/54 at
  local 954152e2, tree-identical published source 7309524b. Final head 4493793a has pending hosted CI.

### Other gates

#289's primitive-string guard preserves Base64UrlError and valid textual decoding. Original package
coverage now passes 729/729; its one lint error is already repaired on #278. No protocol change.

Old #278 d74af79e Contract analysis run 44643709093 finished cancelled, not passed; new head
417f7c71 has a fresh pending run. This cycle did not run Mythril or suppress findings, and does not
adopt another owner's finding dispositions as product-wide clearance. Existing strict security,
external review, signing and deployment requirements remain.

This is a bounded native AI-assisted review, not a third-party audit. No unresolved sensitive
vulnerability was published as a public issue. No cryptographic, financial or privacy-policy change.

## Historical security record

Baseline: `e454de6abfefda70d82784fafc1d8949b277c334`. This is a bounded AI-assisted review,
not an independent third-party audit or product-wide security clearance.

Follow [SECURITY.md](../../SECURITY.md). New vulnerability details must use the private reporting
path; do not publish proof-of-concept details, keys or secrets in this shared tracker.
No new confirmed high/critical vulnerability is asserted by this cycle.

| Tracking ID | Source/evidence | Disposition |
|---|---|---|
| EXISTING-MYTHRIL | #255, `ea47fa75eabb0be2045081ffeb120fc2bfae67ab`; run 44476066945 | Existing owner and published work. Source inspection found the production runner still requires successful, complete, zero-issue analyzer output. Fresh analyzer run 44476066945 / job `135396814239` failed: 11 findings remain (8 Low, 3 Medium): SweepRelayer 1 SWC-116; PolicyAccount 2 SWC-116; Factory 8 (SWC-110 ×1, SWC-107 ×4, SWC-113 ×2, SWC-104 ×1). All five targets reported success with complete, exception-free/timeout-free telemetry. The strict runner correctly failed because findings remain. No gate waiver or independently executed analyzer run is claimed. |
| UI-IMPORT-001 | Generic CameraImporter lifecycle on baseline main | Reliability/privacy-consistency bug: pending pasted/image import can survive hidden-tab transition. No direct signing, broadcast or key decryption is initiated by this component. Track repair and independent verification in BUG_BACKLOG.md. |
| AUTO-001 | New cooperative integration lock | Requires independent source and real-Git verification; does not enforce policy against arbitrary maintainers or replace PR/security gates. |

The independent reviewer executed the unchanged QR decoding/camera suites on baseline main: 37/37
passed across two files, supporting the existing lower-level AbortSignal cancellation contract. This does
not establish the UI cancellation fix or overall application qualification.

## Final gate refresh

Independent reviewer confirmed #255 remains at `ea47fa75eabb0be2045081ffeb120fc2bfae67ab`.
The downloaded report artifact `14509646188` matches the upload digest
`f26634aa26eb718a808bb0cb755d30a29eaf3a2eb9eafa735de33f5b1c78e9e7`.
The full report is 283,170 bytes, untruncated, and records unchanged source. These are analyzer findings,
not a claim that 11 independently exploitable vulnerabilities were established. Existing #255 ownership
retains remediation/disposition work. Do not suppress findings or count passing Echidna as Mythril clearance.
[Exact failed job](https://github.com/djshellshoxxx/GhostPay/actions/runs/44476066945/job/135396814239).
