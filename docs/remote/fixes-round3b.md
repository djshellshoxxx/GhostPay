# Round 3b fixes (reproduce first, then fix or document)

Inputs: round-1 audits from the sibling swarm on `claude/remote-extensions-1` (`docs/remote/round-audits/{contracts,core-crypto,policy-scheme}.md`, `stress/*`, `research/sec-*`), all marked UNVERIFIED there. Each item below was reproduced with a failing test before any change. Details and evidence: [fixes-round3b-contracts.md](fixes-round3b-contracts.md), [fixes-round3b-libs.md](fixes-round3b-libs.md).

| Area | Item | Reproduced | Outcome |
|---|---|---|---|
| contracts | Pending withdrawals follow a later destination change | yes | FIXED: `executeWithdraw` reverts `DestinationChangedSinceRequest`; new invariant; spec text updated (R14) |
| contracts | uint64 timestamp wrap | yes | FIXED: SafeCast |
| contracts | PolicyRouter invariant handler overflow (F-1) | yes | FIXED (test handler) |
| contracts | Unsalted policyHash dictionary attack | yes | DOCUMENTED, owner decision: a salted policyHash changes policy-scheme vectors/meta-address format. Router calldata no longer carries policyHash (N-01). A no-contract blinding leaf in the limits tree is tested as mitigation. |
| contracts | Fee-token failure freezes funds to undeployed account | yes | Already mitigated by FeeWaived; residual freezes tested and documented |
| contracts | Stolen-key spec claim overstated | yes (wording) | FIXED in contracts docs; spec and policy guide wording patched (this commit) |
| contracts | `deployments/schema.json` lacks GhostPayPolicyRouter | yes | OPEN: the schema patch (appendix A of fixes-round3b-contracts.md) was applied and then reverted, because `packages/chain-adapters` `validateManifest` rejects unknown keys and a test pins schema and validator in sync (`deployments.test.ts`). Needs `policyRouter` support in the validator first (chain-adapters, outside this swarm's agreed scope) |
| contracts | Halmos | n/a | 3 starter specs (RT-1, PR-1, FA-1) pass on halmos 0.3.3; no Certora/long campaign |
| core-crypto | M-1 replayed announcement matches with swapped amount/token | yes | Protocol limit: DOCUMENTED, opt-in `checkAnnouncement(..., {requireRouterMetadata})`, `metadataMatches()`; defaults unchanged |
| invoice-schema | M-2 any self-signed invoice reads as valid-signature | yes | Design limit: DOCUMENTED, opt-in `requirePinnedSigner` throws `UntrustedSignerError`; defaults unchanged |
| policy-scheme | decodePolicyPaymentCalldata accepts swapped payee / corrupt metadata (TS-05) | yes | FIXED |
| policy-scheme | signer signs arbitrary typed data | yes | FIXED (shape/digest check) |
| policy-scheme | limit leaf not recomputed | yes | FIXED (leaf recomputed from token/limit/window; anvil test updated to match) |
| policy-scheme | viewing secret zeroize on error path | yes | FIXED |
| policy-scheme | meta-address unauthenticated | yes | DOCUMENTED only (no format change) |

Verification on the merged tree is in `qa-report.md` (updated). Items needing the owner: salted policyHash, defaults for M-1/M-2 options.
