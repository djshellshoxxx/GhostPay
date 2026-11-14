# Experimental policy deployment and payment evidence — 2026-11-09

Base: PR #89, `cfc7b0f3325a550df830584e86db4c38bcc9d6b2`.
Owner: policy evidence lane; integration coordinator owns publication.

## Implemented boundaries

`verifyPolicyDeployment` no longer authenticates pasted addresses using code presence and matching
getters. It requires an explicit trusted `PolicyDeploymentProfile`; the shipped map remains empty.
The feature remains disabled by default, and even a manually enabled build refuses unpinned addresses.
No production/testnet trust root, fee, manifest, workflow or contract changed.

Profiles bind chain, deployment origin, factory/router/implementation/announcer runtime code hashes,
fee parameters and approved assets. Test-only profiles are dependency-injected, never accepted through
imports or invoice fields. Reads use EIP-1898 block hashes with `requireCanonical: true`, bracketed by
chain-ID and canonical-block checks. Disabled testnets and mainnets are rejected. Public profile data
is copied/frozen before asynchronous reads; addresses are normalized. Asset profiles support native
value or explicitly pinned, non-proxy exact-transfer ERC-20 code. Getters alone cannot authenticate
compatible malicious bytecode. RPCs without historical EIP-1898 support fail closed.

`paymentEvidence.ts` is a separate, bounded verifier. It never updates ordinary invoice, receipt,
reconciliation or scanner payment state. The caller supplies an independently known expected token
and exact net amount. The verifier authenticates the deployment at the announcement block and checks:

- Transaction, receipt and every log's canonical block/transaction identity; successful receipt;
  exact chain, direct router destination, payer and position.
- Only direct `payNative` or `payERC20` with canonical re-encoded calldata. Indirect, permit and buffer
  methods remain unsupported here even though the experimental sender supports other methods.
- Exact locally derived owner, policy, account, ephemeral key and metadata; one announcement from
  the authenticated announcer with the router as its caller.
- Native `tx.value`, exact router fee/net computation and successful authenticated router execution.
  Native balance is never used as payment proof. ERC-20 also requires exact payer-to-account and
  payer-to-fee-recipient Transfer logs from an approved code-pinned asset, with no extra transfers.
- Bounded calldata/log sizes and receipt count, configured finality, final canonical block/head and
  chain rechecks. Unknown provider failures return fixed unverified reasons, never raw errors.

Evidence identity is `chainId:transactionHash` because supported transactions contain one direct
payment. The seen set is advisory, not a reservation: accepting consumers must atomically deduplicate
by evidence identity. `mergePolicyPaymentEvidence` removes old reorged observations before accepting
newly reverified replacements. `isPolicyEvidenceBlockCanonical` only invalidates already-trusted
in-memory evidence; it cannot authenticate imported/persisted fields. Persisted data must run the
full verifier again before status reuse. No consumer currently credits these results.

## Acceptance matrix

| Boundary | State | Evidence / remaining gate |
| --- | --- | --- |
| Explicit profile, code identity, all linked getters, coherent block | Implemented and locally validated | Adversarial unit tests and real Anvil runtime mutation retaining compatible getters |
| Chain drift, disabled/mainnet, reorg, malformed/oversized RPC responses | Implemented and locally validated | Refusal tests; canonical snapshot recheck |
| Native and exact-transfer ERC-20 direct payment verification | Implemented and locally validated | Real deployed router receipts plus synthetic adversarial tests |
| Duplicate and reorg lifecycle | Implemented as isolated primitives | Transaction identity, final duplicate check, pure atomic-merge input, canonical invalidation tests |
| Ordinary paid/receipt/reconciliation integration | Intentionally not enabled | Needs complete scheme-2 request format and full product boundary qualification |
| Published authenticated deployment / asset profiles | Externally blocked | No authorized deployment identities or audit evidence; shipped pins remain empty |
| Permit, gas-buffer, indirect execution, proxy/rebasing/fee-on-transfer assets | Unsupported by verifier | Remain unverified; no inference from balance or announcement |
| Live public testnet qualification | Externally blocked | Requires approved deployment/asset identity; local addresses and code hashes are fixtures only |

## Validation

The coordinator's final handoff records exact integrated source SHA and combined results. Lane validation
uses Node 24.22.1, npm 11.9.0, Vitest 5.0.5, Foundry/Anvil 1.8.5 and Solc 0.8.28.

- `npm ci --ignore-scripts`, `npm run build:libs`, web typecheck and policy-directory ESLint.
- `forge build --use /home/agent/.local/share/svm/0.8.28/solc-0.8.28` in this worktree's unchanged core
  contracts produces current local fixtures. No generated artifact is committed.
- Focused deployment/payment/logic/scope/more tests, plus `paymentEvidence.anvil.test.ts`: **135 passed, 6 files, no skips**, with
  `ANVIL_BIN=/workspace/scratch/0eeb5e74bd49/tooling/anvil REQUIRE_ANVIL=1`, so missing fixtures are
  failures during qualification rather than silently skipped.
- Real Anvil tests deploy the exact source contracts, qualify native/ERC-20 receipts, revert mined
  evidence and reject getter-compatible altered router runtime. Keys are public repository test
  vectors on a disposable local chain. Fixture hashes are computed within the local deployment test;
  they are never published as application trust roots.

The new unpinned refusal test was executed on pristine `cfc7b0f` with test-only fixture overlay: **1 failed as expected, 28 filtered out**. It fails before this implementation (the previous verifier accepts the
getter-compatible fixture). Native/ERC-20 Anvil tests initially exposed a lower-case address in the
local fixture; the fixture and authenticated result now normalize addresses. No production sending
or signing semantics were loosened to make the test pass.
