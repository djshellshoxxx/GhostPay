# P13 — Confidential amount settlement research

| Field | Value |
|---|---|
| Module | P13 / confidential-amounts |
| Feature branch | future/p13-confidential-amounts |
| Source commit | c977b5d6723f6822c3b5d86cd6b231712c53c395 |
| Specification date | 2026-11-19 |
| Status | Detailed specification only; future capability remains off |
| Hard dependencies | [P06](https://github.com/djshellshoxxx/GhostPay/blob/future/p06-key-role-separation/docs/future/modules/P06-key-role-separation/SPEC.md) |
| Optional integrations | None |

[Shared contracts](../COMMON.md) and the [catalog](../README.md) are normative. APIs, budgets and planned paths below are proposed requirements, not current exports or executed qualification. Existing source paths are explicitly identified as reuse inputs. This branch authorizes no implementation, pricing, release or deployment.

## Research objective and required decision

Specify an optional settlement capability that can conceal transaction amounts under a documented protocol model. Ordinary transparent ETH/ERC-20 transfer amounts remain public; a browser proof alone cannot change their settlement semantics. This module must select and qualify a suitable asset/protocol adapter before any user-facing confidential-amount claim.

The output of the initial phase is a protocol-comparison ADR, exact asset representation, audited trust assumptions, recovery analysis and local fixtures. It is not a new production token, deployed contract or permission to hold real value. P14 consumes the amount-confidentiality capability only if its independently chosen protocol actually composes with it.

## Provenance and existing foundations

Sources: [issue #283 Track C](https://github.com/djshellshoxxx/GhostPay/issues/283), [P13](https://github.com/djshellshoxxx/GhostPay/issues/284), and architecture 5j.

| Source | Existing functionality | Required qualification gap |
|---|---|---|
| [confidential-amounts index](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/confidential-amounts/src/index.ts) | ConfidentialBackend, getBackend, metadata helpers, DecryptScheduler | Compare existing FHE adapter semantics with requested ZK/commitment capability; no equivalence assumption |
| [confidential-amounts deviations](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/confidential-amounts/DEVIATIONS.md) | Lists unpinned deployment hashes, runtime/transport and compatibility limits | Resolve each applicable gap before any qualified availability |
| [confidential-contracts README](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/confidential-contracts/README.md) | Testnet FHE router/wrapper prototype | Not deployed/audited production confidential settlement |
| [external-pools types](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/external-pools/src/types.ts) | Existing protocol adapter boundary | Reuse relevant capability/trust patterns, not incompatible proof formats |

A cleartext test double provides no confidentiality. Existing FHE decryption/operator assumptions differ from a ZK shielded note system and must be labeled accurately.

## Owned scope and exclusion

Own protocol-neutral amount capability negotiation, asset representation, commitments/encrypted values, approved artifact/manifests, local preparation and exact settlement-evidence interpretation. P06 supplies roles; P14 owns shielded note/spend workflow; P15 owns exits; FEE01 owns price/authorization. Contracts, new cryptography and protocol activation require separate accepted design and audit.

No generic “hide amount” checkbox may silently wrap assets, accept issuer/operator authority, change chain or perform a deposit. Show source asset, represented asset, deposit/exit behavior, supported participants and all control assumptions before any subsequent authorization.

## Proposed interface and invariant model

~~~ts
interface ConfidentialAssetV1 {
  readonly schema: 'ghostpay.confidential-asset/v1';
  readonly asset: AssetRefV1;
  readonly protocolId: string;
  readonly manifestDigest: Digest;
  readonly confidentiality: 'commitment-zk' | 'fhe';
  readonly trustStatementIds: readonly string[];
}
interface ConfidentialPlanV1 {
  readonly planDigest: Digest;
  readonly asset: ConfidentialAssetV1;
  readonly privateIntentRef: RecordRef;
  readonly publicEffects: readonly string[];
  readonly recoveryRef: RecordRef;
}
interface AmountSettlementProvider {
  capabilities(): readonly CapabilityDescriptorV1[];
  prepare(intentRef: RecordRef, ctx: OperationContext):
    Promise<ModuleResult<ConfidentialPlanV1>>;
  verifyEvidence(evidenceRef: RecordRef, ctx: OperationContext):
    Promise<ModuleResult<{ state: 'verified' | 'unknown' | 'reverted'; planDigest: Digest }>>;
}
~~~

Amounts are private input references, not public DTO fields. The protocol ADR defines range, commitment binding/hiding, randomness, serialization, authorization and conservation of assets: inputs equal outputs plus authorized fees/change with no overflow or inflation. P13 does not invent a new formula or reuse a commitment outside its approved domain.

## Lifecycle, error and recovery

Unavailable → research-qualified → prepared → reviewed → authorized → submitted/unknown → verified or reverted. No positive evidence is derived solely from a transaction hash, SDK success or ciphertext handle. Some protocols can return an apparent success with zero actual delivery; verify the authorized amount and recipient using protocol-specific evidence.

Unknown manifests, unpinned code, unapproved assets, incompatible decoder, absent recovery material, resource exhaustion or private-required transport failure halt preparation. Account/chain/policy changes invalidate reviews. Local cancellation discards unsent work but preserves submitted-state evidence. Reorgs roll verified observations back to pending and trigger reconciliation.

Before a deposit or wrap, require an independently recoverable plan for protocol outage, restricted decryption, asset migration and contract failure. A guarantee unsupported by the selected protocol is a blocking incompatibility, not a documentation substitute.

## Resource and input constraints

Research starts with one network and one explicitly approved asset; no broad auto-discovery. Cap new metadata to 64 KiB and ciphertext/proof envelopes to 1 MiB unless reviewed protocol bounds are lower. Artifact downloads are hash/size pinned and user-consented. One worker/proving job per unlocked session; benchmark desktop and constrained mobile memory before declaring support.

Reject incompatible numeric ranges, unsupported token behaviors, wrong asset identifiers and missing circuit/backend version. No network-dependent verification key or unbounded SDK asset download during import. Target responsive progress/cancel within 250 ms even when cryptographic work takes longer; this is proposed acceptance, not measured performance.

## Threat and leakage table

| Party or boundary | Protection requirement | Remaining exposure |
|---|---|---|
| Public observer | Only claim amount secrecy where settlement protocol enforces it | Deposits/exits, contracts, timing, gas and participant addresses may remain visible |
| Cryptographic operator | Publish actual decryption/setup authority | FHE/committee misconduct differs from ZK assumptions |
| Browser | Local witnesses/amount encryption and scoped secrets | Compromised device/origin can see inputs |
| Asset issuer/contract | State custody, freeze, upgrade and solvency assumptions | User-held keys do not remove contract/issuer control |
| Fee recipient | Separate authorized fee view from full payment details | Amount ratios and collection patterns can reveal information |

## Pricing and consent

P13 provides cost and leakage inputs to FEE01. No new confidential-transfer charge, recipient or collection mechanism is selected. Transparent fee payments must not be disguised as private. If a fee cannot be represented and enforced under the selected protocol, return unsupported rather than silently use a revealing alternative.

## Acceptance matrix

| ID | Scenario | Required result |
|---|---|---|
| P13-A01 | Transparent ETH/ERC-20 route | No confidential-amount claim or synthetic success |
| P13-A02 | Cleartext test double | Always labeled fixture-only with no privacy claim |
| P13-A03 | Conservation/range vectors | Independent checks reject invalid value relations and out-of-range values |
| P13-A04 | Wrong asset/domain/manifest | Rejected before signing or witness generation |
| P13-A05 | Changed verifier/backend artifact | Integrity failure; no unpinned fallback |
| P13-A06 | SDK success with insufficient delivery | Remains failed/unknown until exact settlement is established |
| P13-A07 | Device or protocol outage recovery | Independent documented recovery works on supported fixtures |
| P13-A08 | Key/witness trace | No sensitive witness or amount plaintext reaches unauthorized infrastructure |
| P13-A09 | Reorg and delayed decryption | Evidence state rolls back; no duplicate settlement |
| P13-A10 | Fee incompatibility | Unsupported result; no fee rule bypass or public fallback |
| P13-A11 | Browser cancellation | Stale proof/decrypt result cannot enter a new identity session |

## Implementation sequence and verification

1. Compare audited existing protocols against required confidentiality, recovery, fee and custody properties; record rejected options.
2. Preserve and compare the current FHE adapter; design a narrow provider contract and independent fixtures.
3. Qualify asset/accounting invariants, manifests and evidence interpretation on a local isolated test environment.
4. Measure local cryptographic execution and supported browsers; integrate P14 only through compatible capabilities.
5. Obtain independent protocol/contract/cryptography review and exact-source evidence before a separately authorized testnet phase.

Existing commands below exercise current foundations only; none was executed by this spec task:

~~~bash
npm run test -w @ghostpay/confidential-amounts
npm run typecheck -w @ghostpay/confidential-amounts
npm run lint -w @ghostpay/confidential-amounts
npm run compile -w @ghostpay/confidential-contracts
npm run test -w @ghostpay/confidential-contracts
~~~

## Rollback and open decisions

Disable new confidential deposits/preparation without removing inspectors, old decoders, export or recovery. Never migrate held assets automatically. Open decisions include protocol, represented assets, custody/control assumptions, setup and artifact policy, decryption availability, fee design, licensing, independent audit and device support. No deployment or real-funds authorization is implied.

