# Mythril evidence and proposed disposition checker — 2026-11-18

## Status and source boundary

This is an AI-assisted tooling review, not an external contract audit or finding approval. The production
`run-mythril.sh` still fails for **every finding**. No production exception file, owner approval, approved-mode
workflow step, deployment or release was created by this worker. The owner must separately approve exact
finding records and any future gate integration.

Initial main was `58d89b39b27a66454ebf392bcd35d5c68b57b2f8`. The proposed, previously unwired checker and
its process-failure defenses were inspected at PR #225 head
`94ca7d5ba9dc65c7324805e5bf9b7d1d2dccee57`, stacked on PR #212
`4894d0d8d94333dffa8ae3937a4d8314f27c686f`. Neither checker file was present on initial main.

Worker commits (local source identities; the coordinator records any publication mapping separately):

| Commit | Scope |
|---|---|
| `9eedf791` | Optional complete-target capture with unchanged strict finding behavior |
| `6c9fed94` | Reject duplicate JSON object keys in the strict runner |
| `49065562` | Bind capture to the native compiler selected by Mythril, rather than the PATH launcher |
| `63fa32ca` | Schema-2 checker and expanded offline regression suite |
| `4eae4aea` | Reject extra compiler JSON settings even if the retained file hash is updated |
| `47f41a81` | Expose and reject known internal execution/create timeouts, omitted report exceptions and incomplete telemetry |

The last commit is the final worker code source for this review. Coordinator integration commits and the native five-target
campaign have their own identities; isolated worker tests do not qualify a different combined candidate.
The coordinator's later metadata-only fix `9c7c59c82b9888c60a84069a7c8e7844127ff41e` was independently
reviewed as described below; the final campaign must bind that changed capture source.

## Findings and corrections

| Finding | Observed mechanism and evidence | Correction |
|---|---|---|
| T1 — anonymous coverage | #225 counted JSON documents. Five anonymous or duplicated clean outputs could replace a missing target. The original code explicitly documented this limitation. | Require a completed manifest containing each of the five production targets exactly once, in runner order, with exact invocation, source file, retained stream hashes and process outcome. No aggregate-log-only qualification. |
| T2 — incomplete configuration and provenance binding | #225 checked compiler version/optimizer/EVM/version strings, but not execution budget, transaction depth, module selection or full imported-source closure. A compound offline fixture with `-t 1`, timeout 5, duplicate issue, arbitrary approval text and unrecognized output returned `ok: true`. | Bind full source inventory, configuration, analyzer/native-compiler identities, actual argv and per-finding source/runtime bytes. Require default modules, depth 3 and 900 seconds. |
| T3 — duplicate JSON keys | The initial production runner's jq parser accepted `success:false, success:true`, `error:"fatal", error:null` and duplicate nested keys. All three baseline fixtures returned exit 0 and printed five reports. | Parse with a duplicate-rejecting Python object-pairs hook before the existing jq clean-report test. Three regressions exercise each malformed fixture at each production target. |
| T4 — ambiguous findings and annotations | #225 did not reject duplicate issue identities. It associated runner errors with the preceding anonymous JSON document and did not verify that annotation names identified that target. | Reject duplicate issue keys; reconstruct the exact aggregate log from target-bound stdout/stderr and required error annotations. Missing, extra, moved, duplicated or altered text fails. |
| T5 — unrecognized output | Successful-looking JSON could coexist with ignored log text. Unknown schema fields and new stderr diagnostics must not imply accepted analysis. | Strict JSON parsing for each complete stdout; exact top-level report fields; reject unknown diagnostics. The only permitted nonempty stderr is the exact observed two-line `pkg_resources` deprecation. It is retained, not removed. |
| T6 — native compiler identity | The PATH `solc` can be a solc-select Python launcher. Its hash is not the compiler that Mythril `--solv` actually invokes. This was raised by the independent integration reviewer. | Inspect pinned Mythril selection code, then resolve `solcx.install.get_executable("0.8.28")` after every target, execute its version command, and hash that native file plus the resolver and Mythril selector code. Every target must match the final selected identity. |
| T8 — extra compiler settings | Independent review reproduced acceptance after adding `viaIR: true` and updating only the captured config hash. | Require exactly `remappings`, `optimizer` and `evmVersion`; regressions also reject additional metadata/debug settings. |
| T9 — silent internal termination | Installed Mythril 0.24.8 returns successful JSON after its internal deadline check returns true, and JSON omits `Report.exceptions`. Merely counting complete processes leaves known partial execution eligible. | The compatibility launcher observes the original deadline methods, report exceptions and Mythril error logs without changing analysis decisions. A fresh mandatory sidecar rejects these incomplete outcomes even when raw JSON looks successful. |
| T7 — unscoped approval and incomplete review metadata | A free-text `ownerApproval` and optional location fields did not encode which exact records, source or configuration the owner intended to approve. | Schema 2 requires explicit approval state/identity/evidence, the exact records digest, source identity and configuration digest, plus each record's reviewer identity/evidence, residual risk, exact location and toolchain identity. Pending or missing approval remains a failure. |

These are tooling and evidence-integrity defects. This review establishes no new exploitable contract defect.
The historical #225 abnormal-exit defenses are preserved and expanded: clean JSON followed by exit 1, findings
followed by exit 0, any exit 2/124/126/127/137/143, partial analysis and contradictory aggregate status all fail.

## Passive capture interface

Run the same strict analyzer with a **new, nonexistent** evidence directory:

```bash
MYTHRIL_EVIDENCE_DIR=/absolute/new/campaign-evidence \
  bash packages/contracts/scripts/run-mythril.sh > report.log 2>&1
```

Preserve the process exit code separately, even when it is 1 because findings were reported. The command still
uses Mythril 0.24.8, Solidity 0.8.28, Cancun, optimizer 200, transaction depth 3, 900 seconds and default modules.
Neither the capture helper nor checker disables detectors or authorizes a shorter campaign. An explicit other
runner timeout is faithfully captured, but cannot qualify under the current reviewed checker configuration.

The directory contains:

- `manifest.json` and the exact `config.json` passed to the compiler;
- `<Target>.stdout.json`, `<Target>.stderr.log` and `<Target>.completeness.json` for all five targets;
- source commit/root, timestamps, full input inventory and hashes, tool identities, normalized exact argv,
  per-target exits, aggregate runner exit, and completion/source-stability flags in the manifest.

Targets are `GhostPayRouter`, `GhostPaySweepRelayer`, `GhostPayPolicyRouter`, `PolicyAccount`, and
`PolicyAccountFactory`. Source inventory covers all Solidity files in contracts `src` and vendored OpenZeppelin,
plus the runner, compatibility layer, capture helper, Foundry configuration and analysis workflow. Missing files,
symlinks, stale/reused output directories, changed inputs and incomplete capture fail closed. The source inventory
is intentionally conservative: changing an inventoried workflow or helper invalidates the prior source identity.

Use the same Python environment for the helper and Mythril, and install the repository compatibility launcher as `myth` on PATH as the analysis workflow does. The bare pip entrypoint does not produce required completeness telemetry and is deliberately refused by the strict runner. Version commands remain unchanged. Compiler identity is collected **after** each target,
so the helper does not install a compiler or contact a compiler host. The analyzer can perform its existing first-use
compiler installation. The helper then records the actual selected backend, not an assumed PATH wrapper.

The verified selection in installed Mythril 0.24.8 is:

- `mythril/mythril/mythril_disassembler.py`, `_init_solc_binary(version)` calls `util.solc_exists(version)`;
- `mythril/ethereum/util.py`, `solc_exists(version)` installs/selects that version and returns
  `solcx.install.get_executable()`;
- py-solc-x 1.1.1 resolves the explicit version to its configured install directory.

The capture records the selected native executable's SHA-256 and version, and the SHA-256 of both selector files.
A compiler that cannot be identified, or whose identity changes between targets, leaves capture incomplete.

## Schema 2 and owner decision boundary

Schema 1 is deliberately rejected. It cannot express complete captured coverage, the actual toolchain or scoped
approval. No existing production workflow used schema 1, and no production approval has been migrated.

Top-level proposal fields are `schemaVersion: 2`, `analyzer: "mythril"`, `expectedAnalyses: 5`, `records`, and
`ownerApproval`. `records: []` is permitted for a fully clean complete campaign; it requires no fabricated
exception or owner decision. When any record exists, an absent or pending approval fails.

Every record requires:

| Field | Binding |
|---|---|
| `id`, `analysisTarget` | Unique reviewed finding and the production target that actually emitted it |
| `contract`, `function`, `swcId`, `pc`, `severity` | Exact Mythril identity, including raw contract value (which can be a symbolic address) |
| `sourceMap`, `sourceFile` | Exact reported source map plus a repository-relative source file |
| `filename`, `lineno` | Present iff emitted by Mythril; exact location required |
| `sources` | Nonempty unique `{path, sha256}` list including `sourceFile` |
| `sourceIdentity` | SHA-256 of the canonical complete captured source inventory |
| `toolchainIdentity` | SHA-256 binding analyzer launcher, selected native compiler, solcx resolver and Mythril selector |
| `runtimeBytecode` | Target contract and SHA-256 of independently supplied compiled runtime bytes |
| `compiler`, `analysis`, `analyzerVersion` | Exact compiler and analysis configuration read from the current pins |
| `disposition` | Only `false-positive` or `benign-intended`; a real vulnerability cannot be excepted |
| `evidence`, `residualRisk` | Source-pinned supporting review reference and explicit remaining risk |
| `review` | Reviewer identity, source-pinned evidence reference, and the exact reviewed source identity |

An issue's absolute source filename is normalized only below the captured checkout root and must identify an
actual inventoried file. Arbitrary matching suffixes or another checkout's path are rejected. Source-less compiler
findings still require the reported source map/PC and analyzed target; no fabricated filename is inserted.

Create a proposal with `ownerApproval: null`. After a real, independently verified owner decision, the approval
shape is:

```json
{
  "status": "approved",
  "identity": "<actual authenticated decision-maker>",
  "evidence": "<immutable reference to that decision and its exact scope>",
  "recordsDigest": "<sha256(canonical(records))>",
  "sourceIdentity": "<the reviewed source identity>",
  "configurationDigest": "<sha256(canonical(configuration))>"
}
```

This is a schema description, **not an approval**. The checker does not contact GitHub or authenticate the claimed
human author. The coordinator must verify the actual decision through the authenticated source and ensure that
its referenced evidence is immutable and matches the recorded digest. A file naming an approver is not itself
proof that the approver made that decision. This remains a prerequisite to any future workflow activation.

The exported `readPins`, `sourceInventory`, `configurationFromPins`, `canonical`, `sha256`, `toolchainIdentity`
and `TARGETS` helpers support deterministic construction of a source-pinned proposal without inventing approval.
The `review` evidence and owner decision must be verified independently; schema validation does not establish
that a human read a document or agrees with its reasoning.

Standalone validation uses:

```bash
node scripts/contract-analysis/mythril-disposition-check.mjs \
  --dispositions proposed-dispositions.json \
  --report report.log \
  --evidence /absolute/new/campaign-evidence/manifest.json \
  --bytecode GhostPaySweepRelayer=GhostPaySweepRelayer.runtime.hex \
  --bytecode PolicyAccount=PolicyAccount.runtime.hex \
  --bytecode PolicyAccountFactory=PolicyAccountFactory.runtime.hex
```

Only the targets referenced by records need `--bytecode`; every target still needs capture coverage. Duplicate
CLI options and duplicate bytecode names are rejected. Exit 0 means the supplied evidence and disposition scope
match, 1 means a failed check, and 2 means unusable input. With `ownerApproval: null`, real proposed finding
records cannot produce exit 0.

## Qualification limits

`completed` identifies complete five-target process capture with unchanged source and compiler identity.
Qualification additionally requires a fresh, hash-bound completeness sidecar for every target. It has exactly:

```json
{
  "schemaVersion": 1,
  "instrumentationReady": true,
  "reportCount": 1,
  "executionTimeoutObserved": false,
  "creationTimeoutObserved": false,
  "exceptionCount": 0,
  "errorLogObserved": false
}
```

The launcher calls each original `LaserEVM._check_execution_termination` and `_check_create_termination`
method exactly once per invocation and returns its original boolean. It records a true return; it does not extend
budgets, change work lists or alter symbolic states. `Report.as_json` still serializes the original report, while the
observer records its exception count. A silent logging handler on the Mythril logger records ERROR/CRITICAL
signals, including an interrupt swallowed by the upstream analysis loop. All hooks are restored in `finally`.

Known internal execution or creation timeout changes the process outcome to 124. Missing instrumentation,
missing/duplicate reports, recorded exceptions or observed error logs fail with 2. Normal complete 0/1 outcomes
are preserved, and stdout is unchanged. Sidecar files use exclusive creation in a fresh private directory; stale,
missing, empty, malformed, duplicate-key, extra-key or mistyped sidecars fail. The strict runner requires this
telemetry even without optional artifact capture, so clean-looking JSON cannot erase known partial execution.

This is still bounded symbolic analysis, not proof that every feasible path was explored. The configured
transaction/depth/solver bounds and any other unobserved pruning or upstream limitation remain explicit limits.
The code rejects the concrete hidden deadline/exception mechanisms verified in the pinned upstream source;
it does not equate absence of an observed failure with exhaustive symbolic completeness. External process
termination/crash is separate and is always rejected.

The source inventory, hashes and exact output reconstruction detect changed or ambiguous retained evidence;
they do not authenticate an artifact's producer against a malicious local user who can forge every file and
approval field. Qualification additionally needs the trusted workflow/run identity, protected source, authenticated
owner decision and independent source review. No signature system or new trust root was introduced.

The toolchain identity hashes the installed launcher, actual native compiler and the specific selector/resolver
sources. It does not hash every installed Mythril/Z3/Python dependency or independently authenticate the entire
package distribution. Retain the actual pinned package-install evidence, package/source hashes and dependency
freeze with native/hosted qualification; a claimed version string alone is not a trusted installed-code provenance
system. No additional package authenticity or signing infrastructure was introduced.

A historical finding may be absent from a bounded symbolic run. Its still-valid proposed record is listed as
`NOT_REPORTED`; all its source, bytecode, configuration, toolchain and approval bindings are nevertheless checked.
An absent historical record is never substituted for a missing target or an analyzer failure.

## Tests and evidence

The original #225 checker/runner/workflow suite passed 39/39 before changes. The compound permissive-checker
fixture and all three duplicate-key original-runner fixtures reproduced the defects described above.

At code source `47f41a81`, the focused instrumentation/checker/capture batch passed **42/42**, zero failures
or skips, in 19.20 seconds: 9 instrumentation cases, 28 checker cases and 5 capture cases. The checker includes
all earlier semantic assertions plus exact coverage, errors, source/configuration/toolchain binding, duplicate
rejection and inactive/mismatched approval. No timeout or coverage threshold was increased to obtain a pass.

The separate strict-runner suite on the same worker code passed **31/31**, zero failures or skips, in
338.65 seconds. Its existing per-target loops, assertions and subprocess time bounds were retained. The nine
additional completeness cases reject absent, empty, malformed or duplicate-key telemetry, internal execution
and creation deadlines, hidden report exceptions, logged errors and a missing serialized report.

The installed Mythril 0.24.8 interface smoke separately passed three cases using the actual LaserEVM methods
and Report serialization: complete (exit 0), expired internal execution deadline (124), and omitted report
exception (2). Original JSON bytes matched in every case and original method objects were restored. This is an
installed-interface test with synthetic state, **not** a symbolic contract campaign. The observed compatibility
source hash was `649afc99ebf910d7f7cc9edd7a15bff9cbabe93cba042171af10b48ff9726bcd`.

An earlier full sequential pre-telemetry batch at `63fa32ca` emitted **56 passed / 4 failed / 0 skipped** in
382.47 seconds. The four failures were existing runner-fixture subprocess timeouts followed by missing fixture
argument files under concurrent native test/install load. It is retained as a failed run, not relabeled green.
The focused duplicate-key cases had passed separately. Final complete workflow and integration results remain
coordinator-owned and must be recorded for the actual combined candidate.

### Native metadata preflight

The coordinator's initial capture at `f9b8928c35e3825a9f73ae31d3b33cb38b354703` was incomplete: its
manifest recorded `TimeoutExpired` / exit 124 for the Mythril version probe, a PATH compiler reporting
0.8.38, no target records and `completed: false`. It is retained as unusable qualification evidence.

Two bounded version preflights with the corrected native-compiler PATH completed successfully: the existing
installed wrapper took 28.994 seconds, and the final compatibility source took 31.990 seconds. Both printed
`Mythril version v0.24.8` and only the known `pkg_resources` deprecation warning. The commands ran concurrently,
so their difference does not measure instrumentation overhead; the version command does not install the
analysis hooks. The latter measurement exceeded the capture helper's then-current 30-second metadata bound.

A subsequent serial, bounded `python -X importtime` invocation of the exact compatibility source in
`13ad455d707b0e4c7e5329b3299843354f44f137` completed with exit 0 in **36.857 seconds**. Its CLI cumulative
import time was 33.649 seconds; `mythril.ethereum.util` accounted for 12.682 seconds of self time and 12.744
seconds cumulatively. That module's installed source enumerates compiler versions during import, but the
import profile alone does not establish how much of its time was network delay. Profiling was enabled for
this measurement, and it is not a symbolic analysis run.

These results justified the coordinator's metadata-only adjustment at
`9c7c59c82b9888c60a84069a7c8e7844127ff41e`. Independent review of that exact diff confirmed that only the
Mythril version query receives a 60-second bound; native and PATH compiler version queries retain 30 seconds.
Missing executables, timeout/nonzero results, tool identities and source hashes retain their fail-closed
treatment. The symbolic execution budget remains 900 seconds, depth remains 3 and default modules remain
selected. Import networking behavior is unchanged. A successful final capture preflight and campaign must
be recorded for the changed source; none of these timings authorizes accepting a failed metadata probe.

Evidence: [`data/mythril-closure-tooling-20261118/verification.json`](data/mythril-closure-tooling-20261118/verification.json),
[`native-interface-smoke.json`](data/mythril-closure-tooling-20261118/native-interface-smoke.json), and
[`strict-runner-baseline.json`](data/mythril-closure-tooling-20261118/strict-runner-baseline.json), with version
measurements in [`version-preflight.json`](data/mythril-closure-tooling-20261118/version-preflight.json).
These offline/interface tests do not replace the full contract suite, Slither, Echidna, native symbolic campaign,
hosted CI or final integration qualification.

## Independent review of Factory deployment safeguards

A separate read-only pass reviewed the actual candidate
`f9b8928c35e3825a9f73ae31d3b33cb38b354703`: `DeployPolicy.s.sol`, `DeployBase.s.sol`, the shell preflight,
configuration/checksum tests and the unchanged factory fee flow. This reviewer did not author those changes.

No confirmed new security defect was found in the configuration acknowledgment. Its domain-separated digest
binds chain ID, token address, token runtime codehash, flat fee and fee recipient. The script validates the token
acknowledgment, digest, allowed chain, token code and fee bounds before starting broadcast, and preserves immutable
readback. The shell's ABI-encoded digest agrees with the independent fixed test vector. Zero fee skips only the
fee acknowledgment requirements; the factory itself avoids fee-token calls in that configuration.

Independent execution on that exact source passed **7/7 offline preflight tests** and **10/10 native configuration
acknowledgment tests**, with zero failures/skips. Native output/cache directories were separate from the frozen
candidate; no deployment or live RPC request was made. The checks included missing/mismatched/malformed digest,
changed chain/token/codehash/fee/recipient, checksummed address handling, rejected fee bounds and zero-fee behavior.

This does not certify a token's permanent behavior. A proxy can change implementation/storage without changing
the proxy runtime codehash; state-dependent fees, pause/blacklist or reverting views still require the documented
operator decision. Existing immutable counterfactual funds are not rescued by deploying another zero-fee factory.
No fee policy, fee recipient or Factory runtime was changed by this review.
