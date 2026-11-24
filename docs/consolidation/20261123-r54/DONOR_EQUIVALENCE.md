# R54 complete donor equivalence and unique-code preservation

## btc-spent-pr244

Historical source ref `chatgpt/btc-spent-qualification-20261119`, SHA `7954f1e5a29988fb9239225d1f829c6c3dc71e08`, compared directly to still-open *draft* [PR #244](https://github.com/djshellshoxxx/GhostPay/pull/244), HEAD `981cc2f4395d2d76c499a5cd46387daaaa3a6b1f`. GitHub recursive Git-tree API returned **truncated=false** for both snapshots.

| Measure | Exact result |
| --- | ---: |
| Historical donor blob paths | 3,918 |
| PR #244 blob paths | 3,917 |
| Historical donor-only paths | 1 |
| Same-path blob SHA differences | 14 |
| PR-only paths | 0 |
| Donor-only source/test paths | **0** |
| Differing shared source/test blobs | **0** |

The single donor-only path is `docs/handoffs/btc-spent-20261118/evidence/worker-consent-label-fix.json`. Fourteen shared-path blob differences are entirely under `docs/handoffs/btc-spent-20261118/` (acceptance/file-map/review/readme/validation and evidence), not production source or executable tests.

Spot-check *exact* application/e2e blob hashes, all identical in donor and PR #244:
- `apps/web/src/features/btc/BtcView.spentConsent.test.tsx` — `4349c08277c4878619f37abedcef670b613d0793`
- `apps/web/src/features/btc/scan.spends.test.ts` — `79f0e788e102fd63cc64c2ea6fc3a9d5066c2b2d`
- `apps/web/src/features/btc/BtcView.headerOwnership.test.tsx` — `b834219ff7cf5cb3ecdeb30edfd2ac39201f4bd4`
- `apps/web/e2e/btc-spent-consent.spec.ts` — `17ef11133ab429b632ffc03ba3088db74f5f501b`

Therefore, **the historical donor has no distinct source/test blob not already in the exact-head PR #244**. The donor-only and differing review/evidence documents remain accessible on the original donor ref; no assertion is made that they were imported. The R54 ledger records the source/test donor's final structural disposition as `retained-in-unmerged-recovery-PR244-pending-gates`, with mandatory SHA-pinned parent evidence and explicit `mainIntegrated=false`, `behavioralEquivalenceNotClaimed=true`. This is **not** a claim that PR #244 is merged, independently approved, release-qualified or functionally equivalent to main. If #244 moves, the validator must reject stale parent evidence and the donor needs requalification.

## F03 comparison kept unresolved

Donor `audit/f03-browser-qualification-20261120` at `9a0e268034ee2321c5e333c35a3aa1825b1c8f63` compared with still-open draft [PR #310](https://github.com/djshellshoxxx/GhostPay/pull/310) at `dad6bc746be13f8a70fcbb4d612a6fe1c01c86ec`; both recursive trees complete/untruncated. Donor **4,016** blobs, PR **4,041**; **22 donor-only paths** are docs/evidence, **16 shared-path blobs differ**, **13 of them source or tests** (build-profile, merchant identity, QR kinds/multipart, scan spam, and payment URI). PR-only paths 47. Four payment-request implementation/test file blobs checked earlier are byte-identical across both.

The presence of 13 differing shared source/test blobs means **structural equivalence is not established**; do not finalize, label redundant, import or overwrite either owned F03 implementation without full semantic diff, ancestry, and browser/security qualification.

No real-funds operation, deployment, main merge, release or security waiver occurred as part of these comparisons.
