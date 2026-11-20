# P12 — Selective-disclosure proof provider

| Field | Value |
|---|---|
| Module | P12 / selective-disclosure-proofs |
| Feature branch | future/p12-selective-disclosure-proofs |
| Source commit | c977b5d6723f6822c3b5d86cd6b231712c53c395 |
| Specification date | 2026-11-19 |
| Status | Detailed specification only; future capability remains off |
| Hard dependencies | [P06](https://github.com/djshellshoxxx/GhostPay/blob/future/p06-key-role-separation/docs/future/modules/P06-key-role-separation/SPEC.md) |
| Optional integrations | [P13](https://github.com/djshellshoxxx/GhostPay/blob/future/p13-confidential-amounts/docs/future/modules/P13-confidential-amounts/SPEC.md), [P14](https://github.com/djshellshoxxx/GhostPay/blob/future/p14-shielded-payments/docs/future/modules/P14-shielded-payments/SPEC.md) |

[Shared contracts](../COMMON.md) and the [catalog](../README.md) are normative. APIs, budgets and planned paths below are proposed requirements, not current exports or executed qualification. Existing source paths are explicitly identified as reuse inputs. This branch authorizes no implementation, pricing, release or deployment.

## Objective and user outcomes

Expose a versioned provider for narrowly defined, selectively disclosed statements about invoices, payment evidence, ownership and, only where supported, a minimum balance. F05 owns the human workflow. This provider chooses the least complex method capable of proving the requested statement: an authenticated receipt, signature or commitment is preferred where zero knowledge adds no necessary property.

A verifier learns exactly the selected public statement, its trust assumptions and freshness. A successful verification never implies more than the registered statement semantics. Payment finality, signer identity, possession of a key and sufficient historical balance are separate claims.

## Provenance and existing code

Sources are [Privacy Suite P12](https://github.com/djshellshoxxx/GhostPay/issues/284) and [roadmap Track B](https://github.com/djshellshoxxx/GhostPay/issues/283).

| Existing source | Reuse | Gap or limit |
|---|---|---|
| [ux-receipts index](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/ux-receipts/src/index.ts) | createReceipt, parseReceipt, verifyReceipt, analyzeDisclosure | Receipt digest is a checksum; selective field removal is not a cryptographic ZK proof |
| [invoice-schema index](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/invoice-schema/src/index.ts) | Canonical signed invoices and verification | Need explicitly registered proof statements and signer-trust semantics |
| [pool-prover README](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/pool-prover/README.md) | Local worker, hash-checked artifacts, sanitized failure pattern | Pool-specific circuits are not general payment/ownership proofs; license/trust constraints remain |
| [pool-circuits interface](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/pool-circuits/INTERFACE.md) | Example of explicit public-signal ordering | Do not reuse a verifier for a different statement |

No currently listed helper establishes a qualified general proof suite. Research must compare simpler authenticated formats before selecting new circuits.

## Owned scope and semantic boundaries

Own statement registration, request normalization, proof-envelope validation, local proving adapter and verification results. P06 supplies scoped signing/key roles. Optional P13/P14 providers can supply qualified settlement facts through capability ports. P12 never owns assets, submits transactions, maintains a remote prover or silently transforms a historical fact into a current-balance assertion.

Each statement ID defines public inputs, witness source, authorizing role, network/asset, reference block/hash, validity window, challenge/audience and precise interpretation. An unknown statement is unsupported. A verifier cannot trust a proof-selected verification key or arbitrary circuit URL.

## Proposed interface and data

~~~ts
interface ProofRequestV1 {
  readonly schema: 'ghostpay.statement-request/v1';
  readonly statementId: string;
  readonly subjectRef: RecordRef;
  readonly publicInputDigest: Digest;
  readonly audience: string;
  readonly challenge: string;
  readonly expiresAtMs: number;
}
interface ProofEnvelopeV1 {
  readonly schema: 'ghostpay.proof-envelope/v1';
  readonly statementId: string;
  readonly method: 'signature' | 'commitment' | 'zk';
  readonly verifierManifestDigest: Digest;
  readonly publicInputs: readonly string[];
  readonly proofBytes: string;
}
interface ProofVerificationContextV1 {
  readonly requestDigest: Digest;
  readonly statementId: string;
  readonly audience: string;
  readonly challenge: string;
  readonly publicInputDigest: Digest;
  readonly approvedVerifierManifestDigest: Digest;
  readonly asset?: AssetRefV1;
  readonly referenceBlockHash?: string;
  readonly validAtMs: number;
  readonly maximumAgeMs: number;
  readonly replayPolicy: 'single-use' | 'reusable-evidence';
}
interface ProofVerificationResultV1 {
  readonly status: 'valid' | 'invalid' | 'unsupported' | 'indeterminate' | 'stale';
  readonly statementId: string;
  readonly reasonCode?: string;
}
interface StatementProvider {
  describe(id: string): ModuleResult<CapabilityDescriptorV1>;
  prepare(req: ProofRequestV1, ctx: OperationContext): Promise<ModuleResult<RecordRef>>;
  prove(planRef: RecordRef, ctx: OperationContext): Promise<ModuleResult<ProofEnvelopeV1>>;
  verify(proof: ProofEnvelopeV1, expected: ProofVerificationContextV1,
    ctx: OperationContext): Promise<ModuleResult<ProofVerificationResultV1>>;
}
~~~

Witness values stay in scoped worker memory. The envelope carries only approved public signals and proof material, never raw private records. Shared JSON conventions apply. Public-input order is schema-defined; arbitrary string arrays cannot bypass statement-specific decoders.

The verifier supplies expectations independently of the proof: statement, request digest, audience/challenge, approved manifest, network/asset/reference snapshot and freshness must agree before success. Fields optional in the generic context are mandatory when the registered statement requires them. The prover's private subject reference is never required by an independent verifier. For single-use challenges, an injected verifier-owned replay store atomically consumes the challenge only after all cryptographic/context checks pass. Already consumed challenges are invalid; unavailable replay state is indeterminate. Its scope and durability are explicit: a local registry does not claim global cross-device replay prevention. Reusable evidence is a separately selected policy and never authorizes a fresh payment.

## Lifecycle and failure behavior

Request → evidence checked → disclosure reviewed → local proving → locally verified → exportable. Artifact mismatch, unsupported statement, stale reference block, untrusted signer or unavailable protocol stops the flow. Lock/cancel terminates work, invalidates operation epoch and suppresses late results.

Verification returns invalid, unsupported or indeterminate distinctly. Missing chain evidence is indeterminate, not valid. Reorg or expiry invalidates dependent fresh-evidence claims. Ownership challenges are single-purpose and audience-bound; replayed demonstrations cannot authorize payments. A minimum-balance proof states the asset and reference snapshot, never a guarantee of future solvency or unspent funds.

## Resource budgets and versioning

Initial envelope cap is 256 KiB, 32 public signals and 16 KiB canonical statement metadata, subject to stricter protocol bounds. Artifact downloads require explicit size/hash/algorithm allowlists and separate consent; initial proposed cap 64 MiB per artifact and one proving worker. Display measured memory/time estimates before work; mobile capability can be unavailable rather than crash. No secret-bearing fallback to remote proving.

Benchmark 30-second user-visible timeout/cancel handling separately from cryptographic completion budgets. Termination must restore UI responsiveness; exact proof-time targets are selected after protocol/device measurement. Changes to public signals or semantics require a new statement version and compatibility vectors.

## Threat and disclosure matrix

| Observer/failure | Required protection | Residual limit |
|---|---|---|
| Verifier | Explicit public statement and minimal signals | Public inputs, audience and repeated challenges can correlate proofs |
| Untrusted proof | Approved verifier manifest and strict signal decoder | Valid proof depends on chosen circuit/setup assumptions |
| Browser/worker | No witness uploads/logs; abort and scoped lifetime | Hostile origin/device can inspect live secrets |
| Chain evidence | Block/hash/finality binding and reorg handling | A past fact may not remain current |
| Identity confusion | Separate signer possession from trusted identity | Unpinned keys establish only possession |

## Fees

Local signature verification and disclosure analysis must not require unrelated paid services. Optional paid proof functionality uses FEE01's explicit quote, never a fee for merely selecting a toggle. No fee amount or recipient is approved. P12 supplies service/method identifiers and resource estimates, not its own pricing engine.

## Acceptance cases

| ID | Case | Expected evidence |
|---|---|---|
| P12-A01 | Simple authenticated statement | Chooses an adequate signature path and identifies its trust limit |
| P12-A02 | False statement fixture | Independent verifier rejects it without private-data logging |
| P12-A03 | Public-signal reorder/substitution | Rejected by exact schema and statement binding |
| P12-A04 | Unapproved verification key | Fails before proving/verification trust is granted |
| P12-A05 | Valid proof for a different expected request, audience or challenge | Rejected; single-use challenge consumed only after successful context checks, atomically under concurrent verification |
| P12-A06 | Missing/reorged chain evidence | Indeterminate/stale; never “payment proven” |
| P12-A07 | Cancellation or lock | Worker terminates; stale completion is not exported |
| P12-A08 | Witness egress audit | No witness, key, note or decrypted invoice leaves the browser |
| P12-A09 | Mobile resource failure | Typed unavailable state; no remote fallback |
| P12-A10 | Different statement methods | Independent vectors show each verifier enforces only its declared statement |
| P12-A11 | Historical minimum balance | UI/result explicitly binds snapshot and makes no future guarantee |

## Staged implementation and checks

1. Create a statement decision ADR comparing signatures, commitments and ZK; define semantics before circuits.
2. Extend receipt/provider contract tests with source-pinned authenticated fixtures; proposed adapters belong beside ux-receipts, not in F05.
3. Add a strict proof envelope and approved artifact manifest; independent verification vectors precede a new prover.
4. Isolate worker execution and measure desktop/mobile resources, lock/cancel and zero-egress behavior.
5. Integrate F05 through the provider API; independently review cryptographic assumptions and exact source before availability.

Existing commands, not executed here:

~~~bash
npm run test -w @ghostpay/ux-receipts
npm run typecheck -w @ghostpay/ux-receipts
npm run test -w @ghostpay/invoice-schema
npm run test -w @ghostpay/pool-prover
npm run typecheck -w @ghostpay/pool-prover
~~~

The pool-prover commands validate an existing foundation only, not new P12 statements. New statement-specific commands must be added explicitly during implementation.

## Rollback and decisions

Keep legacy receipts readable and clearly label their checksum-only integrity. Never relabel them ZK proofs. Disable new proof creation without deleting saved evidence or verifier definitions needed to inspect prior proofs. Owner/reviewer decisions: first supported statements, protocol and setup, artifact trust, proof privacy semantics, license compatibility, device budgets and optional paid-service model.

