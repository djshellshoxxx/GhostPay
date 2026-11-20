# Hosted Mythril disposition comparison — 2026-11-18

**The new report has 11 findings, but it is not the historical 11-record set. Ten documented location tuples match; one new tuple is present and historical R8 is absent.**

Actual hosted source: `dfc75ef2087fa6463ae59e0818abec01796c578d`. Run/job: [44297673763 / 134778851902](https://github.com/djshellshoxxx/GhostPay/actions/runs/44297673763/job/134778851902); artifact `14437897350`. All five reports have `success=true`, `error=null`. The untruncated report has 283205 bytes and SHA-256 `40e9faf6e54b4e5f1e683cb07d6522eea55f5bff50fcf46eeb5395d615c932f7`; independently checked against its metadata. Overall metadata says analysis failure, runner exit 1.

| Current contract | SWC | PC | Severity | Historical location match |
|---|---:|---:|---|---|
| GhostPaySweepRelayer | 116 | 785 | Low | EXP-1 |
| PolicyAccount | 116 | 1876 | Low | EXP-2 |
| PolicyAccount | 116 | 5077 | Low | EXP-3 |
| 0x72c68108a82e82617b93d1be0d7975d762035015 | 110 | 30 | Low | R4 |
| PolicyAccountFactory | 113 | 999 | Low | NEW — explicit review required |
| PolicyAccountFactory | 107 | 999 | Medium | R5 |
| PolicyAccountFactory | 107 | 1170 | Low | R6 |
| PolicyAccountFactory | 113 | 1668 | Low | R7 |
| PolicyAccountFactory | 107 | 2887 | Medium | R9 |
| PolicyAccountFactory | 107 | 2978 | Low | R10 |
| PolicyAccountFactory | 104 | 2978 | Medium | R11 |

## New and absent records

The new Low SWC-113 record is `PolicyAccountFactory.deploy(address,address,uint256,bytes32)`, PC999, `src/PolicyAccountFactory.sol:117`, sourceMap `6237:81:26::1`, at the `initialize` call. Its title is “Multiple Calls in a Single Transaction.” Historical R5 is a different detector/severity tuple at the same PC: Medium SWC-107. It is not a substitute disposition for this new record. The historical review describes the call order, immutable fee token, atomic failure behavior and trusted clone initialization, which are relevant evidence for a later explicit review; no fresh new-record replay or final exploitability verdict was made here.

Historical R8 is Low SWC-113 at PC1781, `allowance` on line132. It is absent in this report. The existing reevaluation already documents its intermittent presence on unchanged inputs. Absence does not establish a fix. Matching the total count, contract or PC alone would silently miss this replacement.

Compared sources: `docs/audits/mythril-14290880802-factory-dispositions.md`, `mythril-14290880802-expiry-dispositions.md` and `mythril-reevaluation-20261118.md`. These remain historical evidence. The ten matches are documented location tuples, not proof that all new solver transaction sequences or bytecode hashes equal the old ones.

## Gate and open decisions

The current strict runner rejects any finding and returned 1. The standalone disposition helper remains unwired; no approval reference, suppression, gate integration or scanner rerun was performed. The new record needs an explicit evidence-based disposition before claiming complete triage. Existing scheme-2 fee-token freeze/waiver residuals and policy/trust decisions remain; no source mutation or gate weakening is justified by matching ten tuples.

The relevant contract source/library, foundry/remapping/compiler settings, Mythril runner and workflow are unchanged from hosted main to local e8 and published9bad. That supports source applicability, not a new candidate-hosted execution or complete symbolic coverage.

## Current-trace counterevidence addendum

A later independent read-only comparison confirms that all eight current Factory-analysis constructor inputs select implementation address(1), rejected by the real constructor's code-length check on the ordinary EVM precompile model. The 3,296-byte metadata-free runtime template matches the existing pinned Foundry artifact. The new SWC-113 PC999 record repeats identical deploy calldata; the `AlreadyDeployed` contradiction applies after a successful first call, not from calldata equality alone. See section 7 of `FINAL_EVIDENCE_REVIEW_20261118.md` and `INDEPENDENT_MYTHRIL_TRACE_COUNTEREVIDENCE_20261118.json` for exact hashes, boundaries and retained N1 fee-token availability risk. The new identity remains distinct, and the strict analyzer gate remains failed.
