# F01 — GhostTips private donations and tips

- Specification version: 1.0; prepared 2026-11-19.
- Branch: `future/f01-ghosttips`.
- Pinned source base: `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
- Status: **SPECIFICATION ONLY; implementation and release remain disabled.**
- Shared requirements: [COMMON.md](../COMMON.md); [module catalog](../README.md).
- This branch specifies a future product; it does not change current beta acceptance, production configuration, custody, fees, or deployed behavior.

## Objective and user journeys

A recipient publishes a verifiable static tip page; a donor chooses an amount and deliberately authorizes one payment. The recipient keeps their own encrypted records. No GhostPay account, public donor list, or publisher-hosted collection service is required.

1. The recipient selects an existing receive identity, defines accepted assets and amount limits, previews public fields, then exports a signed policy and static page.
2. A donor opens or imports that policy, checks its signer fingerprint, chooses a preset or custom amount, and reviews the resulting payment intent and all fees.
3. The donor explicitly opens a wallet or other approved signer. A submitted transaction remains pending until the core verifier supplies appropriate evidence.
4. The recipient may acknowledge a finalized tip and export a private receipt. Publishing aggregate progress is a separate deliberate action.

A reusable signed tip policy authenticates allowed choices. It does **not** make a donor-created request a merchant-signed invoice. The interface must distinguish policy authentication, payment-intent authorship, and chain settlement.

## Provenance and existing foundations

Original scope: [future GhostTips proposal](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/future/privacy-first/01-ghosttips.md). Current source is inspected at the pinned base; the table records available primitives, not feature qualification.

| Existing path / export | Reuse | Remaining work |
|---|---|---|
| [ux-links/src/tip.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/ux-links/src/tip.ts): `buildTipPageModel`, `tipUri`, `MAX_PRESETS` | Exact-amount selection and pure page model | Signed policy envelope and end-to-end consent lifecycle |
| [invoice-schema/src/merchantProfile.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/invoice-schema/src/merchantProfile.ts): `signMerchantProfile`, `verifyMerchantProfile` | Profile authentication through existing provider | Versioned tip-policy binding without exposing a signing key |
| [merchantTemplate.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/lib/merchantTemplate.ts): `merchantTemplateAssets`, `merchantTemplateAmount` | Asset/template interpretation | Donor-selected terms and explicit signer provenance |
| [donation/src/index.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/donation/src/index.ts): `computeDonation`, `reduceAttempt` | Review existing optional donation arithmetic and attempt semantics | Do not retarget publisher donations into recipient tips or reuse their fee assumptions |

## Scope, ownership, and dependencies

F01 owns proposed `apps/web/src/features/future/ghosttips/`, page-policy validation, donor review, public-page export, and local tip journal orchestration. It consumes providers and never implements key derivation, encryption, transaction submission, or vault storage.

Hard dependencies: [F03 payment links](https://github.com/djshellshoxxx/GhostPay/tree/future/f03-private-payment-links-spec) provides intent/share handling; [P05 encrypted state](https://github.com/djshellshoxxx/GhostPay/tree/future/p05-encrypted-local-state) persists private records. Existing core wallet and settlement interfaces remain prerequisites.

Optional integrations: [F08 GhostID](https://github.com/djshellshoxxx/GhostPay/tree/future/f08-ghostid) adds persona management; [FEE01 fee policy](https://github.com/djshellshoxxx/GhostPay/tree/future/fee01-modular-fee-policy) supplies a future paid-service quote if such a service is approved. Missing optional providers cannot silently trigger alternate services.

Excluded: recurring withdrawals, donor identity collection, public rankings, automatic social posting, custodial balances, platform-selected recipients, and anonymous-chain claims.

## Proposed versioned data model and API

These contracts are design proposals, not existing exports. Shared types are defined in COMMON; provider descriptors declare version, supported chains/assets, disclosure categories, and availability.

```ts
interface TipPolicyV1 {
  readonly schema: 'ghostpay.tip-policy/1';
  readonly policyId: string;
  readonly merchantFingerprint: string;
  readonly receiveProfileRef: string;
  readonly assetId: string;
  readonly chainId: string;
  readonly minAtomic: string;
  readonly maxAtomic: string;
  readonly presetAtomic: readonly string[];
  readonly expiresAt: number;
  readonly noteMode: 'disabled' | 'recipient-encrypted';
}
interface TipSelectionV1 {
  readonly policyDigest: string;
  readonly amountAtomic: string;
  readonly noteHandle?: SecretHandle;
}
interface GhostTipsProvider {
  readonly capability: CapabilityDescriptorV1;
  prepare(policy: unknown, selection: TipSelectionV1,
    ctx: OperationContext): Promise<ModuleResult<{ reviewId: string }>>;
  approve(reviewId: string, ctx: OperationContext):
    Promise<ModuleResult<{ intentId: string }>>;
}
```

Amounts become `bigint` only after canonical decimal-string validation; display formatting uses verified asset decimals. The authenticated envelope commits every policy field and domain/version. A local journal stores policy digest, intent ID, evidence references, and acknowledgement state inside P05 encryption. Notes remain scoped handles; URLs, logs, and JSON exports never receive plaintext notes or private keys.

## State, failure, and recovery

Policy lifecycle is draft → signed → published → expired/retired. Retirement removes local publication eligibility; already copied static files cannot be remotely revoked without an explicitly selected freshness channel.

Donor lifecycle is loaded → authenticated → selection → reviewed → awaiting signer → submitted/unknown → confirmed/failed. Each approval binds policy digest, amount, chain, asset, fee quote, destination derivation, and session epoch. Changing any term invalidates review.

Lock, account change, provider change, cancellation, or deadline expiry revokes unsubmitted work. Late asynchronous completions must check the operation ID and session epoch before installing state. An unknown broadcast outcome is reconciled by transaction evidence; it is never automatically retried as another tip. Reorgs demote confirmation and preserve the original attempt identifier.

Persist only the minimum encrypted resume journal. Unlocking does not restore signing consent. Recipient acknowledgements are independent of payment finality and cannot cause another payment.

## Validation and proposed resource budgets

- Preserve the existing maximum of six suggested amounts; require strictly ascending positive amounts within signed min/max bounds.
- Proposed policy limit: 32 KiB UTF-8, 80-character title, 500-character description, and 16 accepted asset entries. Apply stricter provider limits where applicable.
- Recipient-encrypted notes default off; proposed plaintext input ceiling is 1 KiB before encryption, with no rich HTML or active content.
- Require expiry, known schema, canonical chain/asset identifiers, valid signature, and explicit treatment of an unpinned signer. Unknown critical fields reject.
- No prefetch of recipient resources. Proposed work budget is one current review operation and one active signer request per page; bounded queued jobs reject excess input.
- New payment attempts require fresh cryptographic randomness from the existing provider; collision tests must fail closed rather than reuse an intent.

These numbers are initial implementation budgets, subject to measured mobile/browser qualification. They are not observed performance results.

## Privacy and leakage model

| Observer / event | Remaining visibility | Required behavior |
|---|---|---|
| Static page host | Visit IP, timing, public policy | No analytics, remote fonts, beacons, or personalized URLs |
| Public chain analyst | Sender, value, timing, gas relationships | Fresh stealth destination is not described as sender anonymity |
| Recipient | Chosen tip and deliberately supplied note | No default donor account or cross-tip identity field |
| Shared-device observer | Revealed page/journal | Clear private detail on lock; retain encrypted evidence only |
| Public progress viewer | Any published aggregate | Label as recipient-published, with no donor-level breakdown |

## Fees and consent

Tip amount, existing protocol fee, network gas, and any separately approved optional service charge are different line items. A tip to a recipient must never implicitly enable the publisher donation feature. No rate or recipient is selected by this specification. Free local policy creation and viewing remain usable without a GhostPay service payment. A paid optional integration stays unavailable until FEE01 returns a complete bounded quote and the donor approves it; stale quotes require review again.

## Acceptance matrix

| ID | Scenario | Required evidence |
|---|---|---|
| F01-A01 | Modified amount range or profile key | Authentication rejects before wallet access |
| F01-A02 | Six presets plus custom amount boundaries | Exact atomic arithmetic; below/above range rejected |
| F01-A03 | Two tips against one reusable policy | Distinct intent and destination derivation evidence |
| F01-A04 | Donor-selected amount | UI accurately labels policy and invoice authorship |
| F01-A05 | Lock during intent creation/sign request | No stale approval or secret-bearing state reappears |
| F01-A06 | Lost response after broadcast | Reconciliation without duplicate payment |
| F01-A07 | Duplicate scan evidence and reorg | Totals remain idempotent and can demote finality |
| F01-A08 | Optional encrypted note | No plaintext in URL, host request, wallet payload, or logs |
| F01-A09 | Optional fee absent or changed | No silent charge or recipient substitution |
| F01-A10 | Keyboard/mobile second tip | Focus, labels, amount entry, and fresh review work without reload |

## Implementation slices and verification

1. Add policy decoder and immutable view model in the owned feature directory; test signature/amount/provenance cases against injected providers.
2. Add donor review and approval coordinator; verify stale-session, edit-after-review, and uncertain-broadcast transitions with deterministic clocks.
3. Add recipient encrypted journal and acknowledgement UI; verify duplicates, reorgs, and export disclosure preview.
4. Add static export and browser journey coverage in proposed `apps/web/e2e/future-ghosttips.spec.ts`; inspect egress and accessibility across Chromium, Firefox, and WebKit.

Existing scripts verified by reading package manifests; **not executed for this documentation change**:

```sh
npm run test -w @ghostpay/ux-links
npm run test -w @ghostpay/invoice-schema
npm run typecheck -w @ghostpay/web
npm run lint -w @ghostpay/web
npm run build -w @ghostpay/web
npm run test:e2e -w @ghostpay/web
```

## Rollout, migration, rollback, and decisions

Ship behind a disabled capability flag after provider contracts and acceptance evidence are reviewed. Import existing tip configurations as unsigned drafts; never silently promote them to authenticated public policies. Migrate local records into P05 transactionally and retain a reversible pre-migration export. Disabling F01 removes creation and payment entry points while preserving receipt reading and recovery.

Owner decisions: permitted public profile fields; optional note default/retention; supported assets and networks; public aggregate-progress policy; whether any genuinely optional paid service belongs here; and final budgets. Implementation must record exact source SHA, browser matrix, privacy findings, and remaining limitations before any release proposal.
