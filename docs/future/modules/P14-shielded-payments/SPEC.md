# P14 — Non-custodial shielded payment research

| Field | Value |
|---|---|
| Module | P14 / shielded-payments |
| Feature branch | future/p14-shielded-payments |
| Source commit | c977b5d6723f6822c3b5d86cd6b231712c53c395 |
| Specification date | 2026-11-19 |
| Status | Detailed specification only; future capability remains off |
| Hard dependencies | [P13](https://github.com/djshellshoxxx/GhostPay/blob/future/p13-confidential-amounts/docs/future/modules/P13-confidential-amounts/SPEC.md), [P06](https://github.com/djshellshoxxx/GhostPay/blob/future/p06-key-role-separation/docs/future/modules/P06-key-role-separation/SPEC.md) |
| Optional integrations | [P09](https://github.com/djshellshoxxx/GhostPay/blob/future/p09-noncustodial-gas-services/docs/future/modules/P09-noncustodial-gas-services/SPEC.md), [P10](https://github.com/djshellshoxxx/GhostPay/blob/future/p10-private-submission/docs/future/modules/P10-private-submission/SPEC.md) |

[Shared contracts](../COMMON.md) and the [catalog](../README.md) are normative. APIs, budgets and planned paths below are proposed requirements, not current exports or executed qualification. Existing source paths are explicitly identified as reuse inputs. This branch authorizes no implementation, pricing, release or deployment.

## Objective and research boundary

Define an optional shielded payment provider with local key/witness control, recoverable private notes and exact settlement evidence. Sender, recipient and amount confidentiality may be claimed only to the extent the selected protocol proves them under its documented observer model. A stealth destination or an ordinary pool withdrawal is not automatically a private internal transfer.

Initial delivery is a protocol/trust ADR plus isolated local fixtures, not production deployment. Prefer integration of a qualified existing protocol where it satisfies recovery, custody and fee constraints. Keep the default Pages application independent of any pool, indexer or relay.

## Source evidence and prior work

Requirements come from [P14](https://github.com/djshellshoxxx/GhostPay/issues/284), [roadmap Track D](https://github.com/djshellshoxxx/GhostPay/issues/283), and architecture 5j.

| Source at the pin | Existing foundation | Future gap |
|---|---|---|
| [pool-sdk index](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/pool-sdk/src/index.ts) | Note derivation, encrypted records, sync, recovery, deposit/withdrawal plans | General private internal-spend semantics and qualified protocol integration must be established |
| [pool-circuits interface](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/pool-circuits/INTERFACE.md) | Explicit public signal/witness contract | Current development-ceremony artifacts are not eligible for real value |
| [pool-prover README](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/pool-prover/README.md) | Local proof worker, artifact hash validation | Browser performance, license, ceremony and independent audit are unresolved gates |
| [pool-contracts README](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/pool-contracts/README.md) | Testnet-only deposit/withdraw/ragequit and nullifier state | Not qualified production or evidence of anonymous payments |
| [external-pools index](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/external-pools/src/index.ts) | AdapterRegistry, planRoute, accounting, recovery | Shipped adapters' manifest/availability limits must remain enforced |

No current testnet artifact or mock becomes production-eligible by renaming its capability.

## Ownership and dependency contract

P14 owns protocol instance selection, encrypted note lifecycle, membership/nullifier synchronization, private-spend preparation and evidence reconciliation. P13 supplies a compatible amount-confidentiality contract; this can be a semantic adapter within the same protocol, not an extra mandatory asset-wrapping transaction. P06 supplies key roles. P09/P10 are optional execution transports.

P15 owns public exits; P17 owns private fee-output integration; FEE01 owns charge authorization. P14 must expose sufficient read-only recovery and evidence ports without importing those consumers. Contract deployments, custody changes, new circuit design and protocol upgrades are outside this specification-only task.

## Proposed data and API

~~~ts
interface ShieldedNoteRefV1 {
  readonly schema: 'ghostpay.shielded-note-ref/v1';
  readonly protocolInstance: Digest;
  readonly asset: AssetRefV1;
  readonly encryptedRecordRef: RecordRef;
  readonly revision: number;
}
interface ShieldedSpendPlanV1 {
  readonly planDigest: Digest;
  readonly inputRefs: readonly RecordRef[];
  readonly publicEffects: readonly string[];
  readonly recoveryCheckpoint: RecordRef;
}
interface ShieldedProvider {
  sync(ctx: OperationContext): Promise<ModuleResult<RecordRef>>;
  preparePrivateSpend(intentRef: RecordRef, ctx: OperationContext):
    Promise<ModuleResult<ShieldedSpendPlanV1>>;
  reconcile(planDigest: Digest, ctx: OperationContext):
    Promise<ModuleResult<{ state: 'pending' | 'unknown' | 'verified' | 'reorged' | 'reverted' }>>;
  exportRecovery(ctx: OperationContext): Promise<ModuleResult<RecordRef>>;
}
~~~

Note secrets, plaintext values and witnesses are confined to the provider's encrypted/private domain. Public references cannot reveal a stable user's entire note set. Record bindings include protocol instance, chain/genesis, asset, schema, key role and revision. Shared monetary rules apply.

## State machine and invariant requirements

Note states: observed-unverified → confirmed-unspent → reserved → spend-pending/unknown → spent, with reorg rollback and quarantined/conflicted states. Reservations use atomic revisions and expire only after proving no external effect. An unknown submission cannot release a note for a second independent spend.

Protocol invariants include membership in an accepted state, authorization by the user, unique spent nullifiers, correct value ranges, conservation including fees/change, domain separation and authenticated encrypted outputs. Proving, public-signal validation and contract interpretation must share independent vectors. A locally accepted proof is insufficient without the approved verifier/state context.

Persist recovery material before committing value to a new note. Reload restores encrypted state and re-syncs chain evidence before spending. Lock kills proof workers and signing capabilities while preserving recovery journals. An indexer outage must allow user-selected independent state recovery where the protocol supports it; otherwise disclose and block adoption.

## Bounds and resource management

Begin with one qualified protocol instance, network and asset, one active spend, and a proposed maximum 8 note inputs/8 outputs per plan subject to stricter circuit limits. Bound event ranges, encrypted record size, queue depth, artifact bytes and worker memory. Initial note-record cap 16 KiB; import uses streaming batches of at most 1,000 records. Large balances/history must be paginated, never copied wholesale into UI.

Proving estimates and actual device support are measured. Unsupported mobile resources fail before witness construction, with recovery available. No hidden remote proving, unbounded tree sync or public address-targeted fallback.

## Threat and leakage matrix

| Boundary | Required treatment | Residual exposure |
|---|---|---|
| Public chain | Distinguish private internal spends from transparent entry/exit | Deposit/exit amounts, timing, contract use and gas can correlate activity |
| Indexer/relay | Explicit choice, bounded requests, local notes/witnesses | IP, request timing and protocol access may be observable |
| Protocol operator | Document upgrade, control, asset custody and escape properties | Contract-held assets can have failure/control risks despite local keys |
| Note backup | Authenticated encryption, independent restore, no silent deletion | Lost sole recovery material can make notes unrecoverable |
| Proof artifacts | Approved ceremony/audit/hash/version only | Assurance is limited by cryptographic and implementation assumptions |
| Concurrent device | Reservation plus chain nullifier reconciliation | Offline device locks alone cannot guarantee exclusive spending |

## Fees

P14 reports available fee representations and exact public/private effects to FEE01. Existing base fee policy stays intact. A protocol that cannot enforce approved fees without violating recovery or privacy requirements is unsupported pending a decision. No fee recipient, price, note-policy or collection contract is chosen here.

## Acceptance requirements

| ID | Scenario | Expected result |
|---|---|---|
| P14-A01 | Unqualified mock/dev artifacts | Capability remains fixture-only; real-value paths unavailable |
| P14-A02 | Invalid conservation or range | Independent vectors rejected by provider and verification boundary |
| P14-A03 | Reused nullifier/concurrent note | No second authorized spend; conflict retained for reconciliation |
| P14-A04 | Wrong protocol/network/asset | Reject before witness generation |
| P14-A05 | Crash after intent, before result | Resume reconciles once; never blindly resubmits |
| P14-A06 | Chain reorg | Note/spend observations roll back safely without deleting recovery |
| P14-A07 | Clean-device recovery | Recover supported notes and change lineage from independent encrypted backup |
| P14-A08 | Relay/indexer absent | Supported direct recovery works; unsupported dependency disclosed before deposit |
| P14-A09 | Lock during proving | Worker and stale secret-bearing results are invalidated |
| P14-A10 | Private-send claim | End-to-end trace demonstrates selected protocol properties and remaining leaks |
| P14-A11 | P13 composition | No unintended extra wrapper or fee introduced by the semantic provider boundary |

## Implementation slices and actual commands

1. Protocol selection and trust/custody/recovery ADR, with explicit comparison to current pool prototypes.
2. Reconcile note/key/public-signal schemas and independent vectors; keep research guards unchanged.
3. Implement encrypted lifecycle/reservation/reorg handling in the selected provider lane, with injected fake chain.
4. Integrate approved local prover and measure browser resource/cancellation behavior.
5. Add actual protocol and recovery acceptance, independent review and source-pinned capability evidence.

Existing foundation checks, not run by this documentation task:

~~~bash
npm run test -w @ghostpay/pool-sdk
npm run typecheck -w @ghostpay/pool-sdk
npm run test -w @ghostpay/pool-circuits
npm run test -w @ghostpay/pool-prover
npm run test -w @ghostpay/external-pools
forge test --root packages/pool-contracts
~~~

## Migration, rollback and decisions

No automatic migration between pools, circuits, seeds or assets. Pin old protocol decoders and recovery metadata while disabling new deposits/spends after a capability withdrawal. Recovery/inspection remains reachable. Open choices: protocol, trusted setup, asset policy, direct recovery route, minimum device support, audit/license conditions, fee compatibility and a separately approved testnet/release plan.

