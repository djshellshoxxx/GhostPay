# Token behaviour notes

- USDT (Tether): `approve` returns no bool on Ethereum mainnet and requires allowance reset to 0 before changing a non-zero allowance. Always call through a safe-approve wrapper (viem `simulateContract` plus allowance check; Solidity SafeERC20 `forceApprove`). No ERC-2612 permit. Decimals 6 on most chains, 18 on BNB Smart Chain: never assume, read from the issuer docs. Tether can blacklist addresses. NOT allowlisted: address unverified.
- USDC / EURC (Circle FiatToken): blacklist-capable and pausable; transfers to or from a blocked address revert. Supports ERC-2612 permit (read the EIP-712 domain version at runtime). Flags `blacklistCapable: true`, `permit: true`.
- DAI: DAI-style permit (not ERC-2612); sweep relayer does not support it, so `permit: false` when added.
- PYUSD, FDUSD, USDe: freeze/blacklist capable or issuer-controlled; unverified, not listed.
- WETH/WPOL/WBNB/WAVAX, WBTC: wrapped assets; WBTC has custodian-mint risk. Unverified, not listed.
- Fee-on-transfer or rebasing tokens must never be allowlisted: the router fee math assumes exact transfers.
- Config flags: `TokenConfig.blacklistCapable`, `TokenConfig.nonStandardApprove` (set true for USDT-style when added).
