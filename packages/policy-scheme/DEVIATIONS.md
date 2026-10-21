# Deviations and open points (@ghostpay/policy-scheme)

Choices where the spec is silent. The lead should confirm or reject each.

- **S1. Meta-address format** `st:eth:gp2:0x<spendPub33><viewPub33><policyHash32>` (196 hex digits) is GhostPay-specific and not
  ratified by an ADR or any ERC. The distinct prefix keeps scheme-1 wallets from parsing it as a plain meta-address. Chain, factory and
  implementation are not in it; the payer takes them from the pinned deployment manifest.
- **S2. Scanner re-implements the scheme-1 view-side step** (`S = v*R`, `keccak256(S)`, `P_spend + h*G`) because core-crypto only
  exposes a check against a known address and the announced address is `A_acct`, not `A_owner`. Sender derivation and owner-key recovery
  call core-crypto directly; the local step is differential-tested against core-crypto `checkAnnouncement` and the SDK vectors.
- **S3. Stricter than the contract:** the tree builder refuses a zero limit and a limited leaf with zero window (the account would
  revert every withdrawal under them) and duplicate tokens (P1); `encodeDeployAccount` refuses `owner == destination` (allowed by P8);
  `buildWithdrawTypedData` refuses `amount > limit`, a proof that does not verify against `limitsRoot`, and `limit` data for a zero root.
- **S4. The scanner accepts a list of policy hashes** so one viewing key can serve several published policies.
- **S5. Test-vector deployment** is chain 31337 with factory/implementation at `CREATE(deployer, 1/0)` of a public test key; the anvil
  test reproduces exactly those addresses. There are no vectors for any real chain or deployed factory.
- **S6. Router builders** use the `GhostPayPolicyRouter` ABI regenerated after the round-3 audit fix N-01 (contracts DEVIATIONS R10): each payment passes
  the per-payment CREATE2 salt `accountSalt(owner, policyHash)` instead of `PolicyRef(owner, policyHash)`, so the seller-constant policy hash never appears in calldata.
  The builder still requires and checks `owner` (non-zero) and `policyHash`, because the router can no longer see them. `decodePolicyPaymentCalldata` returns `salt` (not `owner`/`policyHash`), checks
  `stealth` against `predictAccountAddressFromSalt`, and takes an optional `expected {owner, policyHash}` to bind the salt. Scheme id `0x47500002`. The fee rule
  (`floor(gross * 25 / 10000)`) is mirrored, not read from the chain.

## Not verified

- Nothing ran against a public network, a hardware wallet or a wallet's `eth_signTypedData_v4` UI (only noble/viem signers).
- The merkle layout matches `@openzeppelin/merkle-tree`'s StandardMerkleTree algorithm by construction, but that library is not a
  dependency and was not run; on-chain `MerkleProof` acceptance was checked for the 1-, 2- and 5-leaf vector trees only.
- No independent review or audit of this package; the scheme remains experimental (ADR-0014: no recovery path; M-03 fee-token freeze mitigated by the factory fee waiver, contracts DEVIATIONS R11).
