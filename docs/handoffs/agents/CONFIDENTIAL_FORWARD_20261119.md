# Confidential-router return-data defense — 2026-11-19 UTC

## Requirement and provenance

Recover the existing A-3 security remediation from
[PR #220](https://github.com/djshellshoxxx/GhostPay/pull/220), source commit
`cd54452991b9f4e193d98c1365b9dbc4eb838f3b`, onto candidate
`198aa5baff22272453733a0f3dcfcac0e0994eec` (PR #238). The isolated branch is
`chatgpt/ghostpay-confidential-forward-20261119`.

Only the three confidential-contract paths were recovered. They are byte-for-byte
identical to the historical implementation and regression at `cd544529`:

| Path under `packages/confidential-contracts/` | Git blob |
|---|---|
| `contracts/GhostPayConfidentialRouter.sol` | `ad92a40d46fa130f80a7d355aa5ee147a2823512` |
| `contracts/mocks/ReturnBombStealth.sol` | `6f5a0663505db2cadefdd1c57cc48b0c9cbd8586` |
| `test/router.test.ts` | `05c3cd83dd9fe2691ee2aad0e72afc55502f6c89` |

The original commit's separate A-1/A-2 signature-design documentation was not
included. No dependency, compiler configuration, test budget, fee or custody
policy, core contract, analyzer gate, deployment configuration or release policy
changed. The original PR and its branch remain unchanged.

## Cause and fix

The confidential router's native-buffer transfer used Solidity's low-level
`stealth.call`, which copied return data into the caller's memory. A contract
receiver could return a large payload and impose extra caller-side gas cost.
The existing remediation forwards the same value to the same validated target
with a memory-safe EVM `CALL` having zero output length. Success is still checked,
failure still raises `NativeTransferFailed`, and the existing reentrancy guard
and buffer/target checks remain intact.

The regression receiver expands the same memory for both calls, then returns
either zero or 256 KiB. This separates caller-side return-copy cost from the
receiver's memory expansion. The test also verifies that both native transfers
reach the receiver. The change does not cap the gas forwarded to a receiver or
claim to eliminate every form of receiver-side gas consumption.

## Failing-first evidence

The historical mock and regression were applied before changing the router.
On the unchanged candidate router, the regression failed: the large response
added **116,145 gas**, exceeding the unchanged `< 20,000` assertion. Applying the
historical no-copy call made that same test pass.

- RED log SHA-256: `36d274af6f6e8a5d5c20505fff48d37ebbeb1608bf43e80f4c81fbe2046adafb`.
- GREEN log SHA-256: `3c02eabd542a1b05f24d086b4c31e62f9ac88e04c65da2bc90a8739f9d93052e`.

## Actual validation and limits

Versions: Node `24.22.3`, Hardhat `2.29.2`, solc
`0.8.28+commit.7893614a.Linux.g++`, Forge/Anvil `1.8.5`.
The native compiler SHA-256 is
`9a0fb7e0db2c0641dbae1c5cc645dc686820c83af516226abb1c0a2f76636f25`, matching
the repository's checksum. Existing installed dependencies were reused read-only;
no package installation or lockfile change was made.

The package's documented `GHOSTPAY_SOLC_PATH` hook selected that compiler.
Commands were invoked through `node ../../node_modules/hardhat/internal/cli/cli.js`
from the package directory, which executes the existing `hardhat test` target.
Public-network configuration was unset for these local tests.

| Check | Observed result |
|---|---|
| `hardhat test --grep 'does not copy'` with historical test, original router | 0 passed / 1 failed: 116,145 gas exceeds 20,000 |
| Same test with no-copy router | 1 passed / 0 failed |
| `tsc -p tsconfig.json --noEmit` | Passed |
| `forge fmt --check contracts` | Passed |
| `git diff --check`; `bash scripts/scan-secrets.sh` | Passed |
| Full `hardhat test`, original budgets and available Anvil | Exited 137; nine chain guards and the 11-boundary-value case passed before termination during the 1,000-payment fuzz case |
| Full `hardhat test`, same budgets, Node old-space limit 768 MiB | Exited 137; nine chain guards passed, no fuzz/invariant case completed in this retry |
| `hardhat test test/router.test.ts --grep 'ETH\|BufferTooLarge\|NativeTransferFailed\|InvalidStealth'`, 768 MiB, shared `flock` | Exited 137 after two passes (normal ETH forward and buffer cap); the seven-case selection did not complete |

Both full attempts retained seed 1337, 1,000 randomized payments and four
40-step invariant sequences. No assertion was removed and no budget reduced.
The runtime reported a default heap limit of 2,240 MiB and approximately 2,349 MiB
available memory, but this observation does not prove why either process was
killed. The constrained retry did not establish a full pass; no third full stress
attempt was made. The exact final candidate still needs full hosted qualification.

The successful chain guards refused 1, 10, 137, 8453, 42161, 84532 and 11155420,
and allowed 31337 and 11155111 using throw-away local Anvil instances. These are
local constructor tests, not public-chain deployments. fhEVM runtime tests use the
existing plaintext mock and do not qualify live ciphertext, KMS or gateway behavior.

The final seven-case attempt was serialized with
`flock /workspace/scratch/6eafdb04d91b/qualification.lock`; it still did not
complete. Its partial passes are not a pass for the selection. No further local
FHE retry was made after that result. Source/test recovery and the single
regression are verified; whole-package qualification remains blocked locally.

Independent coordinator source review passed: the call retains the same
payer-selected validated address and value, copies no return data, and preserves
`nonReentrant` and `NativeTransferFailed`. The reviewer checked that the mock
equalizes recipient memory expansion and that the regression verifies both
native delivery and the caller's return-copy gas bound. No ABI, custody or
unrelated policy change was found.

The coordinator owns consolidation and remote publication. No main merge,
deployment, release or strict Mythril pass is claimed by this handoff.
