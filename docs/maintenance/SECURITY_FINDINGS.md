# Security findings and verification limits

## Current-source security work

| Finding / boundary | Evidence | Status and next action |
| --- | --- | --- |
| Analyzer output can hide a finding with duplicate JSON keys | Independent synthetic probe: main `e454de6a` accepted duplicate `issues` keys masking a finding (exit 0); #255 `ea47fa75` rejected the same output (exit 1) for all five targets | Confirmed parser gap on main; correction exists on independently owned #255, not yet merged/qualified |
| Analyzer completion/provenance integrity | #255 reviews hidden exceptions, timeout/process outcomes, five-target completeness and source/configuration binding | Keep fail-closed strict gate; do not mistake empty/partial reports for successful analysis |
| Factory fee-token freeze residual | Existing source-pinned reproductions/dispositions distinguish CREATE2/prefunding, token-view failures and changed fee/balance deltas | Real operational/economic residual remains; #255 strengthens deployment acknowledgment but does not change Factory runtime or accept a fee-recipient policy |
| Eleven historical Mythril records | Existing report has 3 Medium and 8 Low records, individually dispositioned in repository evidence | No claim that eleven records equal eleven confirmed exploitable bugs, or that all are fixed. Current strict campaign remains required |
| Recovery noncanonical bytes | #240 demonstrates that File.text can normalize BOM bytes before verification; reconciled source compares file byte size with canonical ASCII text length before parser validation | Selectively recovered in #260; independent source review and the three targeted BOM regressions passed. Broader qualification remains pending. |
| Recovery unload/custody boundary | Reconciled event-time handler checks current loaded keys and external-copy state | Two targeted event-time custody regressions passed in #260. Preserve broad loaded-session check when combining #256; recheck its newest head. |
| Secret/session revocation | #239 atomic restore and #256 synchronous revocation/checkpoint cache defenses | Independent reviews found no scoped blocker; exact combined browser/unit evidence remains required |
| Historical AST/SOCKS/proof-input gaps | #257 repairs comment-strip scanning, rejects decoded socket chunks and refuses zero proof inputs | Independent source review passed; raw circuit and hosted gates remain separate |

## Independent checks in this execution

- Production dependency audit against main's lockfile: `npm audit --omit=dev --json` completed with **0 reported
  vulnerabilities** (286 production dependencies; 814 total including other categories). This does not audit
  development-only dependencies, prove absence of unknown vulnerabilities or validate the incomplete local install.
- #255 focused local tooling batch: **90 tests, 78 pass, 12 fail, 0 skipped**. Failures hit the existing ten-second
  subprocess bound and missing fixture outputs during concurrent installation load. Environmental contention is
  suspected, not proven. One isolated clean-run repeat passed in 4.47 seconds. The batch is **not qualified**;
  no timeout threshold or security assertion was relaxed.
- Native Forge/Mythril and physical wallet/device/Tor acceptance were not executed by this independent reviewer.
  Author-reported results remain attributed to their original source and cannot be relabeled as this run.
- Full monorepo dependency installation failed twice with exit 137, including a 768 MiB JavaScript heap cap and
  one network socket. A separate web-scoped attempt also failed with exit 137. These failures do not establish a
  product defect and do not permit claiming full tests passed.

## Integration constraints

No approved exceptions, real funds, contract deployment, guardian recovery, production fee choice, telemetry or
server-side key custody are introduced. The proposed #255 disposition checker remains unwired and cannot clear the strict gate. Preserve its configuration-bound acknowledgment over #246's older token-only #217 variant.

## Additional scoped results

Recovery #260 records five RED then five GREEN behavioral cases with real cryptography and unchanged assertions.
Historical current-source tooling checks passed 43/43 with no skips. Documentation #259 passed the unchanged
secret scan and archive/link/provenance verification. These narrow passes do not erase the failed/incomplete
analyzer batch or qualify a combined product/release candidate.

### Final independent update review

An independent reviewer inspected #256 delta `df0d70de..247c3353`: two test files, eight insertions and eight
removals, with no production/dependency/configuration/workflow changes. Explicit types and nested error-message
assertions retain rejection and idle-custody requirements. No scoped blocker was found; no tests were rerun for
that test-only review. The documented #260 unload and atomic-restoration integration requirements remain unchanged.
