# @ghostpay/contracts

Solidity 0.8.28 (EVM `cancun`, optimizer 200 runs), Foundry, OpenZeppelin Contracts 5.6.1 (vendored). Normative spec:
`docs/CONTRACTS_SPEC.md` sections 1, 2, 3, 5. Deviations and spec findings: [`DEVIATIONS.md`](./DEVIATIONS.md).

| Contract | Purpose |
|---|---|
| `src/GhostPayRouter.sol` | Checkout router: 25 bps floor fee, net to stealth address, ERC-5564 announcement with exact 57-byte metadata (ERC-20, native, ERC-20 + gas buffer). |
| `src/GhostPaySweepRelayer.sol` | Gas-sponsored stealth sweep: EIP-712 order signed by the stealth key, optional ERC-2612 permit (try/catch), bitmap nonces, token-denominated reimbursement. |
| `src/PolicyAccount.sol` | Policy-guarded stealth account (scheme `0x47500002`): EIP-1167 clone target; owner-signed (EIP-712) withdraw requests, delay, merkle-committed per-token window caps, funds only to `destination`, destination change after `2 * delay`. |
| `src/PolicyAccountFactory.sol` | Immutable CREATE2 clone factory; charges the F-SECURE flat fee once per account; emits only `AccountDeployed(account)`. |
| `src/interfaces/` | `IGhostPayRouter`, `IGhostPaySweepRelayer`, `IPolicyAccount`, `IERC5564Announcer` (identical to the CC0 reference interface). |

No owner, proxy, pause, rescue, fee setter, `delegatecall` or arbitrary call exists anywhere. The policy-guarded account (section 4) is described below; its deviations are items P1-P19 in `DEVIATIONS.md`.

## Layout

```
src/                 production contracts + interfaces
test/                unit, fuzz, invariant, deploy-script tests
test/mocks/          standard / no-return / returns-false / fee-on-transfer / reentrant / permit / blacklist tokens, native receivers
test/utils/          CC0 reference ERC5564Announcer (test only)
script/Deploy.s.sol  deployment script (env driven, no keys or addresses in source)
script/DeployPolicy.s.sol  policy implementation + factory deployment (env driven)
scripts/check-natspec.sh  NatSpec completeness check
lib/                 vendored openzeppelin-contracts 5.6.1 and forge-std (no git submodules)
```

## Commands

```bash
forge build                         # zero warnings expected
forge fmt --check
forge test                          # default profile: 10 000 fuzz runs, invariants 256 runs x depth 50
FOUNDRY_PROFILE=dev forge test      # quick loop: 256 fuzz runs
forge test --match-contract Invariant
forge coverage --ir-minimum --report summary --no-match-coverage "test|script|lib"
forge snapshot --no-match-test "testFuzz|invariant"   # rewrites .gas-snapshot (fuzz gas is non-deterministic, so excluded)
forge build --sizes
scripts/check-natspec.sh            # FORGE=/path/to/forge if forge is not on PATH
```

### Compiler setting

`foundry.toml` sets `solc = "/home/user/tools/solc"` because the offline build sandbox has no access to the
compiler download host. **CI and developer machines should replace that line with `solc_version = "0.8.28"`**
(or override with `FOUNDRY_SOLC_VERSION=0.8.28`; remove the `solc` key first as the two are mutually exclusive).

### Deploy

```bash
FEE_RECIPIENT=<multisig or hardware wallet> \
forge script script/Deploy.s.sol --rpc-url "$RPC" --broadcast --account <keystore>   # or --ledger
```

`FEE_RECIPIENT` is mandatory (revert if unset or zero). `ANNOUNCER` defaults to the canonical
`0x55649E01B5Df198D18D95b5cc5051630cfD45564` and must have code. The chain id must be a built-in testnet
(Sepolia, Base/OP/Arbitrum Sepolia, Polygon Amoy, Hoodi, anvil) or listed in `ALLOWED_CHAIN_IDS=8453,10,...`.
Record the result in `deployments/<chainId>.json` (see `deployments/README.md`).

## Verification status

Latest local run (forge 1.8.5, solc 0.8.28, see the lead's report for exact numbers):
122 tests across 6 suites pass; line coverage 100 % (114/114) and branch coverage 100 % (28/28) for the two
production contracts (`--ir-minimum`, so the instrumented bytecode differs from the optimized release build).
`.gas-snapshot` is committed. Static analysis: Slither, Mythril and Echidna were **not available** in the build
sandbox and have **not** been run; the Playbook's `slither . --fail-high` gate remains open for CI. Forge's built-in linter
reports no findings (justified inline `forge-lint: disable` comments only). No fork test against a live network was
run; the "fork-style" requirement is met by compiling the CC0 reference announcer locally and asserting the
`Announcement` event (emitter, indexed topics, caller == router, metadata layout).

## Known limitations

- **Accidental transfers are unrecoverable.** There is deliberately no rescue function. Tokens or ETH sent
  directly to the router or relayer (including ETH forced in via `selfdestruct`) are lost.
- **Unsupported token types.** Fee-on-transfer, rebasing-on-transfer, hook-reentering (ERC-777 style, blocked by the
  reentrancy lock), tokens returning `false`, and tokens without contract code are rejected (revert). Tokens that
  can blacklist the stealth address or fee recipient (USDC, USDT) can make a payment revert. DAI-style `permit`
  is not supported; USDT has no permit, so it needs the gas-buffer path. EIP-3009 is not built.
- **Router fingerprint.** Every GhostPay payment is announced with `caller == router` and a fixed 57-byte metadata
  shape, so GhostPay traffic is distinguishable from other ERC-5564 users. Metadata amount is public by design
  (ERC-5564 `transfer` layout).
- **Direct payment bypasses the fee.** Anyone can transfer to the stealth address without the router; the fee is
  only enforced for payments that pass through the router. The router cannot verify that `stealth` was derived
  from the announced ephemeral key, nor the view tag; a malicious payer can announce junk (the recipient simply
  never matches it).
- **Native transfers forward all gas** to the fee recipient and the stealth address. A stealth *contract* can burn
  the payer's gas or revert; payment then fails atomically. Fee recipient must be able to receive ETH.
- **Overflow bound.** `gross > type(uint256).max / 25` reverts with a panic (irrelevant for real token supplies).
- **Sweep relayer** supports EOA signers only (no ERC-1271), requires `permit.value >= amount`, and cannot sweep
  tokens whose `permit` is DAI-style. The relayer does not enforce the F-SPONSOR pricing policy; that lives in
  the relayer service and client.
- Contracts are immutable: any defect means deploying a replacement and publishing a new manifest.

## Policy-guarded stealth account (scheme `0x47500002`)

Normative text: `docs/CONTRACTS_SPEC.md` section 4, fee F-SECURE in `docs/FEE_SCHEDULE.md`. Deviations and open questions: `DEVIATIONS.md` P1-P19.

- `A_acct = CREATE2(factory, salt = keccak256(abi.encode(owner, policyHash)), EIP-1167 clone of implementation)` with
  `policyHash = keccak256(abi.encode(destination, delaySeconds, limitsRoot))` (`factory.policyHashOf`, `factory.predictAddress`). The address depends on
  chain, factory and implementation; pin all three in the deployment manifest.
- `factory.deploy(owner, destination, delay, limitsRoot)`: anyone, once per policy; pulls `FLAT_FEE` of `FEE_TOKEN` from the caller (needs approval) to `FEE_RECIPIENT`
  first (skipped when the fee is 0); `delay` in `[1 s, 30 days]`; no admin.
- Account flow: owner signs `Withdraw` -> anyone calls `requestWithdraw(w, limitProof, sig)` -> after `delay` anyone calls `executeWithdraw(id)` (funds go to
  `destination` only) -> or anyone relays the owner's `cancel(id, sig)`. Destination change: `proposeDestination` (owner-signed) -> `executeDestinationChange()` after
  `2 * delay` -> or `cancelDestination(id, sig)`.
- Limits: `limitsRoot` is a merkle root of `keccak256(bytes.concat(keccak256(abi.encode(token, limit, windowSeconds))))`; `0` = unlimited; a token without a leaf is not
  withdrawable (add an unlimited leaf, `limit = type(uint256).max`). The window is two fixed buckets (conservative, see P2).
- Limitations: a stolen key still withdraws to the owner's destination after the delay and can fight destination changes (no guardian or recovery path exists; a lost key
  means locked funds); ERC-777/fee-on-transfer/rebasing tokens cannot be withdrawn; 2300-gas native senders cannot pay a clone (P14); not wallet-interoperable.

```bash
FEE_RECIPIENT=<multisig> FEE_TOKEN=<stablecoin> FLAT_FEE=3000000 \
forge script script/DeployPolicy.s.sol --rpc-url "$RPC" --broadcast --account <keystore>
```

Verification (forge 1.8.5, solc 0.8.28, default profile: 10 000 fuzz runs, invariants 256 x 50): all 225 tests of the package pass; the policy contracts add 103 forge tests (73 account unit,
22 factory, 6 account fuzz, 1 deploy script, 1 invariant suite with 7 invariants). `forge coverage --ir-minimum`: `PolicyAccount` 100 % lines (118/118), 100 % branches
(35/35); `PolicyAccountFactory` 100 % lines (28/28), 100 % branches (7/7). Mutation spot checks (1x instead of 2x destination timelock, no cap, payout to caller, no delay) are caught by the suite.
**Slither, Echidna and Mythril were not available and have not been run.** No fork test, no live deployment, no external audit, and no independent
review of the merkle-leaf format by a client implementation yet.
