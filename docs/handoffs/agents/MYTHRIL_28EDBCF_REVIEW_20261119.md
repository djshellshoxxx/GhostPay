# Fresh #246 Mythril evidence review — 2026-11-19

## Outcome

The hosted Mythril job for
`28edbcf55093a6d6056232fd59ef37a2ae832b9a` **failed with exit 1** and eleven
findings: three Medium and eight Low. All eleven contract/SWC/PC keys match the
preserved `198aa5ba` report, and their observations outside the transaction
sequences are identical. The three expiry issues and their full traces match
exactly. **All eight Factory transaction sequences changed**, with 45 changed
primitive fields confined to their steps. This is not a timing-only rerun.

No disposition is approved, no finding is suppressed, and the strict release
blocker remains. This packet records source review and evidence identity, not a
gate allowlist or production authorization.

The [machine-readable comparison and dispositions](evidence/mythril-28edbcf-20261119/comparison-and-dispositions.json)
retain every finding by its exact key, before/after issue and trace hashes,
current source-map slices, constructor and deploy arguments, changed fields,
historical test references, source constraints and outstanding owner decisions.
The [comparison script](evidence/mythril-28edbcf-20261119/compare-reports.py)
recomputes those identities and checks the archived bytes without running an
analyzer, RPC, native test or concrete replay.

## Hosted evidence and preservation

| Item | Exact identity |
|---|---|
| Source requested and checked out | `28edbcf55093a6d6056232fd59ef37a2ae832b9a` |
| Hosted run / job | [44472897672 / 135386401249](https://github.com/djshellshoxxx/GhostPay/actions/runs/44472897672/job/135386401249) |
| Artifact | `14508101082` |
| ZIP | 17,059 bytes; SHA-256 `d3d29c449003c05e6a9c1b87548aeff837e93cd49ae2af44c580898eeab9a7f0` |
| Full report | 283,170 bytes; SHA-256 `84f4f5846b68054fac52dc4968da78996d520c03c4049318ddc62ba4424b642e` |
| Retention | Complete report retained; metadata says `truncated: false` |
| Previous source | `198aa5baff22272453733a0f3dcfcac0e0994eec` |
| Previous report | 283,168 bytes; SHA-256 `ce72f158a9d7d3bff3f6a2dafa2fde390cafcb5cf79364d4980f0c7cb3a6de00` |
| Previous evidence commit | `5fadb4ff709701bff2a5f08fac548d24c2de42ad` |

The new [raw manifest](evidence/mythril-28edbcf-20261119/raw-manifest.json)
binds the original ZIP, report, metadata, hosted job log and artifact-list JSON
to byte lengths and SHA-256 hashes. Both ZIP members match their retained
standalone files. Raw log bytes are preserved, including their original
whitespace. The old packet is read from its exact evidence commit rather than
a mutable scratch path. It remains under
`docs/handoffs/agents/evidence/security-recovery-20261119/mythril-198aa5ba/` in that
commit.

The two clean router report objects, one SweepRelayer report and two-issue
PolicyAccount report are identical to the previous report objects. Target
counts remain Router 0, SweepRelayer 1, PolicyRouter 0, PolicyAccount 2, Factory 8.
Each JSON object says `success: true` and `error: null`; that establishes what
the analyzer reported, not that every symbolic path completed successfully.

## Source and trace identity

The following Git objects are byte-identical between the two analyzed sources:

| Source | Identical object |
|---|---|
| `packages/contracts/src` tree | `dabfd36a98424a4184ee7e267e12815763d1157f` |
| `packages/contracts/lib` tree | `b10191d543360a5c102e269cca72883b4303d8c7` |
| `run-mythril.sh` | `7ad37efb96f6b5e1f54ffbdfc8a644ef3b03ab4e` |
| `mythril-compat.py` | `bd78f6b0cecc1f9b43c2a933a44981d38e403521` |
| Contract-analysis workflow | `ab4b881de3f586869d1efbaec32799d9082193fd` |
| Foundry configuration | `59bf7337ea5fe8526869f22e9595e022027b4712` |

The referenced expiry and Factory test files also match. Every supplied
creation-code prefix matches the corresponding previous trace. The eight
Factory prefixes are 3,807 bytes with SHA-256
`5a6bfffabbad4f62ed3fd56737e65f43535766f8699cc02cc61460758ded3727`.
Source-map byte slices match the current source for all records that provide a
filename and code. The clone-address SWC-110 record provides neither a filename
nor a line; the packet preserves that limitation.

All current Factory constructor inputs still set the implementation to
`0x0000000000000000000000000000000000000001`. The preceding nonzero-address
checks permit the supplied constructor fields, then the source requires
`implementation_.code.length != 0`. On an EVM with no deployed code at address
`0x1`, creation therefore reverts with `ImplementationHasNoCode()` before the
later modeled steps. That conclusion is **source inference for the changed
inputs**, conditional on the stated EVM code state. The old default-Anvil
Factory replays used different constructor inputs and are not relabeled as new
execution.

Two trace-specific corrections matter:

- **SWC-113 / PC 1781 (R8):** the previous report contained identical deploy
  inputs. The current report contains different owners, destinations, delays
  and limits roots. Their delays are 2,097,152 and 1,048,576 seconds; both calls
  originate from the modeled `0xdeadbeef...deadbeef` address. The previous
  identical-call `AlreadyDeployed` argument does not apply. The machine record
  independently decodes both full calls and explicitly withdraws that argument.
- **SWC-104 / PC 2978 (R11):** the current calls use different destinations but
  the same modeled `0xdeadbeef...deadbeef` caller. The previous first caller was
  `0xaaaa...aaaa`. The existing two-caller test remains related historical
  counterevidence; it is not an exact replay of the current sequence.

The current R5 and R9 traces match each other exactly, while both differ from
their respective older traces. Current and previous `initialState` objects
match for all eleven findings; the recorded differences are in transaction
steps, including constructor values, callers and decoded deploy arguments.

## Per-finding assessment

Every row remains unapproved for release. Labels identify related historical
locations, not interchangeable transaction sequences.

| Finding key | Label | Assessment and remaining boundary |
|---|---|---|
| `GhostPaySweepRelayer / SWC-116 / PC 785` | EXP-1 | Signed sweep deadline is intentional. Exact issue/trace matches the earlier replay that returned `InvalidAmount()` at timestamp zero. Timestamp/inclusion assumptions remain; no unauthorized transfer is shown. |
| `PolicyAccount / SWC-116 / PC 1876` | EXP-2 | Deadline bounds signed request submission, then the full withdrawal delay starts. Exact earlier replay returned `ZeroAmount()`. The raw model uses the self-locked implementation; separate historical tests exercise valid clones. Chain-specific reaction/censorship assumptions remain open. |
| `PolicyAccount / SWC-116 / PC 5077` | EXP-3 | Deadline bounds signed destination-proposal submission; activation remains delayed. Exact earlier replay returned `InvalidDestination()`. Minimum reaction/cancellation guarantees are not established by that trace. |
| `0x72c68108a82e82617b93d1be0d7975d762035015 / SWC-110 / PC 30` | R4 | Modeled clone exception is constrained by constructor/code state; historical exact-runtime tests identify GAS at PC 30 and DELEGATECALL at PC 31. No universal SWC-110 dismissal or new concrete panic result. |
| `PolicyAccountFactory / SWC-107 / PC 999` | R5 | Fee-token call precedes initialization, under `nonReentrant`, with fixed implementation and creator-bound initialization. Existing callback/rollback tests support those conditions. Current raw creation is source-constrained. |
| `PolicyAccountFactory / SWC-107 / PC 1170` | R6 | Historical bytecode and tests identify guard release after initialization, despite the optimizer mapping to the ENTERED line. No demonstrated unguarded reentry window; guard ordering must remain. |
| `PolicyAccountFactory / SWC-113 / PC 1668` | R7 | **Real conditional fee-token availability risk:** reverting views or successful wrong-delta transfers can prevent deployment and freeze prefunded counterfactual assets. Infeasible raw creation does not remove N1. |
| `PolicyAccountFactory / SWC-113 / PC 1781` | R8 | **Real conditional allowance-read availability risk.** The current distinct-call sequence has no inherited duplicate-deploy argument. Constructor source constraint and genuine first-deployment token dependency are separate facts. |
| `PolicyAccountFactory / SWC-107 / PC 2887` | R9 | CREATE2 follows the fee call under the guard; salt, implementation and initialization bind account identity. Same current trace as R5. No demonstrated owner/policy substitution; token availability remains separate. |
| `PolicyAccountFactory / SWC-107 / PC 2978` | R10 | Call target is constructor-selected immutable `FEE_TOKEN`, not per-deploy owner/destination. Malicious, upgradeable or hook-bearing configured tokens remain a deployment-policy risk. |
| `PolicyAccountFactory / SWC-104 / PC 2978` | R11 | Return status is consumed by SafeERC20 and the factory; a clean failure can intentionally waive the fee after exact before/after checks. Sender hooks and pathological gas costs can cause conditional fee-revenue loss. Current sequence uses one caller, not the historical two-caller fixture. |

The JSON retains the exact test names and hashes behind each assessment. The
earlier 445-test non-fuzz snapshot passed, including 9 Sweep expiry, 19 policy
expiry and 32 Factory disposition tests. Its full compilation attempt was
SIGKILLed. Those are historical receipts, not a new test run or full-suite pass
at `28edbcf`. The three byte-identical expiry inputs preserve the relevance of
their previous replay results under its recorded timestamp-zero/default-Anvil
assumptions; the complete symbolic initial state was not injected there.

## Decisions that remain open

The machine record preserves the exact owner-decision IDs and source references:

- **MYTHRIL-DISPOSITION-POLICY:** repository/security owner approval of a
  finding-specific, source/bytecode/tool-bound disposition mechanism is absent.
  Otherwise the strict gate remains red. A candidate checker or equal finding
  count does not grant approval.
- **N1-FEE-TOKEN-FREEZE:** the scheme-2 deployment/protocol owner must choose
  suitable token/zero-fee deployment policy or approve a separately specified
  protocol change. Acknowledgement does not remove the freeze. A replacement
  factory cannot rescue the original factory's counterfactual CREATE2 address.
- **OD11-TIMELOCK-BOUND:** the policy product/protocol owner must establish
  per-network timestamp, censorship and cancellation-inclusion assumptions
  before accepting the existing one-hour/two-hour minima for production. No
  numerical floor or authority changes are made here.
- **FEE-TOKEN-SENDER-HOOKS:** token suitability, upgrade controls and waiver
  revenue assumptions remain operational decisions. The deployment script
  cannot prove that sender-controlled hooks are absent.

The separately owned #255 source adds stronger campaign evidence and
configuration-bound freeze acknowledgement. Its source comparison is retained
in `SECURITY_CROSS_REVIEW_20261119.md` at evidence commit
`51836d594700e362d033ecb7d1b481d0c9473f8b`. This old-runner report lacks those new
per-target process/compiler sidecars and is not promoted to a qualified #255
campaign. No #255 source or approval policy was modified by this review.

## Reproduction and limits

In a clone retaining both analyzed sources and the pinned old evidence commit:

```sh
python3 docs/handoffs/agents/evidence/mythril-28edbcf-20261119/compare-reports.py --check
```

The script rejects duplicate JSON keys, validates raw file hashes and ZIP
parity, compares exact Git objects, matches findings by contract/SWC/PC, checks
all referenced test declarations and source slices, independently decodes the
current ABI words, and verifies that the committed machine record reproduces
byte-for-byte. It neither executes tests nor changes analyzer policy.

This review does not qualify production chains, arbitrary fee tokens, fuzz or
invariant campaigns, full repository gates, deployment safety or the absence
of other vulnerabilities. The two clean router reports are observations of
this campaign, not a comprehensive external audit.
