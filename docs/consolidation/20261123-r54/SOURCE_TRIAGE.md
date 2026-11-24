# R54 immutable donor/source triage — 2026-11-23 03:06 UTC

Main `eb59d93cffed7848c4aac37d0e9650b87239c6da`. Full recursive Git trees (GitHub `git/trees/{commit}?recursive=1`) were returned with `truncated=false`; these counts compare **Git blob hashes**, not semantically unique features. Nothing below is deemed integrated or safe to merge solely because a tree differs.

| Donor (pinned commit) | Donor blobs | Equal to main | Donor-only paths | Shared different | Main-only |
| --- | ---: | ---: | ---: | ---: | ---: |
| `chatgpt/btc-spent-qualification-20261119` (`7954f1e5a29988fb9239225d1f829c6c3dc71e08`) | 3,918 | 3,808 | 26 | 84 | 89 |
| `repair/ghostpay-qr-surrogates-20261119` (`ac7b7a11f00896d105fa7a06e44e218046bdc56c`) | 4,675 | 3,528 | 757 | 390 | 63 |
| `evidence/ghostpay-idle-session-r2-20261120` (`ebc3fea4640e2a82585a6cfb73a97fbf0b907949`) | 4,111 | 3,841 | 180 | 90 | 50 |
| `audit/f03-browser-qualification-20261120` (`9a0e268034ee2321c5e333c35a3aa1825b1c8f63`) | 4,016 | 3,889 | 96 | 31 | 61 |

## Most actionable follow-up

The BTC-spent donor contains potential unique test assets `apps/web/src/features/btc/BtcView.spentConsent.test.tsx`, `apps/web/src/features/btc/scan.spends.test.ts`, `apps/web/src/features/btc/BtcView.headerOwnership.test.tsx`, and `apps/web/e2e/btc-spent-consent.spec.ts`. Inspect exact contents, existing owner PRs, current main regressions and overlapping tests before selecting any standalone recovery. These files are **not automatically eligible**; authorization/consent behavior requires browser verification.

The F03 browser qualification tree contains payment-request source and tests (`apps/web/src/components/PaymentRequestDownload.tsx`, `PaymentRequestFileInput.tsx`, `apps/web/src/lib/requestFileInterop.test.ts`) alongside large audit evidence. Before touching, check F03 owners, open PRs and the Pages-only release scope. The idle branch retains `apps/web/e2e/idle-session.spec.ts`, print-target and other distinct source/tests; avoid overwriting current main privacy and lifecycle safeguards. The QR donor is a broad older snapshot with hundreds of differences; **do not cherry-pick wholesale**.

No inference of patch equivalence, implementation correctness or completed beta acceptance follows from file-count comparisons. Preserve all four histories as semantically unresolved. Further work should compare content and tests at exact SHA and either produce narrowly owned regression-qualified PRs or document proven redundancy/supersession.

## Consolidation validator repairs

R53 exact-head CI [45098177216](https://github.com/djshellshoxxx/GhostPay/actions/runs/45098177216) completed **24/24 successful** for SHA `3fa556fceafec31e8e60bce0249ff25912e6bdae`; this does **not** qualify R54 changes.

On existing owned draft PR #471, test-first `a10d3171e1fb2b76148b6729ad2aa3ed1fa9f227`, test-first `c1a08fef7079ec0798f648cceb44343c6c7e7788`, and implementation `10535d69e3badef4789c5902dd659e44f5ba3bdf` prevent a finalized historical donor from silently retaining its classification after its head SHA changes. Exact new-source evidence must pin the old SHA, new SHA, comparison SHA, assessment and source proof. A separate invariant requires the `main` census record to match `provenance.mainSha`, while legitimate main advances remain exempt from donor requalification. These are **tooling**, not payment application, changes. Native Node tests and hosted CI for the fix remain pending until successful exact-head evidence is available.

No protected-main merge, donor application patch, deployment, release, security waiver or real-funds testing occurred in this checkpoint.
