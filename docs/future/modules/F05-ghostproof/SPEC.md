# F05 — GhostProof selective-disclosure evidence workflow

- Specification version: 1.0; prepared 2026-11-19.
- Branch: `future/f05-ghostproof`.
- Pinned source base: `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
- Status: **M1 offline receipt review implemented; full proof workflow and release remain disabled.**
- Shared requirements: [COMMON.md](../COMMON.md); [module catalog](../README.md).
- This future workflow does not modify current beta gates, deployed behavior, or existing fee decisions.

## Implementation checkpoint — 2026-11-20

The first implementation slice is now available in
`apps/web/src/features/future/ghostproof/`: a bounded offline verifier for existing
unsigned digest receipts and signed seller receipts, immutable disclosure reviews,
and a cancellable import session. It reuses existing receipt providers and adds
no cryptographic format, network lookup, storage or production entry point.

Product source: `726d16dc560f8b12e4c71f6c04895fd1dcbd34f4`.
[The source-pinned handoff](HANDOFF.md) records acceptance coverage and remaining
work. This completes the existing-format assurance adapter, not the P12 proof
provider, evidence-generation/export workflow or full F05 feature.

## Objective and user journeys

Let a user disclose a narrowly defined claim about a payment, invoice, or controlled key through a portable evidence package. A verifier receives an accurate description of what was checked, what remains unknown, and which information was revealed.

1. Issuer selects evidence from an unlocked local profile and chooses a supported claim and audience.
2. The UI previews exact public fields, challenge, expiry, verification mode, and privacy limitations before generation.
3. The provider produces evidence locally using scoped authority; issuer explicitly exports or shares the package.
4. A verifier imports it offline, checks supported cryptographic claims, and separately opts into any chain lookup needed for freshness or finality.

A checksum, valid signature, verified chain observation, and zero-knowledge proof are distinct assurance levels. F05 must never upgrade a display label merely because a file has a digest or a provider returned bytes.

## Source provenance and current foundations

Scope: [original GhostProof proposal](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/future/privacy-first/05-ghostproof.md).

| Verified source | Reuse | Gap / distinction |
|---|---|---|
| [ux-receipts/src/index.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/ux-receipts/src/index.ts): `createReceipt`, `analyzeDisclosure`, `parseReceipt`, `renderJson` | Field-selection and disclosure presentation | Claim-oriented proof workflow and independent verifier UX |
| [ux-receipts/src/verify.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/ux-receipts/src/verify.ts): `verifyReceipt` | Explicit `self_consistent_unverified` and chain-result distinctions | This digest-based format explicitly has no signature; never call it ownership proof |
| [invoice-schema/src/receipts.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/invoice-schema/src/receipts.ts): `signReceipt`, `verifyReceipt`, `bindReceiptToInvoice` | Existing signed receipt and invoice-binding format | Selective claims and audience/challenge policy |
| [receipts.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/receipts.ts): `parseVerifiedReceipt`, `receiptBindingForInvoice` | Current browser binding adapter | Isolated proof preparation and export lifecycle |

The two `verifyReceipt` exports live in different packages and provide different assurances; adapters must preserve that distinction.

## Module ownership and dependencies

Own proposed `apps/web/src/features/future/ghostproof/`: claim chooser, disclosure preview, proof package coordinator, verifier presentation, and export flow.

Hard dependencies: [P12 selective-disclosure provider](https://github.com/djshellshoxxx/GhostPay/tree/future/p12-selective-disclosure-proofs) supplies reviewed claim formats and local generation/verification; [P05 encrypted state](https://github.com/djshellshoxxx/GhostPay/tree/future/p05-encrypted-local-state) holds evidence and private drafts.

Optional: [P14 shielded payments](https://github.com/djshellshoxxx/GhostPay/tree/future/p14-shielded-payments) contributes supported shielded claims; [FEE01](https://github.com/djshellshoxxx/GhostPay/tree/future/fee01-modular-fee-policy) handles any separately approved service charge. No dependency on a public proof registry or remote prover is introduced.

Excluded: proving complete financial history, legal identity, delivery of goods, fiat settlement, anonymity of public transactions, or inventing new cryptographic circuits in a product UI module.

## Proposed data model and API

```ts
interface ProofRequestV1 {
  readonly schema: 'ghostpay.proof-request/1';
  readonly claimId: string;
  readonly evidenceRefs: readonly string[];
  readonly discloseFields: readonly string[];
  readonly audience: string;
  readonly challenge: string;
  readonly expiresAt: number;
}
interface ProofPackageV1 {
  readonly schema: 'ghostpay.proof-package/1';
  readonly providerId: string;
  readonly claimVersion: string;
  readonly requestDigest: string;
  readonly publicStatement: Readonly<Record<string, string>>;
  readonly artifactDigest: string;
  readonly assurance: 'signed-statement' | 'zk-statement';
}
interface GhostProofProvider {
  readonly capability: CapabilityDescriptorV1;
  preview(request: ProofRequestV1, ctx: OperationContext):
    Promise<ModuleResult<{ previewId: string; disclosedFields: readonly string[] }>>;
  generate(previewId: string, ctx: OperationContext):
    Promise<ModuleResult<{ package: ProofPackageV1; artifact: SecretHandle }>>;
  verify(artifact: SecretHandle, ctx: OperationContext):
    Promise<ModuleResult<{ claims: readonly string[]; caveats: readonly string[] }>>;
}
```

These proposed types import COMMON contracts. A provider capability advertises exact claim IDs, proof format/version, verifier identity, maximum sizes, and whether chain freshness is needed. Amount fields in statements use canonical decimal strings and explicit assets; calculations use `bigint`.

Witnesses, spending/viewing secrets, and unselected history never enter serialized public statements. A provider gets scoped access to only the selected evidence and key role. Artifact bytes are released through controlled callbacks, not logged or broadcast automatically.

## Lifecycle and failure/recovery

Draft → evidence validated → disclosure preview → approved → generating → generated → exported. Verification is a separate flow: bounded import → format/authentication check → claim verdict → optional chain freshness check.

Preview consent binds evidence revision, claim, audience, challenge, public fields, provider/verifier version, expiry, and any fee quote. Editing any component or receiving a new evidence revision invalidates approval. Lock, session change, or cancellation aborts workers and prevents stale results from being published; retain only encrypted resumable drafts, never witnesses.

A failed provider returns a typed error such as unsupported claim, evidence insufficient, invalid proof, expired challenge, resource limit, stale session, or provider unavailable. Unsupported verification is not “valid.” Offline signature/proof validity does not imply the transaction is currently final; report the checked block/reference and freshness separately.

If a proof has already been exported, local deletion cannot revoke the recipient's copy. An audience/challenge can restrict a verifier's acceptance policy but cannot prevent the recipient redistributing disclosed facts. Resume generation only after fresh consent and evidence validation.

## Validation and proposed bounds

- Initial request ≤64 KiB; ≤32 evidence references; ≤32 disclosure fields; audience ≤256 UTF-8 bytes; challenge exactly the provider-approved bounded nonce format.
- Proposed proof artifact cap 8 MiB with bounded decoding and verification; providers may declare lower caps. No automatic verifier-code download from artifact URLs.
- Initial generation budget: one local worker, visible cancel, 60-second soft timeout and explicit device-qualified memory ceiling. Larger work needs a documented capability profile.
- Enforce domain/version, exact audience/challenge, expiry, selected chain/asset, and canonical statement encoding before accepting a claim.
- Unknown algorithms, circuit identifiers, verifying keys, and critical fields reject. Locally pinned provider descriptors establish allowed verifiers.
- Reorged or insufficiently confirmed evidence cannot prove a stronger settlement claim; either refuse or offer a separately labeled weaker claim.

## Privacy and threat table

| Party / event | Remaining disclosure | Required presentation/control |
|---|---|---|
| Verifier | All public statement fields and repeatable identifiers | Exact pre-export field preview; minimize stable identifiers |
| RPC provider | Selected transaction lookup when enabled | Explicit separate lookup consent; offline default |
| Proof recipient | Can copy package and disclosed facts | Do not promise file revocation or nontransferability |
| Local machine | Witness during generation | Scoped secret access, worker disposal, no crash dumps |
| Public-chain observer | Existing transparent settlement graph | Proof privacy does not rewrite the chain |

## Fee behavior

Viewing, importing, and offline verification are local functions with no new protocol charge. Any paid claim-generation service requires an approved defined service and complete FEE01 quote; P12 may offer free local generation. Quote display separates base protocol, feature, network, and third-party fees. No fee is charged on a failed preview, unsupported claim, or absent consent. This specification chooses neither rates nor recipients and does not transmit a witness to obtain a quote.

## Acceptance matrix

| ID | Case | Required result |
|---|---|---|
| F05-A01 | Digest-only receipt imported | Self-consistent/unverified label, never ownership proof |
| F05-A02 | Signed receipt with wrong invoice/asset | Binding rejection |
| F05-A03 | Proof audience/challenge changed | Verification fails the intended acceptance policy |
| F05-A04 | Redacted field or amount tampered | Artifact authentication/claim verification rejects |
| F05-A05 | Offline verifier used | Zero network requests and explicit freshness limits |
| F05-A06 | Optional chain check unavailable | Unknown freshness, not successful settlement |
| F05-A07 | Lock during generation | No stale proof export or retained witness |
| F05-A08 | Unsupported verifier or oversized artifact | Bounded rejection before expensive work |
| F05-A09 | Reorged evidence selected | Strong settlement claim unavailable |
| F05-A10 | Disclosure preview changed after approval | Generation/export blocked until renewed consent |

## Implementation slices and existing checks

1. Claim/assurance taxonomy and provider adapter in owned paths; verify current receipt formats are classified accurately.
2. Evidence selection and field-preview UI with immutable approval; verify secret/minimal-history boundaries.
3. Cancellable local generation/export and independent import verifier; verify worker cleanup and unsupported formats.
4. Proposed `apps/web/e2e/future-ghostproof.spec.ts`, provider vector tests, and mobile resource measurements; independent cryptographic review belongs to P12 before activation.

These scripts exist in inspected manifests; **none was executed for these documentation changes**:

```sh
npm run test -w @ghostpay/ux-receipts
npm run test -w @ghostpay/invoice-schema
npm run typecheck -w @ghostpay/web
npm run lint -w @ghostpay/web
npm run build -w @ghostpay/web
npm run test:e2e -w @ghostpay/web
```

## Rollout, rollback, and owner questions

Default disabled. Existing receipts remain readable in their original assurance class; migration never changes a digest receipt into a signed or ZK proof. Gate each claim/provider independently and make unsupported claims unavailable. Rollback disables new generation while retaining compatible verification and encrypted recovery material.

Owner decisions: first supported claims, audiences/challenge conventions, freshness policy, approved proof providers, paid-service scope, and resource budgets. Publish exact-head verification evidence and honest caveats before release. A general “proof verified” green indicator is insufficient without the actual statement and assurance level.
