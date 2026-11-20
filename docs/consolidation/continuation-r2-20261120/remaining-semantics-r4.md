# GhostPay remaining-branch semantic continuation R4

**No new narrow runtime recovery is recommended by this pass. Several large differences are already retained in the separate required-v1/v1.1 candidates; they remain unintegrated with the smaller current stack.**

This is read-only source inspection, not test execution, hosted qualification or merge approval. Frozen baselines are main `aa3df1cb37274fae73af0ca957183c15c51b62d3`, combined #307 `2876b7db580e47a880d5951ce9e62941bcf76fdf`, Sweep #325 `1788f1e0a0fe1fb22bb887427c47bdd62db78c1a`, idle #331 `f5e04a30bd538b5dba6202885c8e1c3cceb31fa3`, required-v1 `74dccc419bf5c82b21875d205ed5a97d0c4e69b6` and required-v1.1 `8c196d12fd45dc5a49a6c1d69f9b5d6c532994e9`.

## Coverage of this pass

A complete local-tree comparison revisited **75 previously unreviewed refs / 75 distinct heads** from the earlier 387-ref census. It compares every branch-touched code path and its blob/mode to the frozen baselines. These are **75 mechanical comparisons, not 75 semantic approvals**. The raw 6,053,869-byte comparison is embedded losslessly as gzip/base64, with original byte count and SHA-256, in `remaining-semantics-r4.json`.

The twelve bounded finding groups below cover seventeen donor heads. Each has explicit path scope and exact blob/mode identities in the JSON. Large branches are not approved in full merely because their selected feature slice is retained.

## Findings

| Donor group | Source-pinned disposition |
| --- | --- |
| QR flag coverage `4493793a` | Complete `qrKinds.test.ts` exactly matches #331, including final unverified/flag combinations. |
| Clipboard guard `6c648770`, qualification `04910f65` | Absent from #331, retained by a stronger v1.1 successor. It preserves the second read before clear and adds pre-dispatch copy ownership, cleanup revision, pending-clear serialization, digests and stale-completion checks. |
| Receipt hash validation `acbf39ee` | Current `wallet.ts` retains submitted-hash binding and additionally refuses non-string transaction hash/input and receipt statuses other than 0 or 1. |
| QR conflict expiry `172695ef` | Runtime and complete assembler regression file exactly match #331. |
| Amount parser `a9e07155` | Runtime and complete format regression file exactly match #331. |
| Combined QR branch `26f83ccd` | Current QR classifier retains bearer/secret priority and strengthens runtime input refusal. Its relayer/transfer slices already have R3 dispositions. |
| Adapter audit `d6f6617e` | Current deployments runtime is exact; RPC and quote slices have stronger successors. TRON range is separately recovered in #329. This finding excludes bundle, contract and backend portions. |
| Private scan `18b36745` | `privateScanLifecycle.ts` and `privateScanStore.ts` exactly match v1 and v1.1. They are absent from #331; preserve them through deliberate broad-stack integration rather than recreating a donor. |
| Hosting audit `b5e2ea3e` | `frameGuard.ts` and guarded `manifest.ts` exactly match v1 and v1.1. This establishes source preservation in another stack, not hosting or deployment acceptance. |
| Native Sweep review `cbc96840` | v1/v1.1 retain the native-fee review feature and exact view regression file. #325/#331 have separate newer authority repairs. Reconcile those boundaries; do not replace Sweep wholesale with the old donor. |
| Sonar branches `1054daab`, `3a3b136a` | All 33 compared code paths for each branch exactly match both v1 and v1.1 in blob and mode. This excludes documentation and executable code under excluded documentation paths. |
| Bitcoin lineage `9617e857`, #244 `981cc2f4`, evidence `7954f1e5`, #254 `2b4b1e91` | Conflicting feature alternatives remain preserved. v1/v1.1 use #254's worker client/tests, including symmetric provider-status/consent validation. No automatic selection or full Bitcoin audit is claimed. |

## Integration implications

The current smaller stack and the broader required-v1/v1.1 candidates contain useful changes in both directions. The smaller stack's exact QR-expiry and amount-parser fixes should not be lost during broad integration; the broader candidates already retain private scan journals, frame/origin guards, clipboard cleanup and native-fee review absent from #331. A differing branch is therefore neither automatically redundant nor automatically a new recovery task.

Bitcoin needs a deliberate design choice. PRs #244 and #254 use different spentness coverage/state contracts. In #244, light-mode provider consent is separately selected and reset when authority changes. The broader candidates instead pass `effectiveLight || providerCheck` and display a checked, disabled provider toggle in light mode. Both have worker consent guards, and v1/v1.1 retain #254's symmetric result-label guard. This UI/policy distinction is recorded without treating either entire implementation as approved. Both PR metadata reads still showed open drafts with merge conflicts; old execution evidence does not qualify a new integration.

No new runtime patch, dependency installation, test/build/browser execution, source/ref mutation, hosted write or live-chain request was performed. Active F04/F05/F10 owners, ongoing backup recovery, existing TRON/idle work, contract/relayer scope, and the unresolved legacy-payment migration policy were preserved. Remaining broad differences still require semantic review and combined qualification.

## Evidence use

`remaining-semantics-r4.json` contains full donor/baseline identities, scoped findings, read-only command types, metadata-read pins and the complete compressed mechanical comparison. Decode the embedded base64 payload, decompress gzip and verify its recorded length and SHA-256. The worker verified round-trip equality with the original bytes. This report makes no assertion about branch heads or hosted check status after its recorded reads.
