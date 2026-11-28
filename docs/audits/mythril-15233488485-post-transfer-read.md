# Factory fee accounting after a token reports failure

The November 27 review disposition for the additional Low SWC-113 record is **intended fail-closed accounting, with an availability dependency on the configured fee token**. Mythril returned exit 1. The strict analysis gate remains red. The finding provides no authorization to deploy scheme 2 or waive a release gate.

## Evidence identity

| Evidence | Value |
|---|---|
| Current workflow, job, artifact | [46068598296 / 140739836271](https://github.com/djshellshoxxx/GhostPay/actions/runs/46068598296/job/140739836271), [15233488485](https://github.com/djshellshoxxx/GhostPay/actions/runs/46068598296/artifacts/15233488485) |
| Requested and checked-out commit | `fd5e591151765b2dafe6345501ca40393e0f176a` |
| Artifact ZIP SHA-256 | `0692328b692595fc5cad2f5efa4045024aa819a0fdf852b210ffd3f8fd4ae865` |
| Full retained report SHA-256 (312,093 bytes) | `305843a9291688be313264ccc64dfb9410fa07e32827853d15ca42faf5e0c985` |
| Historical workflow and artifact | [43981233671 / 14290880802](https://github.com/djshellshoxxx/GhostPay/actions/runs/43981233671/artifacts/14290880802) |
| Historical ZIP and full report SHA-256 | `e78964b7717fb059b18536fdb53a3487c44d63cb4c4d6e27006619c951b5162e`, `f5a03aea77cff52a996e67202893f6dd51f8b85bce2f9ad8e41a05ebc7f158f8` |
| Contract tree, analyzed commit and audited main `b890a766` | `420b0e13c296d133004da063ec9b702510dfc2a2` |
| Factory source at both commits and historical `beb525dd` | Git blob `d456eec25c744e1e992ca786b2f21eefdbdf81a7` |

The two ZIP digests matched GitHub artifact metadata. Both report digests were recomputed over the complete extracted logs. There were five structured analyzer outputs in each report. The comparison used finding identity and multiplicity, including contract, function, SWC, severity, program counter, source location and title.

| Contract | Current records (instruction addresses) | Disposition |
|---|---|---|
| GhostPayRouter, GhostPayPolicyRouter | 0 each | Both reported zero in each run |
| GhostPaySweepRelayer | 785 | Historical [expiry review](mythril-14290880802-expiry-dispositions.md) |
| PolicyAccount | 1876, 5077 | Historical expiry review |
| PolicyAccountFactory analysis | 30, 999, 1170, 1668, 1781, 2887, 2978 (two distinct records, SWC-107 and SWC-104) | Historical [factory records R4–R11](mythril-14290880802-factory-dispositions.md) |
| PolicyAccountFactory.deploy | 2272, source line 154, Low SWC-113 | Additional post-transfer payer balance read |

All eleven historical records matched individually. The additional record brings the total to nine Low and three Medium.

## Local correctness and residual risk

After the fee token reports transfer failure, the factory checks the payer balance, recipient balance and allowance against their snapshots. If any value changed or the payer balance cannot be read, execution reverts before clone creation. A fee waiver requires readable, unchanged balances and allowance, with adequate original funds and approval. A configured token with persistent read failures can prevent deployment through that factory indefinitely. This conclusion concerns the observed accounting branch and does not establish general availability of arbitrary fee tokens.

The local test in [MythrilFactoryPostFeeRead.t.sol](../../packages/contracts/test/MythrilFactoryPostFeeRead.t.sol) uses a disposable token with a controlled post-transfer read outage. Two attempts produced the specific read error, left the predicted address without code, and preserved both balances and allowance. Restoring service let the same predicted account deploy, charging exactly one fee. The historical unit and bounded fuzz controls also exercised fee waivers and both insufficient-funds and insufficient-allowance paths.

From `packages/contracts`, `forge test --offline --threads 1 --fuzz-runs 32 --match-contract '^(Mythril.*Test|PolicyAccountFactoryTest)$'` passed 97 tests across five suites with local solc 0.8.28. A second engineering worker independently compared both complete reports, checked the contract tree, traced the source branch and reviewed the new test assertions. The integration coordinator ran the tests. This is an independent engineering review, with external release approvals still open.
