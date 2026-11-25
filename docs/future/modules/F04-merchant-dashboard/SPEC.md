# F04 — Private local merchant dashboard

- Specification version: 1.0; prepared 2026-11-19.
- Branch: `future/f04-merchant-dashboard`.
- Pinned source base: `c977b5d6723f6822c3b5d86cd6b231712c53c395`.
- Status: **M1 projection/selector implementation exists in isolation; product activation and release remain disabled.** See [HANDOFF.md](HANDOFF.md).
- Shared requirements: [COMMON.md](../COMMON.md); [module catalog](../README.md).
- This future workflow does not modify current beta gates, deployed behavior, or existing fee decisions.

## Objective and user journeys

Give a merchant a useful local view of invoices, independently observed payments, unresolved transactions, and bookkeeping exports while keeping business records encrypted on their device. The dashboard must explain uncertainty instead of converting every matching announcement into a sale.

1. Merchant unlocks an encrypted profile and sees summary totals partitioned by chain, asset, evidence state, and reporting period.
2. Merchant searches invoice aliases or filters pending, partial, final, late, and unmatched payments; opening a row shows the evidence and exact accounting that produced its status.
3. Merchant requests a bounded rescan through the selected scan provider and reviews changed classifications, including reorg reversals.
4. Merchant selects records, previews disclosed columns, and explicitly exports a local accounting file.

No mandatory upload, remote merchant database, currency-price lookup, or customer account is part of this workflow. Fiat conversion and accounting labels remain informational unless backed by an explicit versioned quote or source record.

## Provenance and implementation reuse

Source proposal: [merchant dashboard](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/docs/future/privacy-first/04-merchant-dashboard.md).

| Verified source / exports | Existing foundation | Residual gap |
|---|---|---|
| [merchant-ledger/src/reconcile.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/merchant-ledger/src/reconcile.ts): `reconcile`, `LedgerInvoice`, `ObservedPayment` | Pure invoice/payment reconciliation | Evidence-qualified dashboard state; arithmetic is not chain verification |
| [merchant-ledger/src/export.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/merchant-ledger/src/export.ts): `exportCsv`, `exportJson`, `exportXeroCsv`, `exportIif`, `taxSummary` | Accounting renderers | Explicit column disclosure, protected export consent, future format versioning |
| [merchant-ledger/src/decimal.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/merchant-ledger/src/decimal.ts): `parseMinor`, `formatMinor`, `roundDiv` | Integer decimal/rounding behavior | Unified asset-specific totals without floating point |
| [ux-vault/src/portable.ts](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/packages/ux-vault/src/portable.ts) | Portable reconciliation/archive surfaces | Transactional dashboard projections and restore consistency |
| [InvoicePaymentSummary.tsx](https://github.com/djshellshoxxx/GhostPay/blob/c977b5d6723f6822c3b5d86cd6b231712c53c395/apps/web/src/components/InvoicePaymentSummary.tsx) | Existing invoice summary presentation | Searchable multi-invoice workspace and honest uncertainty labels |

## Ownership and dependency direction

Own proposed `apps/web/src/features/future/merchant-dashboard/`: view models, local indexes, filters, projection rebuilds, and export coordinator. Do not copy reconciliation arithmetic into React views.

Hard providers: [P05 encrypted local state](https://github.com/djshellshoxxx/GhostPay/tree/future/p05-encrypted-local-state) and [P03 local scanning](https://github.com/djshellshoxxx/GhostPay/tree/future/p03-local-stealth-scanning). Scanner evidence reaches the dashboard through a typed adapter that identifies coverage, chain tip, and confidence. F04 cannot independently create network clients.

Optional: [F05 GhostProof](https://github.com/djshellshoxxx/GhostPay/tree/future/f05-ghostproof) for explicit evidence export and [F06 backups](https://github.com/djshellshoxxx/GhostPay/tree/future/f06-encrypted-backups) for recovery workflows. Missing optional modules do not disable ordinary local reporting.

Excluded: autonomous invoicing, tax filing, automatic refunds, inventory guarantees, full-history disclosure defaults, and accounting claims about funds outside imported/observed coverage.

## Proposed versioned model and interface

```ts
interface LedgerProjectionV1 {
  readonly schema: 'ghostpay.dashboard-projection/1';
  readonly revision: string;
  readonly profileRef: string;
  readonly rows: readonly {
    readonly invoiceRef: string;
    readonly assetId: string;
    readonly chainId: string;
    readonly expectedAtomic: string;
    readonly observedAtomic: string;
    readonly evidenceRefs: readonly string[];
    readonly state: 'unverified' | 'partial' | 'pending' | 'final' |
      'late' | 'overpaid' | 'unknown' | 'reorged';
  }[];
}
interface MerchantDashboardProvider {
  readonly capability: CapabilityDescriptorV1;
  query(filter: unknown, ctx: OperationContext):
    Promise<ModuleResult<{ revision: string; page: LedgerProjectionV1 }>>;
  previewExport(selection: readonly string[], columns: readonly string[],
    ctx: OperationContext): Promise<ModuleResult<{ previewId: string }>>;
  exportApproved(previewId: string, ctx: OperationContext):
    Promise<ModuleResult<{ fileHandle: SecretHandle }>>;
}
```

The projection is a disposable local view, not the canonical evidence store. Monetary strings are canonical atomic-unit integers; sums use `bigint` and never combine unrelated assets. Store local aliases, invoice plaintext, search indexes, and export selections under P05 encryption. The public capability descriptor contains no record counts or merchant identifiers.

An export approval commits profile, projection revision, row IDs, columns, format, and retention warning. File bytes are exposed only to an authorized download callback. Unknown critical schema fields reject rather than being silently discarded.

## Lifecycle, concurrency, and recovery

Unlock → load authenticated journal → rebuild projection → browse → export preview → approved export. Scanner refresh is a distinct operation and never happens merely because an invoice row becomes visible.

Final requires provider-verified chain evidence plus the configured finality policy and exact invoice/asset binding. A signed receipt alone does not prove chain settlement; an announcement alone does not prove a valid payment. Unmatched, insufficient coverage, unavailable RPC, and disputed evidence stay distinct.

Use evidence identity `(chain, transaction, log/output position)` for deduplication. Reorgs remove the canonical contribution while retaining audit history. Split payments sum only after invoice binding; the same observation cannot satisfy two invoices. Refunds are separately authorized events, not negative numbers that silently erase a receipt.

Lock aborts scanning/query/export operations, clears decrypted indexes, and advances the session epoch. Late callbacks check operation/revision identity before updating UI or durable state. Another tab's write triggers refresh, not last-writer-wins replacement. Crash recovery replays the authenticated journal and can rebuild the projection from scratch; no payment is resent.

## Validation and proposed performance budgets

- Initial target: 10,000 invoices and 50,000 observations per profile; page at most 100 displayed rows, bounded query result buffers, and cancellable index rebuilds.
- Search text ≤256 characters; export selection ≤10,000 rows and proposed output ceiling 20 MiB. Larger datasets require a separately measured streaming design.
- Proposed responsiveness target: first page within 500 ms after index ready on the documented reference device; test fixtures and hardware must accompany any claim.
- Validate timestamps, canonical assets, invoice/evidence references, duplicate identities, and conflicting amounts before projection update.
- CSV output uses existing sanitizers/quoting; formula-leading user text cannot become spreadsheet code. JSON exports declare version and exact unit conventions.
- Reject stale export previews and unspecified conversion/rounding rules. Never infer missing payment values as zero.

## Privacy and leakage table

| Observer / boundary | Exposure | Required control |
|---|---|---|
| Local storage reader | Ciphertext size/access patterns | No plaintext indexes, aliases, or localStorage transaction history |
| RPC/scan provider | Approved network queries | P03 policy and explicit refresh; no row-driven surprise requests |
| Bookkeeper/export recipient | Selected transaction/business data | Column-level preview and user-controlled destination |
| Screen observer | Visible balances and labels | Hide/lock behavior and accessible privacy controls |
| Summary consumer | Incomplete local evidence | Coverage and finality disclaimers adjacent to totals |

## Fee behavior

Local browsing, filtering, and ordinary export are not fee-enforcing transactions and incur no new GhostPay charge under this specification. Existing payment fees are displayed as recorded evidence, not recomputed using today's schedule. Missing historic fee evidence is “unknown,” never silently zero. Optional proof services retain their own separate quote and consent; dashboard navigation cannot trigger them.

## Acceptance matrix

| ID | Case | Expected evidence |
|---|---|---|
| F04-A01 | Unverified announcement matches invoice | Row remains unverified; final total unaffected |
| F04-A02 | Two partial payments and repeated event | Exact sum with one contribution per observation |
| F04-A03 | One payment linked to two invoices | Conflict surfaced; no double-counted revenue |
| F04-A04 | Chain reorg after finality | Contribution demoted and history retained |
| F04-A05 | Crash during projection write | Rebuild matches canonical encrypted journal |
| F04-A06 | Lock during search/export | No decrypted result or download after revocation |
| F04-A07 | Concurrent tab changes selection | Stale export rejected before file release |
| F04-A08 | Spreadsheet formula in alias/memo | Safe export preserving readable meaning |
| F04-A09 | Mixed assets and missing fee data | Separate totals, exact arithmetic, honest unknowns |
| F04-A10 | 10k/50k dataset and cancellation | Recorded latency/memory budget and bounded abort |

## Implementation slices and commands

1. Evidence-to-projection adapter and pure selectors in owned paths; cover deduplication, conflicting linkage, and asset separation.
2. P05 transaction/index integration; cover reorg rebuild, crash interruption, cross-tab revision checks, and lock.
3. Search/filter/summary UI and explicit export preview; cover spreadsheet safety and keyboard navigation.
4. Proposed `apps/web/e2e/future-merchant-dashboard.spec.ts` plus realistic dataset qualification; capture absence of automatic egress.

Scripts below exist in inspected manifests; **not executed for this documentation work**:

```sh
npm run test -w @ghostpay/merchant-ledger
npm run test -w @ghostpay/ux-vault
npm run typecheck -w @ghostpay/web
npm run lint -w @ghostpay/web
npm run build -w @ghostpay/web
npm run test:e2e -w @ghostpay/web
```

## Migration, rollback, and owner decisions

Disabled by default. Import legacy reconciliation files through existing validation and mark their evidence provenance explicitly; do not grant historic finality from an imported status string. Migrate encrypted records transactionally, preserving an export checkpoint and canonical journal. Rollback drops rebuildable indexes and disables new UI without deleting pending payments, backups, or evidence.

Owner decisions: finality policies per asset, supported accounting formats, retention defaults, treatment of cash/manual annotations, benchmark reference devices, and export size limits. Data deletion must exclude recovery-critical records and preserve the separate v1.1 retention requirements; this module is not permission to change current release scope.
