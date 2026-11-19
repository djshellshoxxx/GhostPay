# Policy client and current Mythril evidence — 2026-11-19

This packet preserves **36 original files** from the completed policy-client
recovery and the source-pinned Mythril investigation. The copies are byte-identical
to the collected files or exact committed handoffs. The
[manifest](manifest.json) records their origins, sizes and SHA-256 hashes.

This archive does not change runtime code or analyzer policy. **Mythril still
fails its strict gate with eleven findings: three Medium and eight Low. No
disposition or exception is approved.** A concrete trace that cannot execute in
the tested state does not dismiss the independently reachable fee-token risks.

## G1 policy-client recovery

The recovered source is commit
`7828166cdc10bc146b48ab1339f584c0b2753da2`, based on
`0249b30c7c6c3bfeda45287f41d92f8d2152c96c`. Its historical input is
[#211](https://github.com/djshellshoxxx/GhostPay/pull/211) at
`a92658b1ef6b95ff0145b2e1933d0047d51289d5`.

Exact committed handoff snapshots are retained as
[POLICY_CLIENT_20261119.md](g1/POLICY_CLIENT_20261119.md) and
[POLICY_CLIENT_20261119.json](g1/POLICY_CLIENT_20261119.json). All 28 source hashes
and all 16 evidence hashes in that JSON were checked against the recovery commit
and archived files. The stage patches and additional raw logs are also retained.

| Qualification | Original failure | Final result |
|---|---|---|
| N09/N10 validation and signing | 14 failed, 31 passed | 45 passed |
| N11 payment preparation and send binding | 4 failed, 39 passed | 43 passed |
| Record asset-coverage helper | 5 failed, 35 passed | Included in the final full package |
| Asset-coverage web cases | 6 failed, 28 passed | Included in the final affected-web selection |
| Full policy package | 1 failed, 117 passed before the Anvil fixture correction | 118 passed, including all seven Anvil cases; no skips |
| Affected web and security-key selection | Stage failures above | 121 passed across nine suites |

The final full package used `REQUIRE_ANVIL=1`. Its unchanged coverage gate passed
with 97.38% statements, 95.84% branches, 100% functions and 99.57% lines. The
existing typed-data vectors and adversarial getter tests remained in the
selection. The Anvil fixture now asserts the hardened builder's earlier refusal
and still constructs and submits the original invalid-leaf case, including exact
`LimitLeafMismatch` refusal and the mined revert.

Library typecheck, build and ESLint, plus separate scoped web ESLint, completed
successfully. The original empty success logs are preserved. Locale checks
reported zero errors and zero missing keys, with 521 existing draft/length
warnings and 139 unused keys. These are the previously recorded local results;
creating this archive did not rerun them. Full web or repository qualification is
not claimed.

Independent coordinator source review passed for N09/N10, N11/SEC11 and the
test-only Anvil correction. A payer holding only a meta-address still cannot
establish the permitted asset set. This is the existing client mitigation, not
protocol-level SEC11 closure. Domains, type hashes, authority, contract ABI,
numerical delays and the experimental feature flag are unchanged.

## Current source-pinned Mythril report

The analyzed source is **`198aa5baff22272453733a0f3dcfcac0e0994eec`**. Hosted
[run 44342340082, job 134935409285](https://github.com/djshellshoxxx/GhostPay/actions/runs/44342340082/job/134935409285)
failed; artifact ID is `14462654594`. Requested and checked-out commits match.
The runner exited 1. All five per-contract reports report successful analyzer
execution; the gate fails on the findings, not a missing or truncated report.

The original [artifact ZIP](mythril-198aa5ba/mythril-198aa5ba.zip),
[metadata](mythril-198aa5ba/metadata.json) and
[report](mythril-198aa5ba/report.log) are retained. Both ZIP members match their
standalone copies exactly. The complete report contains 283,168 bytes, SHA-256
`ce72f158a9d7d3bff3f6a2dafa2fde390cafcb5cf79364d4980f0c7cb3a6de00`.
The ZIP SHA-256 is
`5db3cf9ffd6feaf74b1e7c50ca96f97591d0731a9ba975614ffcaa7b7474dff3`.

The hosted configuration was Mythril 0.24.8, solc 0.8.28, three transactions,
900 seconds per contract, optimizer 200 and Cancun. The
[per-finding disposition record](mythril-198aa5ba/mythril-198aa5ba-dispositions.json)
keys each finding by contract, SWC and program counter. It retains exact current
issue/trace hashes, report byte offsets, source-map slices and source hashes,
decoded constructor inputs, prior test references, concrete replay evidence and
explicit unapproved owner decisions.

| Current finding group | Keys | Interpretation retained in the record |
|---|---|---|
| Signed expiry checks | Sweep SWC-116 PC-785; PolicyAccount SWC-116 PC-1876 and PC-5077 | Intended submission deadlines; timelocks still start on acceptance. Network reaction and cancellation assumptions require an owner decision. |
| Modeled clone assertion | Clone `0x72c68108a82e82617b93d1be0d7975d762035015`, SWC-110 PC-30 | Concrete clone opcode and symbolic implementation constraints are recorded; the supplied factory constructor has no-code implementation `0x1`. |
| Factory reentrancy and state writes | SWC-107 PC-999, PC-1170, PC-2887 and PC-2978 | Guarded initialization/CREATE2/token-call ordering and atomic rollback are traced. PC-1170 is guard release, not an independent unguarded state write. |
| Factory external-call availability | SWC-113 PC-1668 and PC-1781 | Fee-token view/wrong-delta behavior can freeze fee-charging deployments and prefunded counterfactual accounts. Deployment acknowledgment does not remove that risk. |
| Factory return handling | SWC-104 PC-2978 | SafeERC20 return checking and the deliberate clean-failure fee waiver are retained; sender-hook and gas-related fee-waiver revenue risks remain. |

The earlier `dfc75ef2` report also contained eleven findings, but the sets differ:
this report has Factory SWC-113 PC-1781 and lacks the earlier Factory SWC-113
PC-999 finding. Equal counts are not proof of finding or trace identity. The
current record preserves its own inputs and hashes instead of treating the
historical review as a current pass.

### Concrete replay and existing test limits

The [fresh replay result](mythril-198aa5ba/mythril-current-concrete-replay.json)
and [original harness](mythril-198aa5ba/replay-current-mythril.py) use the exact
current report's creation bytecode and calldata on disposable Anvil 1.8.5
(`51a52c59cffd940f76eddd0b4bb1791aa4b5ac7f`). The expiry-call timestamp was zero.
Actors were funded and impersonated; the analyzer's initial actor storage and
balances were not injected. This was not a fresh symbolic campaign, a complete
state replay, a production-chain run or a proof over arbitrary inputs. Anvil's
default hardfork was not explicitly pinned to the analyzer's Cancun setting.

The current Sweep, withdrawal and destination inputs respectively refuse with
`InvalidAmount`, `ZeroAmount` and `InvalidDestination`. All eight current factory
creation inputs refuse with `ImplementationHasNoCode`. These constrained results
do not establish that fee-token availability or revenue risks are unreachable.

The original [native snapshot log](mythril-198aa5ba/policy-gas.log) contains 445
passing non-fuzz tests, including 9 expiry Sweep, 19 expiry PolicyAccount and 32
Factory disposition cases. The command was
`forge snapshot --offline --check --no-match-test 'testFuzz|invariant'` with
Forge 1.8.5 and solc 0.8.28. Fuzz and invariant tests were excluded by that
existing snapshot command. The separate
[full Forge compilation](mythril-198aa5ba/policy-forge-all.log) was killed by
SIGKILL, so full Forge qualification is not claimed.

### Decisions still open

The observational record requires repository/security-owner approval for any
finding-specific, source/bytecode/tool-bound gate disposition. It grants none.
Fee-token freeze handling, token sender-hook suitability, production reaction
windows and any protocol/type-hash changes remain explicit owner decisions.
There is no SWC-wide suppression, count-based acceptance, ignore-failures change
or production-deployment approval in this packet.

## Verify the archive

From this directory, run `python3 verify-archive.py`. The verifier checks every
raw file's SHA-256 and size, the G1 handoff's original evidence hashes, and the
hosted ZIP/report/metadata parity. The manifest covers the 36 original files;
this README, the manifest and the verifier are newly authored archive metadata.

Raw whitespace, trailing blank lines, empty success logs and the original failed
test output are deliberately unchanged. Raw logs and patches may therefore fail
formatting-only whitespace checks. They are explicitly tracked despite general
log/archive ignore rules. Original absolute workspace paths inside preserved
handoffs, records and scripts are historical execution references; this manifest
maps the originals to their repository archive paths. The original generator and
replay harness have not been rewritten or rerun to make their paths portable.
