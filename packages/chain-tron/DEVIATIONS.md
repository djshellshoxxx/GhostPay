# Deviations and unverified items

1. **Vectors not source-verified.** Raw GitHub (tronprotocol docs / TronWeb) returned 404 or no access in this sandbox. `T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb` (41 + 20 zero bytes) and `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` (`41a614f803b6fd780986a42c78ec9c7f77e6ded13c`, mainnet USDT) are recalled from memory; they pass the sha256d checksum, which makes a memory error very unlikely but is not provenance. The address of scalar 1 is self-derived and cross-checked against raw keccak256 and an independent base58check encoder. All other addresses in tests are FAKE patterns (repeated bytes).
2. **TronGrid request schema unverified.** Field names (`owner_address`, `contract_address`, `function_selector`, `parameter`, `fee_limit`, `call_value`, `visible`) follow tron.md and memory; developers.tron.network was not reachable. Bodies use `visible:false` (hex addresses).
3. **fee_limit cap.** `MAX_FEE_LIMIT_SUN = 15,000 TRX` is a recalled default of the network parameter, which can change by proposal. Query the node before relying on it.
4. **Meta-address encoding** reuses core-crypto `st:eth:0x…` unchanged (no Tron chain tag); chain binding must be enforced by the adapter/invoice (see tron.md).
5. **EVM conversion returns lowercase hex**, not EIP-55, and does not checksum-verify mixed-case input (avoids a viem dependency).
6. **Zero-amount transfers rejected** (stricter than the ERC-20 spec).
7. **Adapter is structural only**: local interface copy, no `Invoice` dependency, scan consumes an injected announcement source, `family: 'tron'` requires the proposed `ChainFamily` extension (docs/remote/chain-ports/tron-impl.md). Fees all `not_enforceable` until a fee-split contract exists.
8. No signing (Tron signs secp256k1 over sha256 of `raw_data`) and no verification of node-returned transactions are implemented.
