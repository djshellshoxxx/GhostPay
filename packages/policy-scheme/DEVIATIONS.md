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
- **S6. Router builders** use the `GhostPayPolicyRouter` ABI generated from commit `2058a57` (`PolicyRef(owner, policyHash)` argument,
  scheme id `0x47500002`). The fee rule (`floor(gross * 25 / 10000)`) is mirrored, not read from the chain.
- **S7. Policy record format** `ghostpay-policy-record` v1 (canonical JSON, see `vectors/client-v1.json`) is GhostPay-specific. It holds no
  secrets but links destination and meta-address. It is the client-side recovery artefact of ADR-0023 (no contract change).
- **S8. `windowHeadroom` is a planning bound, not a reservation**: consumption happens at `executeWithdraw`, so callers pass the earliest
  execution time and subtract other pending requests of the token. A thief with the owner key can consume headroom first.

## Not verified

- Nothing ran against a public network, a hardware wallet or a wallet's `eth_signTypedData_v4` UI (only noble/viem signers).
- The merkle layout matches `@openzeppelin/merkle-tree`'s StandardMerkleTree algorithm by construction, but that library is not a
  dependency and was not run; on-chain `MerkleProof` acceptance was checked for the 1-, 2- and 5-leaf vector trees only.
- No independent review or audit of this package; the scheme remains experimental (ADR-0014: no recovery path, M-03 fee-token freeze).
