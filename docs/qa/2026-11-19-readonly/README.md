# GhostPay read-only QA, QC and bounded stress review

Review date: **2026-11-19 Pacific**. Tests ran against main source
`c977b5d6723f6822c3b5d86cd6b231712c53c395` with its committed dependencies.
This change contains **notes and evidence only**. No application, test,
dependency, configuration, workflow or contract code was changed.

## Findings requiring a repair worker

Three distinct functional/API defects and one test-synchronization defect were
confirmed. All remain unfixed by this review.

| ID | Priority | Finding | Evidence and scope |
| --- | --- | --- | --- |
| QA-01 | P2 | Starting backup export and verification in succession can strand the previous form's busy state. | Two controlled component failures plus two passing controls. Actual SellerKeys handlers and rendering; synthetic keystore operations. See [browser findings](BROWSER_QA.md), BROWSER-QA-01. |
| QA-02 | P2 | Bitcoin, Solana and TRON URI builders can emit links their own parsers reject. | Separately valid Unicode fields produced 2,124-, 2,770- and 2,071-character outputs; parser cap is 2,048. One aggregate-length defect across three builders. Library/API scope, not a demonstrated active EVM checkout failure. See [core findings](CORE_QA.md), CORE-QA-01. |
| QA-03 | P3 | Public `payment-uri.parseDecimal` throws an untyped `RangeError` for fractional/nonfinite precision. | Three tiny invalid-option cases and three controls. Current payment-URI callers use fixed valid precision; exported API robustness issue. See CORE-QA-02. |
| QC-01 | P3 | A reconciliation UI test clicks its activation button before the button is enabled. | Broad-run failure, 17/17 original cases passing in isolation, and a deterministic delayed-readback diagnostic. Test reliability issue; import succeeds after an enabled click. See BROWSER-QC-02 in the browser report. |

### Existing branch and quality issues retained separately

- **PR #300 wallet-attempt wiring:** an existing privacy dependency requires a
  matching wallet prop but four production call sites omit it. Its exact feature
  tree has failing hosted Beta/Pages journeys. This is existing unfinished
  integration work, not a new regression attributed to the quick-hide shortcut.
- **Unresolved qualification:** initial main's Nightly Mythril runner failed.
  This review records the gate and public job evidence without asserting a new
  vulnerability or reproducing an exploit. Queued candidate jobs are not passes.
- **Coverage limits:** all configured browser projects use Chromium, including
  iPhone/iPad emulation. Firefox/WebKit, physical devices and manual accessibility
  follow-up remain unqualified. Local browsers could not execute here.
- **QC follow-ups:** stale nocov inventory prose, dependency-trigger scope in the
  integration workflow, misleading JSON success fields after killed test workers,
  and the lean build's existing large-chunk/ineffective-dynamic-import warnings.

See [QC review and hosted provenance](QC_REVIEW.md) and
[complete execution record](TEST_RESULTS.md). Distinguish observed defects from
known work, test/environment failures and coverage gaps.

## What was actually exercised

| Check | Result |
| --- | --- |
| Core-crypto full original suite and coverage | **75/75 passed**; original coverage gate passed. |
| Payment-URI full original suite and coverage | **199/199 passed**; original coverage gate passed. The supplemental boundaries exposed gaps despite this pass. |
| UX-vault full original suite and coverage | **284/284 passed** on the bounded-memory rerun; original coverage gate passed. Initial worker-kill evidence retained. |
| Focused original QR / invoice / transaction-review cases | **47 + 27 + 11 passed**. Focused selections are not full package gates. |
| Broad ordinary web workflow selection | **880 passed, 1 failed, 11 unfinished of 892 collected**; exit 1. It remains non-green. |
| Supplemental seeded core properties | **10,229 cases**: 10,223 passed; six boundary failures belong to QA-02 and QA-03. |
| Multipart QR workload | **600 transfers**, 10,146,005 payload bytes, 27,949 unique frames plus 27,949 duplicate additions; passed. Included in the preceding seeded count. |
| Vault consistency workload | **5,000 contacts**, 3,000 operations, 600-record merge, 256 mutation requests in batches of 16, default-KDF backup/restore; passed. |
| Scanner native diagnostic | **1,000,000 generated wire entries**, 200 batches of 5,000; passed in **114.980 s** under a 384 MiB V8 heap cap and 180 s outer deadline. |
| Original scanner/tag Vitest selection | **31 ordinary cases passed; million-wire worker killed**. The native diagnostic does not turn this original gate green. |
| Lean web build | TypeScript, Vite and the **17-file** postbuild scan passed. |

Counts from overlapping runs are deliberately not added into a single headline
test total. A million generated entries are a workload, not a million independent
tests. Timing/memory observations describe this container and corpus, not device
capacity or live-network throughput.

## Source freshness and integrity

Main advanced during the review. The final source comparison inspected main
`773a94be1c8328d6fa1720ae48f1b6a2d903f0c5` and PR #306 head
`885b9569e6fc99e43bf01d23305494275e10120e`. The affected implementations for
QA-01/02/03 are unchanged. A complete tree comparison found no changed, added or
removed files within the 347-file selected finding/dependency/configuration scope.
Earlier comparisons also covered PR #278/#300/#302/#303 and the relevant #305 file.

This establishes source applicability. It does **not** reassign the executed
`c977b5d` test/build results to a newer whole tree. New main's hosting changes and
PR #306's other fixes require their own qualification.

The documentation branch is based on the tested source. Its only intended diff
is this directory and an additive claim in `docs/ai/ACTIVE_WORK.md`. Existing
development branches, main, deployment and release settings were not updated by
this review. Supplemental harnesses stayed outside the repository; only notes,
result data and sanitized text evidence are included.

## Navigation

- [Repair handoff and acceptance criteria](HANDOFF.md)
- [Browser/UI findings and execution detail](BROWSER_QA.md)
- [Core URI, decimal, invoice and QR findings](CORE_QA.md)
- [Independent source/CI quality review](QC_REVIEW.md)
- [Execution results and limitations](TEST_RESULTS.md)
- [Independent vault-workload interpretation](VAULT_STRESS_REVIEW.md)
- [Evidence checksums](evidence/manifest.json)

This review supplies actionable defects and bounded QA evidence. It does not
claim every repository feature was exhaustively tested or qualify a release.
