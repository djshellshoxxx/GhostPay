# Spec: `@ghostpay/tx-review` (transaction decoder and pre-sign review)

Status: **spec only** (2026-10-21). Not implemented.

## 1. Purpose

Before any wallet prompt or local signature, turn the exact bytes about to be signed into a closed, typed description and compare it with what the user reviewed; refuse anything outside an allowlist. Today this exists only for router payments (`packages/chain-adapters/src/router.ts` `decodePaymentCalldata` / `assertPreviewMatchesCalldata`). Gaps it closes:

- S3-09: direct sweep signs `transfer(dest, balance)` to a `token` taken from (forgeable) announcement metadata, with `maxFeePerGas` = 2 x one RPC's `eth_gasPrice`, no cap, no confirmation.
- S3-19: `approve(router, gross)` is sent before the final preview and left in place on abort.
- haiku `code-tslibs` L-04: the decoder accepts `payERC20WithBuffer` calldata that the router reverts on.
- Relayed sweep and permit typed data (EIP-712) are built but not decoded back and compared before signing (haiku `security-tslibs` L-2: permit builders do not bind spender/deadline/value).

## 2. Interface (proposed)

```ts
type Intent =
  | { kind: 'router_payment'; chainId; router; token; stealth; gross; minNet; fee; metadata; ephemeralKey }
  | { kind: 'erc20_approve'; chainId; token; spender; amount }
  | { kind: 'direct_sweep'; chainId; from; token | 'native'; to; amount; maxFeePerGas; maxPriorityFeePerGas; gasLimit }
  | { kind: 'relayed_sweep_sig'; chainId; verifyingContract; owner; token; destination; amount; fee; feeTo; deadline; nonce }
  | { kind: 'permit_sig'; chainId; token; owner; spender; value; nonce; deadline };

interface ReviewPolicy {
  tokens: ReadonlyMap<chainId, ReadonlySet<address>>;   // allowlist (chain-adapters config/tokens.ts)
  contracts: { router; sweepRelayer; announcer };         // from the authenticated manifest (rank 1 in modules-needed)
  feeCaps: { maxFeePerGasWei: bigint; maxFeeShareBps: number /* of amount */ };
  feeRecipient: address;                                  // relayed sweeps: quote.feeTo must equal it (haiku M1/M2)
  maxDeadlineSeconds: number;
}

function decodeTx(tx: { chainId; to; data; value; maxFeePerGas?; gasLimit? }): Intent | Unknown;
function decodeTypedData(td: Eip712Payload): Intent | Unknown;
function review(intent: Intent, expected: Intent, policy: ReviewPolicy, now: number): ReviewResult; // ok | { reasons: ReasonCode[] }
function assertReviewed(...same): void;   // throws on any reason
function simulate?(rpcs: RpcClient[], tx): SimulationDiff;  // optional: eth_call on two providers, balance deltas of from/to/feeRecipient
```

Rules: unknown selector, unknown `to`, non-zero `value` where none is expected, token not allowlisted, spender not the manifest router, approve amount > gross, `maxFeePerGas` above cap or fee share above `maxFeeShareBps`, deadline beyond policy, chain mismatch, any field differing from `expected` -> refuse with a reason code. Decoding uses the ABIs already generated in `chain-adapters/src/abi` via `viem` `decodeFunctionData` (no new library). Display labels follow ERC-7730's idea of a per-contract, per-selector format description, but GhostPay ships its own fixed table (it only needs its four contracts plus ERC-20/2612).

## 3. Threat model

| Threat | Control | Residual |
|---|---|---|
| Attacker-chosen `token` in a direct sweep (S3-09a) | token allowlist; native vs ERC-20 decided from allowlist, never from metadata | A listed token that is itself hostile |
| Lying RPC inflates gas price (S3-09b) | absolute cap + share-of-amount cap; optional second-provider gas price | Two colluding providers |
| Preview/calldata drift (bugs, compromised code paths) | decode final bytes and compare with `expected` field by field | Compromised bundle can change both (D7); the wallet's own display is the only independent check |
| Approve before review (S3-19) | `erc20_approve` reviewed together with the payment intent; revoke helper on abort | Approval transaction remains linkable |
| Fee recipient substitution by relayer (haiku M1/M2) | `relayed_sweep_sig.feeTo == policy.feeRecipient` | Manifest must be authentic (S3-01) |
| Simulation lies | two providers, diff only informational | Simulation is never a security proof |

## 4. Test plan

Vectors: for each intent kind, golden calldata/typed data built by existing builders, decoded back (round trip); mutation tests flipping each field one at a time must yield exactly that field's reason code; unknown selectors, truncated calldata, extra trailing bytes, `value` on ERC-20 calls; S3-09 PoC (`poc-07-direct-sweep.test.ts`) converted to a passing refusal; property test: `review(decode(build(x)), x) = ok` for random valid `x`; differential test of selectors/ABI against `forge inspect` output.

## 5. Acceptance criteria

- Every signing call site in `apps/web` (pay, approve, direct sweep, relayed sweep, permit) passes through `assertReviewed` (grep-enforced CI check).
- S3-09 and S3-19 PoCs fail closed; haiku L-04 case rejected.
- Coverage 95/90/95/95; no new dependency beyond `viem` already pinned.

## 6. Sources

- ERC-7730 "Structured Data Clear Signing Format" (status Draft), <https://raw.githubusercontent.com/ethereum/ERCs/master/ERCS/erc-7730.md>, retrieved 2026-10-21: wallets match the selector from a human-readable ABI fragment and display fields such as `to` as an address "replaceable by a trusted name" and amounts formatted with token metadata.
- Repository: `docs/audits/03-security-review-client-relayer.md` S3-09, S3-19; `docs/remote/audits/code-tslibs.md` L-04 (haiku, unverified); `docs/remote/audits/security-btcapps.md` M2 and `bugs-btcapps.md` M1 (haiku, unverified).
