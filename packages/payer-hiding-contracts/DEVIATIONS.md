# Deviations and open points (payer-hiding-contracts)

Spec: [`payer-hiding.md`](../../docs/remote/privacy-specs/payer-hiding.md). Evidence tags: **[RAN]** run in this build, **[P]** primary source read, **[U]** unverified.

## Deviations from the spec text

1. **Account is a full CREATE2 deployment, not an EIP-1167 clone** (spec 6.4). The owner is a constructor argument (immutable), so there is no initializer to front-run and the address is bound to `(entryPoint, owner)`. Costs more deployment gas; irrelevant on testnet.
2. **`RouterCall` also pins `token`, `stealth` and `gross` inside the router calldata** to the signed intent fields (spec 6.2 only binds `payloadHash` and checks the selector). A signed intent that disagrees with its calldata is refused instead of being only "bound".
3. **Relay balance accounting is by delta against the balance at entry** (spec: "relay token balance == `sponsorFee`" and "final balance == 0"). With absolute checks a donation of one wei would block every payment of that token. Donated tokens are unrecoverable (no sweep function, by design).
4. **`GhostPayVerifyingPaymaster` refuses `validUntil == 0`** (open-ended sponsorship) and always returns an empty context (`postOp` reverts if ever called).
5. **`ChainGuard._chainId()` is an `internal virtual` hook** used only by the Echidna harness (Echidna's EVM reports chain id 1). Production contracts do not override it.
6. **No nonce-clearing function.** Spec 6.3 shows a placeholder line `clearNonceBitmap`; it does not exist (nonces are single-use forever, also after re-delegation).
7. **Foundry `deny = "warnings"`** is set (zero build warnings and zero lint warnings; justified `forge-lint: disable-next-line` comments carry the reason).

## Facts checked against primary sources [P]

- EIP-7702 (Final): constants `SET_CODE_TX_TYPE 0x04`, `MAGIC 0x05`, `PER_AUTH_BASE_COST 12500`, `PER_EMPTY_ACCOUNT_COST 25000`; delegation designator `0xef0100 || address`; clearing with `address = 0x0`; authorization nonce must equal the signer's account nonce; invalid tuples are skipped, the transaction still executes (this is the basis of audit finding C-01). Source: `https://raw.githubusercontent.com/ethereum/EIPs/master/EIPS/eip-7702.md` (from the spec, retrieval 2026-10-21).
- ERC-4337 EntryPoint v0.7: `getUserOpHash = keccak256(abi.encode(userOp.hash(), entryPoint, chainId))` and `PackedUserOperation` layout read from the official source (npm `@account-abstraction/contracts@0.7.0`, release v0.7.0 of `eth-infinitism/account-abstraction`). v0.8 uses an EIP-712 domain for the operation hash and is **not supported**.
- **EntryPoint v0.7 address** `0x0000000071727De22E5E9d8BAf0edAc6f37da032` **[RAN]**: recomputed as `CREATE2(0x4e59b44847b379578588920ca78fbf26c0b4956c, salt 0x90d8084d...1de3, keccak(v0.7.0 EntryPoint creation code from the npm artifact))`. The salt was taken from memory, but the result equals the address, which confirms both. v0.8 address `0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108` is stated in the official README (develop branch).
- Sepolia: the go-ethereum chain spec (`params/chainspecs/sepolia.json`, master) has `pragueTime 1741159776`, `osakaTime 1760427360`; both are in the past on 2026-10-21, so EIP-7702 is active on Ethereum Sepolia per the client spec **[P]**; **no transaction was sent to Sepolia [U]**.
- Base Sepolia: the OP Stack Isthmus spec lists EIP-7702 and the Sepolia superchain config has `isthmus_time = 1744905600` (2025-04-17) **[P]**; whether Base Sepolia follows that superchain-level time and whether a public Base Sepolia RPC accepts type-4 transactions were **not checked [U]**.

## Unverified

- Any deployment, transaction or user operation on Sepolia or Base Sepolia (everything ran on local anvil 1.8.5 and the Foundry EVM). **[U]**
- A real ERC-4337 bundler. Local e2e uses an EOA calling `EntryPoint.handleOps` directly; ERC-7562 validation rules, paymaster staking and reputation on public bundlers are not exercised. `block.chainid` is the only environment opcode used in `validatePaymasterUserOp`; whether bundlers accept it is **[U]**.
- ERC-1271 permit behaviour of real tokens (PH-2 uses ERC-2612 with a plain `PermitToken` mock and OZ `SignatureChecker` for the order signature only).
- Line coverage of the contracts: `forge coverage` aborts in this layout (solar reports the same file under two paths, `/home/user/ghostpay/packages/contracts/lib/...` and `../contracts/lib/...`). Not measured.
- Echidna was run on the relay only (150 061 calls); the delegate, account and paymaster have Foundry unit, fuzz and invariant tests but no Echidna harness (the delegate needs an EIP-7702 account, which Echidna cannot create).
- Gas figures in `.gas-snapshot` come from the Foundry EVM, not a real chain.
- Licensing: the EntryPoint source files carry `GPL-3.0` headers although the npm package metadata says MIT. They are fetched for tests only and are not committed. **OWNER DECISION** whether a vendored copy may ever enter the repository; legal analysis is handled by the owner elsewhere.
