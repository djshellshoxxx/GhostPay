# payer-hiding-contracts

Foundry project with the on-chain pieces of the payer-hiding modes PH-2, PH-3 and PH-4 ([spec](../../docs/remote/privacy-specs/payer-hiding.md), sections 6.2 to 6.4). **Testnet-only proof of concept. Not deployed. Not independently audited** (self review and tooling only, see [`audit-payer-sponsor.md`](../../docs/remote/privacy-specs/audit-payer-sponsor.md)).

These contracts remove the native-gas funding link of a payer wallet by letting a sponsor pay gas. They do **not** hide the payer: the payer (or its account) stays visible on chain, the sponsor sees everything, and the contracts are public fingerprints.

| Contract | Mode | What it is |
|---|---|---|
| `GhostPayPayRelay` | PH-2 | Pulls the payer's tokens (ERC-2612 permit or allowance) on a payer-signed EIP-712 order, calls a GhostPay router, pays the sponsor fee in tokens. Router `msg.sender` is the relay. Supports EOA and ERC-1271 payers. |
| `GhostPayPayerDelegate` | PH-3 | Code a fresh EOA delegates to via EIP-7702. Same order, signed by the EOA key; runs as the payer so the router sees the payer EOA. No `execute`, no `delegatecall`, no initializer, ERC-7201 nonces. |
| `GhostPayPayerAccount` | PH-4 | Single-owner ERC-4337 v0.7 account (`validateUserOp`, `executeBatch`), immutable EntryPoint and owner. |
| `GhostPayPayerAccountFactory` | PH-4 | CREATE2 factory (`createAccount`, `getAddress`) used through `initCode`. |
| `GhostPayVerifyingPaymaster` | PH-4 | ERC-4337 v0.7 paymaster: sponsors gas iff the operation carries a signature by an immutable signer. **Its immutable `SPONSOR_ADMIN` is the only privileged role in the package** (deposit and stake management; cannot move user funds). |

Properties shared by all: immutable, no owner/upgrade/pause/`delegatecall` (except the single admin above), constructors refuse chain ids other than 31337, 11155111 and 84532 (`ChainGuard`), exact balance-delta checks, nonce consumed before external calls, no fee for GhostPay. Router calls are restricted to the two `payERC20` selectors and the calldata must repeat the signed token, stealth and gross (`RouterCall`).

## Build and test

```bash
export PATH=/home/user/tools:$PATH           # forge, solc 0.8.28 (sandbox paths)
./scripts/fetch-entrypoint.sh                # TEST-ONLY: ERC-4337 EntryPoint v0.7.0 source into .vendor/ (gitignored, GPL-3.0 file headers)
export FOUNDRY_SOLC=/home/user/tools/solc    # local only; the committed foundry.toml uses solc_version = "0.8.28"
forge build                                  # deny = warnings, forge lint included
forge fmt --check
forge test                                   # 10 000 fuzz runs, invariants 256 x 50 (FOUNDRY_PROFILE=dev for a quick loop)
bash scripts/check-natspec.sh
```

`evm_version = "prague"` in `foundry.toml` is needed for the EIP-7702 cheatcodes (`signDelegation`, `attachDelegation`); solc 0.8.28 accepts `--evm-version prague` and produces bytecode identical to `cancun` for these contracts (compared by hash). The deployed code uses transient storage (EIP-1153, Cancun) in the delegate only.

Tests: unit, fuzz (`testFuzz_*`), invariants (`GhostPayPayRelay.invariant.t.sol`, `GhostPayPayerDelegate.invariant.t.sol`), ERC-4337 tests against the real EntryPoint, and `GoldenVectors.t.sol`, which recomputes with the real contracts every hash in `../payer-sponsor/test-vectors/ph-vectors.json` (the TypeScript side asserts the same file). Echidna harness: `test/echidna/EchidnaRelay.sol` with `echidna.yaml` (needs `crytic-compile`).

Third-party code: OpenZeppelin 5.6.1 (vendored in `../contracts/lib`, read only), `forge-std`. The EntryPoint is fetched for tests only and never imported by production sources; production code uses its own interface file `src/interfaces/IERC4337.sol`.

Deviations from the spec and everything unverified: [`DEVIATIONS.md`](./DEVIATIONS.md).
