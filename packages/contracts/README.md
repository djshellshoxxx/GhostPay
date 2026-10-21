# @ghostpay/contracts

Solidity 0.8.28 (EVM `cancun`, optimizer 200 runs), Foundry, OpenZeppelin Contracts 5.6.1 (vendored). Normative spec:
`docs/CONTRACTS_SPEC.md` sections 1, 2, 3, 5. Deviations and spec findings: [`DEVIATIONS.md`](./DEVIATIONS.md).

| Contract | Purpose |
|---|---|
| `src/GhostPayRouter.sol` | Checkout router: 25 bps floor fee, net to stealth address, ERC-5564 announcement with exact 57-byte metadata (ERC-20, native, ERC-20 + gas buffer). |
| `src/GhostPaySweepRelayer.sol` | Gas-sponsored stealth sweep: EIP-712 order signed by the stealth key, optional ERC-2612 permit (try/catch), bitmap nonces, token-denominated reimbursement. |
| `src/PolicyAccount.sol` | Policy-guarded stealth account (scheme `0x47500002`): EIP-1167 clone target; owner-signed (EIP-712) withdraw requests, delay, merkle-committed per-token window caps, funds only to `destination`, destination change after `2 * delay`. |
| `src/PolicyAccountFactory.sol` | Immutable CREATE2 clone factory; charges the F-SECURE flat fee once per account; emits only `AccountDeployed(account)`. |
| `src/GhostPayPolicyRouter.sol` | Scheme-2 checkout router: same 25 bps fee and 57-byte metadata, pays only `FACTORY.predictAddress(owner, policyHash)` accounts, announces scheme `0x47500002`. Immutable, no admin. Deploy script `script/DeployPolicyRouter.s.sol`. |
| `src/interfaces/` | `IGhostPayRouter`, `IGhostPaySweepRelayer`, `IPolicyAccount`, `IERC5564Announcer` (identical to the CC0 reference interface). |

No owner, proxy, pause, rescue, fee setter, `delegatecall` or arbitrary call exists anywhere. The policy-guarded account (section 4) is described below; its deviations are items P1-P19 in `DEVIATIONS.md`.

## Layout

```
src/                 production contracts + interfaces
test/                unit, fuzz, invariant, deploy-script tests
test/mocks/          standard / no-return / returns-false / fee-on-transfer / reentrant / permit / blacklist tokens, native receivers
test/utils/          CC0 reference ERC5564Announcer (test only)
script/Deploy.s.sol  deployment script (env driven, no keys or addresses in source)
script/DeployBase.s.sol  shared env/chain-allowlist helpers of the deploy scripts
script/DeployPolicy.s.sol  policy implementation + factory deployment (env driven)
scripts/check-natspec.sh  NatSpec completeness check
scripts/pre-deploy-check.sh  prints the effective deploy configuration and runs static/read-only checks (never broadcasts)
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
FEE_RECIPIENT=<multisig or hardware wallet> scripts/pre-deploy-check.sh router   # prints config, checks, never broadcasts
FEE_RECIPIENT=<multisig or hardware wallet> \
forge script script/Deploy.s.sol --rpc-url "$RPC" --broadcast --account <keystore>   # or --ledger
```

Guard rails (audit L-06), all enforced by the scripts and mirrored by `scripts/pre-deploy-check.sh`:

- `FEE_RECIPIENT` is mandatory, non-zero and must differ from the broadcaster; a recipient with code only produces a warning
  (it must accept plain ETH and, for `DeployPolicy`, the fee token, and should not be blacklistable, see M-01/M-03 below).
- `ANNOUNCER` defaults to the canonical `0x55649E01B5Df198D18D95b5cc5051630cfD45564`. Any other address is rejected unless
  `ALLOW_CUSTOM_ANNOUNCER=1` (testnets with a locally deployed announcer). It must have code; its `codehash` is printed and
  can be pinned with `EXPECTED_ANNOUNCER_CODEHASH`.
- The chain id must be a built-in testnet (Sepolia, Base/OP/Arbitrum Sepolia, Polygon Amoy, Hoodi) or listed in
  `ALLOWED_CHAIN_IDS=8453,10,...` (spaces around entries are trimmed; empty or non-numeric entries abort with `InvalidChainIdEntry`).
  Chain id 31337 (anvil, also reported by a forked anvil) is accepted only with `ALLOW_LOCAL=1`.
- After deployment every immutable is read back and compared with the inputs (`require`), the relayer's `DOMAIN_SEPARATOR` must be non-zero.
- `DeployPolicy` additionally requires `MAX_FLAT_FEE` (no default) and aborts if `FLAT_FEE > MAX_FLAT_FEE`; it prints the `FEE_TOKEN` `decimals()`
  so the operator can check the unit (`3000000` is USD 3.00 only for 6 decimals).

Record the result in `deployments/<chainId>.json` (see `deployments/README.md`).

## Verification status

Newer figures (2026-10-21: 377 tests in 23 suites, `forge fmt --check` and `forge snapshot --check` passing, one test failing only under `forge coverage --ir-minimum`) are in [`docs/remote/STATUS.md`](../../docs/remote/STATUS.md); Echidna and mutation results are in the section below. Older run (forge 1.8.5, solc 0.8.28, default profile: 10 000 fuzz runs, invariants 256 runs x depth 50): **274 tests in 14 suites pass**
(includes the audit regression/PoC tests under `test/audit/`). `forge coverage --ir-minimum` (production sources only): lines 99.25 % (264/266),
branches 100 % (39/39), functions 100 % (72/72); the two uncovered "lines" are the new assembly `call` statements, which the coverage instrumentation
does not count although the tests execute them (verified by the gas-bound regression tests). Under `--ir-minimum` the instrumented bytecode differs from the
release build and `Sweep.audit.t.sol::test_crossRelayerAndCrossChainReplayRejected` fails in coverage mode only (it switches `chainid`; the cause under instrumentation was not investigated and the contract it exercises, the sweep relayer, is unchanged apart from comments); it passes in the normal run. `.gas-snapshot` is committed.
Static analysis: Slither 0 medium/high results with the CI exclusions and also **without** the `arbitrary-send-erc20,incorrect-equality` exclusions
(both sites carry an inline `slither-disable-next-line` with rationale); Mythril was run once by the audit. Echidna and mutation testing were run locally only (see "Echidna and mutation testing"); neither is in CI. Forge's built-in
linter reports no findings (justified inline `forge-lint: disable` comments only). No fork test against a live network was run; the "fork-style"
requirement is met by compiling the CC0 reference announcer locally and asserting the `Announcement` event.

## Echidna and mutation testing (local only)

Harnesses in `test/echidna/` (`EchidnaRouter`, `EchidnaSweep`, `EchidnaPolicy`; config `echidna.yaml`; `echidna_canary_*` properties are expected to fail). Results: [`docs/remote/contracts-assurance.md`](../../docs/remote/contracts-assurance.md). Mutation testing with gambit (582 mutants, 573/577 killed after the tests in `test/mutation_local/`, remaining 4 equivalent): [`docs/remote/mutation-results-local.md`](../../docs/remote/mutation-results-local.md). Neither runs in CI.

## Audit follow-ups (docs/audits/02-security-review-contracts.md)

Fixed in code: L-01 (native sends use an assembly `call` that copies no return data), L-04 (the signed `Withdraw` commits to `limitLeafHash`),
I-02 (`PolicyAccountFactory.MIN_DELAY = 1 hours`), L-06 (deploy scripts, see "Deploy"). See `DEVIATIONS.md` items A1-A6. Not fixable in-contract, and therefore
documented here; the matching `test_EXPLOIT_*` tests keep asserting the residual behaviour:

- **M-03 is mitigated in code (DEVIATIONS R11):** when the fee token refuses the fee transfer although the caller holds and has approved the flat fee, `PolicyAccountFactory.deploy`
  waives the fee (`FeeWaived`), so counterfactual funds are no longer frozen by a blacklisted or paused fee recipient. A fee token that turns lossy still blocks deployment.
  The text below still applies to M-01 (routers) in full.
- **M-01 / M-03: the immutable fee recipient (and, for policy accounts, the fee token) is a single point of failure.** If the issuer blacklists or
  pauses `FEE_RECIPIENT` for the token (or the recipient cannot receive ETH), every router payment with a non-zero fee reverts (payments below 400 base units
  pay no fee and still work), and `PolicyAccountFactory.deploy` reverts, which freezes funds that were already sent to the not-yet-deployed counterfactual
  account address (only this factory can create code there). Mitigations, all operational: choose a plain multisig/hardware recipient that is not exposed to
  sanctions lists; monitor the recipient's blacklist/pause status per fee token; keep a "deprecated router" flag in the deployment manifest so clients switch to a
  replacement router; clients should `eth_call`-simulate a payment before presenting it; deploy factories with `FLAT_FEE == 0` on chains whose fee token is freezable and
  charge the fee elsewhere; clients should deploy the account before publishing a scheme-2 meta-address where the counterfactual UX is not essential.
  **Owner decision (not implemented):** a *pull-vault* design in which the router/factory credits the fee to a vault that the recipient withdraws from later, so a bad
  recipient can never block a payer. Cost: the contracts would hold balances (custody, an accounting surface, a withdrawal path) and the "no custody, no admin" property
  of the router would be weakened. It is documented as a design alternative only.
- **M-02: `GhostPayRouter` announces scheme id 1 only** (the separate `GhostPayPolicyRouter` now announces `0x47500002`; the text below describes the scheme-1 router) (`SCHEME_ID = 1` is a constant). Payments to a `PolicyAccount` address (scheme `0x47500002`) through the
  router are announced under scheme 1 and are therefore not discoverable by a scheme-2 scanner. **Policy accounts are experimental and must not be used with the router
  until a router variant (or a `schemeId` argument restricted to `{1, 0x47500002}`, which is a public-contract change that needs `CONTRACTS_SPEC` first) exists** and
  scanners/test vectors cover scheme 2. Funds are not lost: they sit at `A_acct`.
- **L-02: announcements are unauthenticated.** The router checks only lengths, marker, asset, net, key length and prefix byte. Scanners must verify the actual balance delta at the stealth address,
  apply a token allowlist / dust threshold, and never treat `caller == router` as proof of anything. Any token can be announced to any address; the view tag and ephemeral key are not verifiable on-chain; announcement flooding costs only the flooder's gas.
- **L-03: sweep relayer economics.** After a successful simulation the owner can move the tokens away (the relayer loses gas, no fee), a hostile token's `permit()` can burn the supplied gas
  inside the `try/catch`, and a searcher copying calldata only pays the original `feeTo`. Mitigations live in `apps/relayer`: token allowlist, per-transaction gas cap, simulate immediately before sending, per-owner quotas, circuit breaker. No contract change is planned.
- **L-05: assets that can never leave a `PolicyAccount` (accepted, by design).** Lossy/rebasing tokens fail the exact balance-delta check, a token without a leaf under a non-zero `limitsRoot`
  can never be withdrawn, NFTs cannot be safe-transferred in or moved out, and ETH sent to the implementation is lost. There is deliberately no rescue path. Every accepted token needs a leaf (an unlimited leaf, `limit = type(uint256).max`, if no cap is wanted); clients must warn.
- **I-04: 2300-gas senders cannot fund clones.** `transfer()`/`send()` to a `PolicyAccount` clone reverts (the EIP-1167 `delegatecall` to a cold implementation exceeds the stipend). Funds are not lost (the call reverts); use a normal `call{value: ...}`.

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
  first (skipped when the fee is 0); `delay` in `[1 hour, 30 days]` (`MIN_DELAY`, `DelayTooShort`; the account itself still accepts `[1 s, 30 days]` when initialised by another deployer); no admin.
- Account flow: owner signs `Withdraw` (including `limitLeafHash`, the merkle leaf of the limit; the proof must use it) -> anyone calls `requestWithdraw(w, limitProof, sig)` -> after `delay` anyone calls `executeWithdraw(id)` (funds go to
  `destination` only, and only if it is still the destination from request time; otherwise `DestinationChangedSinceRequest`, cancel and re-request) -> or anyone relays the owner's `cancel(id, sig)`. Destination change: `proposeDestination` (owner-signed) -> `executeDestinationChange()` after
  `2 * delay` -> or `cancelDestination(id, sig)`.
- Limits: `limitsRoot` is a merkle root of `keccak256(bytes.concat(keccak256(abi.encode(token, limit, windowSeconds))))`; `0` = unlimited; a token without a leaf is not
  withdrawable (add an unlimited leaf, `limit = type(uint256).max`). The window is two fixed buckets (conservative, see P2).
- Limitations: a stolen key is delayed, not neutralised: it can withdraw to the owner's destination after the delay, cancel the owner's actions, and redirect all funds
  after `2 * delay` unless the honest owner cancels each of its destination proposals in time (no guardian or recovery path exists; a lost key
  means locked funds); ERC-777/fee-on-transfer/rebasing tokens cannot be withdrawn; 2300-gas native senders cannot pay a clone (P14); not wallet-interoperable.

```bash
FEE_RECIPIENT=<multisig> FEE_TOKEN=<stablecoin> FLAT_FEE=3000000 \
forge script script/DeployPolicy.s.sol --rpc-url "$RPC" --broadcast --account <keystore>
```

Verification: see "Verification status" above (the policy contracts are covered by the account unit/fuzz/invariant suites, the factory suite and the audit regression tests). No fork test, no live deployment, no external audit, and no independent
review of the merkle-leaf format by a client implementation yet.
