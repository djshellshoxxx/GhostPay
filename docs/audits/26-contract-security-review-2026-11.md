# Audit 26: smart-contract security review (2026-11)

**This is an AI-assisted review. It is not a professional or independent audit.** It should not be used as a
deployment certification or to decide whether real funds are safe. It found no Critical or High issue. Absence
of findings in a source review is not evidence that none exist.

- **Review date:** 2026-11-11
- **Base commit:** `fc57154` (`fix(deps): resolve invalid nested abitype/zod peer ...`), local branch `extra/04-contracts`
- **Test commit:** `c6e4780` (adds `packages/contracts/test/audit/Review24.audit.t.sol`, no source change); the CORE-02 test was renamed in the commit that adds this report
- **Source changes in this review:** none. No finding met the Medium+ bar for a contained in-repo fix (see AUD24-01 for why the one Medium is not fixed here).

## 1. Scope

Primary, read line by line:

- `packages/contracts/src/GhostPayRouter.sol`, `GhostPayPolicyRouter.sol`, `GhostPaySweepRelayer.sol`, `PolicyAccount.sol`, `PolicyAccountFactory.sol`, and every file in `src/interfaces/`
- `packages/contracts/script/` (`DeployBase`, `Deploy`, `DeployAnnouncer`, `DeployPolicy`, `DeployPolicyRouter`, `SmokeSepolia`, `devnet/DeployDevnet`)
- `deployments/31337.json`, `deployments/schema.json`, `deployments/README.md`
- Specs read for intended behaviour: `docs/CONTRACTS_SPEC.md`, `docs/FEE_SCHEDULE.md`, `packages/contracts/DEVIATIONS.md`
- Prior findings checked for closure: `docs/audits/02-security-review-contracts.md`, `docs/audits/05/contracts-core.md` (the contracts part of `05-full-audit.md`), `09-security-delta-review.md`, `17-final-security-snapshot.md`, and `docs/remote/round-audits/contracts.md` (C-01..C-10). Commit `50881e4` was used for round-3 N-01..N-05.

Secondary (partial):

- `packages/payer-hiding-contracts/src/GhostPayPayRelay.sol` and `RouterCall.sol`. Both were read, but the rest of that package was not reviewed.
- `packages/pool-contracts` was **not reviewed**.

## 2. Method and tooling (what actually ran)

Foundry is not installed here, and binary downloads (`binaries.soliditylang.org`, Foundry releases) are blocked by the proxy. The following ran instead. All of it ran from the scratchpad, with nothing installed into the repo:

| Tool | What ran | Result |
|---|---|---|
| Manual review | Every line in the primary scope. Properties checked: reentrancy, fee math and rounding, exact-delta token handling, permit try/catch griefing, EIP-712 domain/typehash/field order, nonce bitmaps, CREATE2 initializer authentication, two-bucket window math, native-call return-data handling, EIP-5564 metadata layout, script fail-closed paths | Findings below |
| `solc` 0.8.28 | The npm `solc@0.8.28` (solcjs, `0.8.28+commit.7893614a.Emscripten.clang`), run with foundry.toml settings (optimizer 200, cancun, `bytecodeHash none`, no CBOR) | `src`, `test` (without `echidna`) and `script` type-check with 0 errors |
| Bytecode reproduction | Compiled with solcjs, filled the immutables with the `deployments/31337.json` values, then took keccak of the runtime code | Router `0xf468…243c` and relayer `0xee3d…669b` both **match** the manifest's `bytecodeHashes`. So the devnet manifest matches current source, and solcjs gives the same bytecode as the native build that produced it |
| Slither 0.11.6 | Installed from PyPI, using a small `solc` CLI shim over solcjs (`--combined-json`). Each of the five contracts was run separately, with `lib/` filtered out | Only `timestamp`, `assembly` and `naming-convention` results came back (informational, by design, already triaged in audit 00). **No** medium or high detector fired |
| Hardhat 3.21.2 Solidity tests (EDR) | The repo's own Foundry-style tests ran unchanged through Hardhat's forge-std-compatible runner, with the solcjs compiler, one file at a time. Fuzz runs were reduced to 64 and invariants to 32 runs × depth 25 | **420 passing, 6 failing**. All 6 failures are harness gaps: `startBroadcast()` is unsupported (5 deploy-script tests) and `getChainId()` is unsupported (`Sweep.audit.t.sol::test_crossRelayerAndCrossChainReplayRejected`). New audit file: **4/4 passing** |

**Not run:** `forge test`, `forge fmt --check`, `forge snapshot --check`, `forge coverage`, the default-profile 10,000-run fuzz and 256×50 invariants, Echidna, Mythril and mutation testing. EDR is not forge. Gas numbers and some cheatcode semantics can differ, so hosted CI must confirm.

## 3. Findings

| ID | Severity | File:line | Description | Exploit scenario | Status | Test | Fix commit |
|---|---|---|---|---|---|---|---|
| AUD24-01 | **Medium** (privacy; regression of a closed finding) | `src/GhostPayPolicyRouter.sol:93-178` (every entry point takes `PolicyRef`), `:236-242`; `src/interfaces/IGhostPayPolicyRouter.sol:18-21` | Round-3 **N-01** was fixed in `50881e4`: the router took only the per-payment CREATE2 `salt`, so the seller-constant `policyHash` never appeared in calldata. Consolidation `cfe7b32` brought back the pre-fix router, which takes `PolicyRef{owner, policyHash}`. DEVIATIONS R10–R13 and the regression test `test_policy_calldataDoesNotLinkPaymentsToSeller` were dropped with it. Audit 05 (PRIVACY-E2E-05) noticed the leak as "carried, still open" but did not identify it as a regression | Any chain observer groups every policy-router payment by calldata word 3 (`policyHash`). That links all one-time accounts of a scheme-2 seller at payment time, before any account is deployed or withdrawn from. With `limitsRoot == 0` the destination can also be brute-forced over the 1 h..30 d delay range | **Open, not fixed here.** The fix (restore the `50881e4` salt ABI) is a public ABI change. It also needs `packages/policy-scheme` (ABI, builder, decoder, tests) and `packages/payer-hiding-contracts/src/RouterCall.sol` (`SELECTOR_POLICY`, gross word index) updated in lockstep. That needs an owner decision and coordination, so it is beyond a minimal in-scope change. Scheme 2 is undeployed | `test/audit/Review24.audit.t.sol::test_EXPLOIT_AUD24_01_policyHashLinksPaymentsInCalldata` | — |
| AUD24-02 | Low (F-SECURE revenue only) | `src/PolicyAccountFactory.sol:113-114, 128-164` | The M-03 fee waiver treats any clean transfer failure as "the token refused a payer who can pay". When `FEE_TOKEN` calls a hook on the sender (ERC-777 `tokensToSend` style), the caller controls that failure | A contract holds enough balance, has approved the factory, and vetoes its own debit in the hook. `deploy` then emits `FeeWaived` and creates the account fee-free. Control: the same caller without the veto pays | Open (documented). No in-contract fix distinguishes this from a real issuer refusal. Operational rule: `FEE_TOKEN` must not have sender hooks. `DeployPolicy` cannot detect this | `Review24.audit.t.sol::test_EXPLOIT_AUD24_02_senderHookFeeTokenLetsCallerWaiveFee` | — |
| AUD24-03 | Info (docs) | `docs/developer/contracts-reference.md:238-246`, `docs/developer/byte-layouts.md:100`, `docs/developer/api/policy-scheme.md:153-157` | The developer docs still describe the salt-only ABI. They say "the seller-constant `policyHash` therefore never appears in router calldata". The code and `packages/policy-scheme` use `PolicyRef` | An integrator who follows the reference produces calldata that hits the reverting fallback (`NoDirectETH`). That is not a fund loss, but the privacy claim is false (AUD24-01) | Open | — | — |
| AUD24-04 | Info | `deployments/schema.json:27, 40-44, 86` | The schema is looser than the runtime validator (`packages/chain-adapters/src/deployments.ts`): `feeBps` allows 0..10000 instead of `const 25`, zero addresses pass the pattern, and `policyFlatFee` allows 78 digits (more than `uint256`). It also has no `policyRouter` address or codehash field, so the scheme-2 router address and caller pin cannot be distributed through a signed manifest | A manifest that passes the schema can still be refused by the clients. This is not exploitable, but schema validation alone gives false confidence | Open | — | — |
| AUD24-05 | Info | `script/SmokeSepolia.s.sol:273-274`; `script/Deploy.s.sol:134-140`; `script/DeployPolicyRouter.s.sol:202-207, 222-227` | The smoke check only asserts that the relayer `DOMAIN_SEPARATOR` is non-zero. It could recompute the expected separator from chain id and address. Announcer and factory codehash pins remain optional on every chain id, including explicitly allowed mainnets (overlaps C-09 and CONTRACTS-CORE-04) | An operator who sets `ANNOUNCER` with `ALLOW_CUSTOM_ANNOUNCER=1` and no pin deploys against unverified code | Open | — | — |
| AUD24-06 | Info | `script/DeployBase.s.sol:55-62` | `ALLOWED_CHAIN_IDS=31337` admits anvil/forks without `ALLOW_LOCAL=1`, which bypasses the stated opt-in | This needs operator misconfiguration | Open | — | — |
| AUD24-07 | Info (secondary scope) | `packages/payer-hiding-contracts/src/RouterCall.sol:24` | `MIN_POLICY = 4 + 8 * 32` under-counts the 9-word head of `payERC20(address,address,(address,bytes32),...)` | Benign: `payloadHash` binds the full calldata and the router's ABI decoder rejects truncated input. It needs updating together with AUD24-01 | Open | — | — |

Two previous Lows now have committed PoCs. Audit 05's PoCs lived in a scratch worktree and were not in the tree:
`Review24.audit.t.sol::test_EXPLOIT_CORE01_policyBufferStrandedWithoutNativeLeaf` and `::test_EXPLOIT_CORE02_bufferMovesNativeValueFeeFree`. Both still reproduce on `fc57154`.

## 4. Verified closure of prior findings (against `fc57154`)

| Prior finding | Current state | Evidence in current code / tests |
|---|---|---|
| 02 M-01 immutable fee recipient SPOF | Open by design | `GhostPayRouter.sol:57,122,185`; `Router.audit.t.sol::test_EXPLOIT_feeRecipient*` still assert it |
| 02 M-02 router cannot announce scheme 2 | **Closed** | `GhostPayPolicyRouter.sol:46` `SCHEME_ID = 0x47500002`; announcements at `:105,:133,:157,:177` |
| 02 M-03 / C-04 fee-token failure freezes counterfactual accounts | **Closed** (residual AUD24-02) | Waiver at `PolicyAccountFactory.sol:113-164`; `Policy.audit.t.sol::test_feeTokenBlacklistDoesNotFreezeCounterfactualAccounts`, `PolicyAccountFactory.t.sol::test_deploy_gasStarvationCannotTriggerFeeWaiver` pass |
| 02 L-01 return-data bomb | **Closed** | Assembly `call(..., 0, 0, 0, 0)` at `GhostPayRouter.sol:245-247`, `GhostPayPolicyRouter.sol:293-295`, `PolicyAccount.sol:223-225`; bounded-gas tests pass |
| 02 L-02 unauthenticated announcement content | Open by design (client mitigation) | `_checkMetadata` binds marker/asset/net only; view tag and key prefix-only |
| 02 L-03 sweep fee dodge / hostile token gas | Open (service level) | `Sweep.audit.t.sol` EXPLOIT tests pass |
| 02 L-04 limit leaf not signed | **Closed** | `WITHDRAW_TYPEHASH` includes `limitLeafHash`; check at `PolicyAccount.sol:173-179` |
| 02 L-05 / C-05 no rescue, exact-delta lock-in | Accepted by design | `PolicyAccount.sol:229-237`; `Policy.audit.t.sol::test_EXPLOIT_lossyTokenPermanentlyStuck` |
| 02 L-06 (a)-(f) deploy-script gaps | **Mostly closed** | `DeployBase` allowlist and strict parsing, read-backs, `MAX_FLAT_FEE`, broadcaster check. Remaining: the router constructors still do not check announcer code (scripts do), pins are optional (AUD24-05), and AUD24-06 |
| 02 I-02 / A3 no minimum delay | **Closed** | `PolicyAccountFactory.sol:36,108` |
| C-02 pending withdrawals follow a later destination | **Closed** | `PolicyAccount.sol:194, 209-212` (`DestinationChangedSinceRequest`); `Policy.audit.t.sol::test_pendingWithdrawCannotFollowDestinationChange` |
| C-06 / CONTRACTS-CORE-03 fee token without code | Open | Constructor `PolicyAccountFactory.sol:84-88` checks only implementation code; `DeployPolicy.s.sol:61` mitigates off-chain |
| C-09 / CONTRACTS-CORE-04 scheme-2 smoke / mandatory pins | Open | `SmokeSepolia.s.sol` covers scheme 1 only; pins optional |
| C-10 sandbox solc path | **Closed** | `foundry.toml` pins `solc_version = "0.8.28"` |
| CONTRACTS-CORE-01 policy buffer stranded | Open (reproduced) | `GhostPayPolicyRouter.sol:161-178`; new PoC passes |
| CONTRACTS-CORE-02 buffer moves native value fee-free | Open (reproduced) | `GhostPayRouter.sol:132-147`; new PoC passes |
| Round-3 N-01 / C-01 / PRIVACY-E2E-05 policyHash in calldata | **Regressed** (was closed in `50881e4`) | AUD24-01 |
| Round-3 N-02..N-05 (documented info items) | Still true in code. The documentation was **lost**: DEVIATIONS R13 is gone from the current file | e.g. N-03 front-run deploy reverts `AlreadyDeployed` before the fee (`PolicyAccountFactory.sol:111`) |

## 5. Checked and found sound (this pass)

- **Fee math:** `fee = gross * 25 / 10_000` rounds down, `net = gross - fee > 0`, and gross above `max/25` panics. Fee and net are pulled directly from the payer, with exact deltas on the stealth address and the fee recipient. The router holds no balance.
- **Signatures:**
  - The relayer, `PolicyAccount` and PayRelay use distinct EIP-712 names. Each domain includes the chain id and its own address, so a clone gets its own `verifyingContract`. OZ rebuilds the separator when the chain id or `address(this)` differs from the cache.
  - Typehash strings match the `abi.encode` field order.
  - `ECDSA.recover` rejects high-s and 64-byte signatures.
  - Nonces are bitmap-based, per owner or account, and consumed before any external call.
  - Cancel ids cannot repeat because each id embeds a consumed nonce.
- **Permits:** a front-run permit is swallowed. `from` is `msg.sender` in the routers and signature-bound in the relayer, so a copied permit cannot redirect funds.
- **Reentrancy:** every mutating entry point is `nonReentrant`. ERC-777-style hooks cannot reorder the effects.
- **CREATE2 init:** clone creation and initialisation happen atomically in `deploy`. `initialize` recomputes the address from `msg.sender`, so it cannot be front-run or hijacked.
- **EIP-5564:** metadata is `viewTag || 0xa9059cbb|0xeeeeeeee || asset || net` (57 bytes), as the EIP recommends. The scheme-1 router uses `schemeId = 1` and the policy router uses `0x47500002`. The announcer defaults to the canonical `0x55649E01B5Df198D18D95b5cc5051630cfD45564` in the scripts.
- **Token quirks:**
  - USDT-style tokens with no return value work through SafeERC20.
  - Fee-on-transfer and rebasing tokens fail closed.
  - Zero-amount transfers are skipped.
  - A token address without code reverts.

## 6. Residual risks

- AUD24-01 is open until the owner decides on the ABI change. Even after the fix, the factory `deploy` calldata publishes the policy pre-image, and withdrawals reveal the destination.
- Known residuals by design remain: M-01, L-02, L-03, L-05, the stolen-key standoff (I-01/C-08), and CONTRACTS-CORE-01..04.
- Tooling limits:
  - EDR is not forge: cheatcode coverage differs, and gas was not measured.
  - Fuzz and invariant depth was reduced.
  - Deploy-script tests did not execute because broadcast cheatcodes are unsupported.
  - Slither ran through a solcjs shim. Bytecode equality with the devnet manifest supports, but does not prove, equivalence with the native compiler.
- Not reviewed: `packages/pool-contracts`, most of `packages/payer-hiding-contracts`, off-chain consumers beyond grep, live deployments, and chains with non-standard CREATE2.

## 7. What hosted CI must confirm

1. `forge test` (default profile) includes the 4 new tests in `test/audit/Review24.audit.t.sol`, plus the 6 tests that EDR could not run.
2. `forge fmt --check` on the new file. The file was written to repo style, but no formatter ran.
3. `forge snapshot --check --no-match-test "testFuzz|invariant"`: the new tests are not in `.gas-snapshot`, which was not edited by hand. If the check fails on missing entries, regenerate it with `forge snapshot` in CI. No source behaviour changed, so existing entries should be unaffected.
4. `forge coverage --ir-minimum` compiles the new file.
