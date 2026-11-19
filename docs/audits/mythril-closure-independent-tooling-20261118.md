# Independent checker/capture review — 2026-11-18

Reviewer: `factory_security`, independent of the checker/capture implementation. This is an
AI-assisted source review, not an external audit. Inspected runtime snapshot:
`f9b8928c35e3825a9f73ae31d3b33cb38b354703`. The checker, capture and runner bytes are identical
to the initially inspected `f565ba9c4dc0ec8b5a4054c2af735a55304df145`.

Scope: `scripts/contract-analysis/mythril-disposition-check.mjs`,
`packages/contracts/scripts/{capture-mythril-evidence.py,run-mythril.sh}` and their tests.
No active analyzer worktree or installed package was modified by this review.

## Confirmed finding: extra compiler options can escape the configuration binding

**Medium, proposed checker only; inactive finding exceptions remain blocked.**
`checkEvidence` checks the known compiler fields but does not reject extra top-level keys in
captured `config.json`. Updating the retained file and its capture hash while leaving the
original synthetic approval/record configuration unchanged returned `ok: true` for each of:

- `viaIR: true`
- `metadata: { bytecodeHash: "none" }`
- `debug: { revertStrings: "strip" }`
- `unrecognizedCompilerOption: true`

The four cases used the existing offline fixture, the original fixture owner approval and
record, and the actual pinned checker. No production approval or finding was fabricated.
The exact rejection boundary should be the runner's three known keys: `optimizer`,
`evmVersion` and `remappings`. Rejecting any extra key closes this gap without modifying the
analysis runner, compiler budgets or active capture source identity. A regression should update
the retained config hash as well as its bytes, proving the semantic configuration check rejects
it rather than only the file-integrity comparison.

Correction: `4eae4aeaa39bc0a07622b76f7ec51cf9c944ecdc` restricts the captured configuration
object to those three known keys. Independent retest used a clean detached worktree at that
exact commit: all four original probes, including the additional unknown-option case, now fail
with `CONFIGURATION_CHANGED`; the complete checker fixture suite passed **27/27**, zero skips.
The regression updates both retained config bytes and their integrity hash while preserving the
original synthetic approval. This confirms the semantic check closes the reported gap. It does
not qualify later completeness-telemetry changes or grant broad tooling clearance.

## Toolchain identity limitation requiring trusted execution

The current record binds the Mythril launcher hash, native solc binary hash, `solcx.install`
resolver hash and `mythril/ethereum/util.py` selector hash. The actual inspected launcher imports
`mythril.interfaces.cli`; most analyzer modules, Python and z3 are not part of that compact
`toolchainIdentity`. Changes to installed detector/laser modules can therefore leave this
identity unchanged. Supplemental package/source hashes and the full dependency freeze help
review the actual campaign but are not authenticated by this offline checker field.

This is a pre-activation trust boundary: use authenticated CI artifacts, independently confirm
the reviewed tool environment and exact source/approval identities, and retain the full package
closure. The offline helper explicitly does not authenticate the author of its supplied approval
record. It remains unwired and cannot clear the production strict runner. Do not equate a supplied
identity string or source-controlled approval object with an authenticated owner decision.

## Boundaries inspected

The source enforces an exact five-target order and required coverage, successful process outcomes
consistent with issue counts, stream hashes, duplicate-key rejection, duplicate issue/record
rejection, exact report reconstruction, source-closure hashes, source location/PC/SWC/severity,
compiler pins, depth 3 / 900-second budget, reviewed record digests and supplied runtime bytecode
hashes. Unexpected stderr is rejected by the proposed checker except its one narrowly recognized
package deprecation warning. These observations are source review; they do not independently
prove complete symbolic exploration or qualify a different candidate.

The runner still rejects every reported finding. No SWC category, detector module or residual
fee/timestamp risk was accepted or suppressed by this review.

## Final-candidate coverage attempt

From an immutable detached worktree at `f9b8928c35e3825a9f73ae31d3b33cb38b354703`:

```text
forge coverage --threads 2 --ir-minimum --report summary --report lcov --report-file <qualification>/contracts-lcov.info
```

Default compiler configuration and fuzz/invariant budgets were preserved. The command exited 1
after 32.47 seconds while compiling 119 files: solc received SIGKILL 9. No tests or coverage report
completed. Git commit/tree and tracked-file cleanliness were unchanged before and after. The
cause of the signal is not established by the command output; it is not represented as a source
test failure or a passing coverage check. No retry or heavier process was started pending
coordinator scheduling.

Retained run record: `qualification/forge-coverage.json`; raw log SHA-256:
`0ee0e940f040174735e5deaa6e507bc79f1b3d637f6a17c38c926e7572368730`.
The coordinator owns final evidence integration and any repeat after resource contention is resolved.


### Configuration correction retest evidence

The detached review checkout remained clean at `4eae4aeaa39bc0a07622b76f7ec51cf9c944ecdc`.
The four-case independent probe and complete checker-suite output are retained in the sibling
`data/mythril-closure-checker-review-20261118/` directory, with raw/compressed hashes in its manifest.
No approved record, production source or active analyzer directory was modified by these tests.

## Completeness telemetry follow-up — 2026-11-19

Narrow review snapshot: `47f41a818a2e63abef2c459730b712c1c6bd8a36`, in a clean detached
checkout. Reviewed the compatibility launcher, strict runner, capture helper, offline checker,
and their changed tests against the installed Mythril 0.24.8 timeout methods, CLI output path,
`MythrilAnalyzer.fire_lasers` exception handling, and `Report.as_json` serializer. This review
does not qualify a native symbolic campaign or authenticate an owner approval.

The compatibility layer calls each wrapped original timeout method once per invocation and
returns its original Boolean. It observes whether the execution or creation termination check
ever reports a deadline. The creation check can delegate to the execution check; both flags can
therefore be true for one expired global deadline. That classification still rejects the run.
The serializer wrapper returns the original JSON unchanged and separately counts reports and
the exceptions that Mythril omits from that JSON. An observer on the `mythril` logger records
ERROR/CRITICAL messages, including the original analyzer's swallowed `KeyboardInterrupt` path,
which does not populate `Report.exceptions`.

The runner supplies a fresh sidecar path for every target. A preexisting path is refused by the
launcher; missing, malformed, duplicate-key, extra-field or mistyped telemetry is rejected by
the validator. The offline checker independently checks the sidecar hash and exact schema.
An internal deadline returns 124; missing instrumentation, anything other than one serialized
report, an exception or an observed error returns 2. Ordinary analyzer status is retained when
those completeness conditions hold. The strict runner continues to reject all findings and
abnormal process statuses. No timeout, transaction-depth, compiler, optimizer or module setting
was lowered, and no finding disposition was activated.

The independent invocation of the three focused Node suites reported **42 passed, 0 failed,
0 skipped**. Its output is retained as `completeness-review-tests.log.gz`. Those tests cover
clean and finding reports, internal execution/creation timeouts, hidden exceptions, swallowed
interrupt logging, malformed or stale telemetry, changed configuration, and capture/checker
binding. Their fixtures are synthetic and do not establish native contract-analysis success.

An additional independent fixture used the **installed original** `fire_lasers` catch logic and
`Report.as_json`, with controlled replacement of `SymExecWrapper` and issue retrieval so that
no symbolic campaign ran. It applied the same `coloredlogs.install` call used by the CLI after
instrumentation. The clean control returned 0; a swallowed `KeyboardInterrupt` and a swallowed
general exception each returned 2 even though the original serializer still produced its clean
JSON. The interrupt had zero report exceptions and was caught through logging; the general
exception had one report exception and an error log. All three preserved the exact original
JSON and restored the method objects and logging observer. The fixture process exited 0,
meaning its assertions passed; that exit is not a native security-analysis result.

The unchanged wrapper hash was
`649afc99ebf910d7f7cc9edd7a15bff9cbabe93cba042171af10b48ff9726bcd`.
The installed analyzer-module hash for this fixture was
`f1527085aa192c8ac3a2aa7bad46e0f5694c797a4f7d9f1398794962e8149ea5`.
The exact fixture, command record, raw/compressed log hashes and clean before/after source
identity are retained in `data/mythril-closure-checker-review-20261118/`.

No additional false-success case was found within this narrow instrumentation review.
The telemetry detects these known interruption/error signals; configured transaction, depth,
loop and solver limits still bound exploration and are not exhaustive proof. The installed
module/dependency authentication and owner-approval trust limitations described above remain.
