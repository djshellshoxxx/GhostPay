# GhostPay PR #270 — sanitized execution evidence

## Source boundary

Historically tested immutable candidate: `fefcd57fb2397685a361dcbb9b9cf705efbfc17b`.
Earlier published 22-case JSON checkpoint: `2557186cd7547990cc32978639e18162d4a69235`.
Initial base: `c40b7581b9b996f33612186bc91960c65273cb64`; refreshed base: `cb7cfc9ec4f6c051e99805a25132c9458beb7af0`.

This receipt aggregates existing author execution and independent source review. The evidence reviewer ran no new tests or installations and made no source or remote changes. Exact source blobs, commands, execution boundaries and raw-log hashes are in `receipt.json`. JSON focused logs do not preserve complete argv or per-invocation file hashes; their command is deliberately summarized rather than reconstructed.

## Semantic refresh: current source is different

The active consolidation coordinator advanced the base to `155d009160a6e5b2c24a91705c72fc8cca6ce815`, tree `e585d1dec43844bd18167f213c246994ea6c4397`, and incorporated the alternate #268 merchant-clock policy. This task now **preserves those base merchant files exactly** and removes its former #246 merchant delta.

- Current base merchant runtime: `a4269dec888518799aa4b3e8cc82d2ff9cc21d77`.
- Current base merchant tests: `a1299d9ceedefeefb5784d287d556008531af02f`.
- The base rejects nonfinite or negative clocks as `format` at function entry. Earlier #246 semantics checked nonfinite clocks at the existing expiry boundary, after signature validation. Those earlier semantics are not restored.
- The four JSON/scanner runtime/test blobs are identical to historical fefcd57. This limited equality does not establish whole-candidate input equality.
- The refreshed checks ran before publication on a JSON/scanner overlay at `/tmp/ghostpay-c374725a11b7-refreshed`. The publication base `c7e09bc7cdb52e9172fa80fc2db83251fad6cd1a` has exactly the same tree as tested base `155d009`. The containing commit maps to the recorded source blobs; tests are not claimed to have run after publication.

**Prior 63-case merchant success and the full 858-case fefcd57 run are historical source-pinned evidence, not final refreshed-source qualification.** The fresh JSON plus base-merchant selection passes **32/32**. The initial invoice typecheck/lint and scoped scanner lint attempts terminated without diagnostics. A later direct invocation of the unchanged invoice TypeScript check passed; lint remains incomplete. No refreshed full-suite pass is claimed.

## Refreshed-source checks

All four commands ran serially on the refreshed scope with Node `v24.22.3`, `NODE_OPTIONS=--max-old-space-size=512`, and unchanged source/configuration blobs before and after execution. The exact command receipt is hashed in `receipt.json`.

| Check | Actual result | Raw log SHA-256 |
|---|---|---|
| `refreshed-invoice-focused` | 32/32 passed (24 JSON + 8 base merchant); exit 0; 1.29 seconds | `1613638fb007f1095fad19dea94e6012708527a0ae46cff4250fed8039a2ede9` |
| `refreshed-invoice-typecheck` | exit 137; incomplete | `4d93c9c20ee236790ebd4cb4e058f0f506814933ed3fe8a9615af57d0b278c43` |
| `refreshed-invoice-lint` | exit 137; incomplete | `e813c6269810eccc58a6e049b84546f05c636d056790cf2356d8912c8eccd75e` |
| `refreshed-scanner-lint` | SIGKILL / return -9; incomplete | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |

No TypeScript or ESLint source diagnostic was emitted before the three kills. An empty lint log is not a successful check. The termination cause is not established here. No timeout, threshold or test assertion was changed, and no retry is represented by this receipt.

## Bounded follow-up checks

After the initial killed checks, the coordinator retried the original commands directly with `NODE_OPTIONS=--max-old-space-size=256 --max-semi-space-size=8`. No compiler options, lint rules, source files, test deadlines or coverage thresholds were changed.

| Check | Actual result |
| --- | --- |
| Original invoice `tsc -p tsconfig.json --noEmit` | **Passed**, exit 0, 3.765 seconds; empty diagnostic log |
| Original invoice typed lint | SIGKILL (-9), 2.435 seconds; no rule diagnostic |
| Original two-file scanner typed lint | SIGKILL (-9), 3.617 seconds; no rule diagnostic |
| Original web dependency/build script | Exit 137, 5.765 seconds; address-safety built, BTC dependency compiler killed; web build not reached |

The bounded compiler result qualifies that check on the refreshed source. It does not convert the earlier killed invocation into a pass. Typed lint and production web qualification remain incomplete. Exact argv and log digests are included under `bounded_followup_checks` and `production_web_build_attempt` in `receipt.json`.

## Historical executed outcomes

| Check | Result | Raw log SHA-256 |
|---|---|---|
| `canonical-json-red` | 11 passed / 11 failed; exit 1 | `d77a2a3d96fc809101105fec92563a3fa318d43eb41f952d297013b5ef63d3be` |
| `canonical-json-green-prior` | 22 passed / 0 failed; exit 0 | `397943af34f42f981b7184b87b88c3376aedbd76dd7fe3008e0de54ba8d57df0` |
| `merchant-clock-red` | 37 passed / 26 failed; exit 1 | `4996ae8e4561ec054650174dd912e6f90d3e3e140186ec113669d9896009d068` |
| `merchant-clock-green` | 63 passed / 0 failed; exit 0 | `80367ce4bd1b4084cf86cd495e0ba44f24a43f1d2aac7cb54e87c28f6e6c566a` |
| `scanner-core-red` | 1 passed / 2 failed / 18 filtered; exit 1 | `14f824dc8f7d0b78043ba7258ebc572ee1f02d648fc501d2f6db42186cc77529` |
| `scanner-core-green` | 21 passed / 0 failed; exit 0 | `5077557909d293bed11a10fd5c2ceb8f60cec82d87d62cfe9a59de8a355d6279` |
| `scanner-million-corpus` | 1 passed; unchanged 1,000,000-log corpus; exit 0 | `9797af2871456e9c90f5267d035d40240e867ba1fcfc7ce8683072f16871566a` |
| `merchant-worker-typecheck` | exit 0 | `87163942c8d255b8a721e8dcd47a0b853062fb0f5834ff309251a80cc788a8fa` |
| `merchant-worker-lint` | exit 137 | `dbd7853da1ac3b04431dcb9771ea16fbdab483cf3eb537ac616004c3f351aa11` |
| `invoice-schema-full-coverage` | 855 passed / 3 failed; 13 of 14 files passed; exit 1 | `e2a6819cc3d49c5250277801a41aeceb188c88fac9851302346501e58f398d05` |

### Canonical JSON suite versions

The original regression run recorded 11 failed and 11 passed tests. The repaired **22-case** suite passed in 244.82 seconds, with most elapsed time reported as transform/import overhead. This historical focused pass is not relabeled as a separate final **24-case** focused pass. The final suite preserves two additional upstream cases. It was included in the later full package run; that run reported only passphrase-file failures and the coordinator confirmed the JSON and merchant files were among the 13 passing files.

### Historical merchant clock source (removed from current task scope)

Only `merchantProfile.ts` and `merchantProfile.test.ts` were recovered from #246 at `509a800439f2feb6173b20d2543746c3d74e9a42`. The runtime/test blobs are `35af2b07417916eca4d10e1e4f5584e171ece1dd` and `31d40e8871a4d1a89c525d3361cb2922431c5c4b`. Fresh original-runtime regression execution failed 26 of 63 tests; the alternate recovered-source snapshot passed all 63. Worker typecheck passed; worker typed lint ended with exit 137 and is not a pass. These worker checks are not final combined-candidate qualification.

### Scanner source

RED uses test-first commit `f123c8682273f8ea0a9f468aadf41fc580bb6cdf`, runtime blob `3d22991c284bc58ef0abe27671785ef768546259`, and the same test blob used in GREEN: `64d9d0d95a66da023f2968faa7bd97c7dbe66605`. Three cases were selected: two failed, one passed, and 18 were filtered. GREEN uses historical fefcd57 runtime `3ad466bae0d7d19187260e0696c0d29fb6a71293` and passes the complete 21-case file. The million-log fuzz corpus is unchanged at blob `77ce0bd28772235418d9e241b0da84028068035f`; its separate execution now passes 1/1 in **65.62 seconds** (66.466 seconds wrapper time), retaining the original 180,000 ms deadline, assertions and configuration. Coverage was disabled. No matching baseline timing was measured, so no speedup ratio is claimed.

### Historical fefcd57 invoice-schema coverage run failed

The historical fefcd57 original-configuration run completed **858 tests: 855 passed and three failed**, across **14 files: 13 passed and one failed**, in **852.72 seconds**. The coordinator confirmed terminal exit 1. All three failures are existing passphrase tests that exceeded the unchanged 60,000 ms deadline:

- Re-encrypted altered-invoice signature verification: 61,139 ms.
- Authenticated malformed plaintext: 62,006 ms.
- NFKC-equivalent passphrases: 60,002 ms.

No coverage percentage/threshold report appeared in stdout. The unchanged 95/90/95/95 coverage requirements are **not qualified**. Focused passing tests do not supersede this failed full run. Deadline exhaustion is observed; its ultimate resource/performance cause is not established by this receipt.

## Sanitization and remaining qualification

Full raw logs are hashed but not copied. The 165,129-byte scanner RED log contains spy call arguments with synthetic buffers; those bytes and argument dumps are excluded. Test names, counts, command metadata and SHA-256s are retained.

Refreshed invoice TypeScript passed. Typed lint, production web build, full refreshed invoice coverage, instrumented web/browser qualification and applicable hosted/security gates remain incomplete or require their own results. The passing noncoverage million-log corpus does not replace those gates. This receipt does not authorize shared integration, a main merge, deployment or release. Another coordinator owns the integration lock.
