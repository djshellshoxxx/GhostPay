# Solana/TRON CLI compatibility recovery

Final runtime: `9c014e2bcb32ae28719b8bfd92b079bafb5ea1e3`.
Base: completed relayer recovery `308a2148`.
Donor: PR #211 `a92658b1ef6b95ff0145b2e1933d0047d51289d5`.

## Behavior restored from the existing ADRs

The CLI-side Solana package now follows the web implementation and ADR-0017: `st:sol:`
meta-addresses carry a checked cluster, the shared point has no extra cofactor multiplication
because input points are already strictly validated, the shared tweak hashes `R || Z || S`,
and the view tag hashes `R || Z` with its existing SHA-256 domain. Memos use bounded base58
`R || tag` bytes. The retired `gpsol:` format is refused explicitly. The CLI reports the
recipient cluster and refuses mainnet; it still proves neither identity nor payment.

The CLI-side TRON package now accepts the existing `st:trx:0x` format, rejects legacy EVM
meta-addresses, and produces the same one-time addresses, keys, tags and `GPT1` memo as the
web package. Its structural payment builder cannot bind that memo into `raw_data.data`.
It now throws the fixed `MEMO_NOT_BOUND` class before deriving a destination or returning
a payable request. Amount and fee-limit checks still run when the request is constructed.
No signing, sending, provider configuration or mainnet enablement was added.

## Regression-first evidence

| Check | Source | Actual result |
|---|---|---|
| Solana differential baseline | `9c1ccb90` | 8 failed / 3 passed. The three web-side controls passed; CLI encoding, cluster, memo and derivation parity failed. |
| TRON existing-API baseline | `9c1ccb90` | 3 failed, proving current web-format derivation was refused and the legacy EVM form remained accepted. No missing-module setup failure was used as evidence. |
| CLI baseline | `9c1ccb90` | 8 failed / 37 passed, covering legacy errors, cluster reporting and mainnet refusal. |
| Separate TRON builder baseline, after codec recovery | `1766e71f` | 2 failed / 4 passed. The builder actually returned a payment without a bound announcement; eager amount/fee-limit refusal also failed. |
| Full Solana coverage | `9c014e2b` | 111/111 passed across 11 files, no skips, 70.580 s. Coverage: 99.41% statements / 98.99% branches / 98.41% functions / 99.64% lines. |
| Full TRON coverage | `9c014e2b` | 57/57 passed across 7 files, no skips, 13.350 s. Coverage: 100% in all four categories. |
| CLI chain command selection | `9c014e2b` | 45/45 passed, no skips, 8.187 s. |
| Solana / TRON builds | `9c014e2b` | Passed, 2.545 s / 1.871 s. |
| Solana / TRON full typechecks | `9c014e2b` | Passed, 4.673 s / 4.615 s. |
| Full CLI typecheck | `9c014e2b` | Passed, 16.542 s. |
| Solana / TRON full source lint | `9c014e2b` | Passed, 9.362 s / 6.451 s. |
| Three changed CLI files lint | `9c014e2b` | Passed, 9.626 s. |
| Web-only vector regeneration | `9c014e2b` | All payload fields identical; only generation date and Node-version metadata differed. Original fixture restored. |
| CLI package build and build stamp | `c7229b95` | Passed, 6.131 s. This commit only marks the README's old verification results as historical; runtime remains `9c014e2b`. |

Coverage thresholds and test budgets were not changed. Node 22.23.4 and Vitest 5.1.0 were
used with the 768 MiB cap and one command per qualification mutex hold. Separate lint
processes kept each TypeScript project isolated. Full CLI coverage and compiled acceptance
were not repeated; the earlier recorded global gates remain separate from this focused pass.

The vector generator imports only the web packages and core-crypto, never the CLI-side
implementations under test. Its regenerated payload hash, after removing only `generatedAt`
and `node`, is `31ecfe6a775a9deb13ce9c3e261e6c23c0c1978d686dda4f83ba3db24092402c`.
The differential suites also directly load the web source. These are reproducibility and
interoperability checks, not an independent cryptographic audit or a real-chain transaction.

## Ownership, preservation and review

Live PR #250 was checked at `22af2074`: its deployment/date/retry and TRON RPC completeness
paths are separate from this lane. Web `solana-stealth`, `tron-adapter`, network isolation,
Sweep consent and all seven excluded owner streams remain unchanged. The current dependency
manifests and lockfile are retained. Dependencies are independent copies, and no successful
fresh installation is asserted for this worktree.

The coordinator independently reviewed both runtime commits and reported PASS for existing
ADR/web parity, strict point and format checks, legacy/mainnet refusal, and the TRON memo
refusal before derivation. Existing local signer nonce differences and stricter Solana key-reuse
checks remain documented. Public-cluster acceptance and combined-candidate hosted gates are
still separate work.

Apply this chain in order: `23df344d`, `9c1ccb90`, `9913080e`, `1766e71f`, `9c014e2b`,
`c7229b95`, followed by this evidence commit. Exact commands, sources, results, environment
and raw-log hashes are in [workflows-compat.json](workflows-compat.json).
