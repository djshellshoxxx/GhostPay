# ADR-0026: Local invoice-to-payment reconciliation and encrypted receipt archive

Status: Accepted for the web app, describing the implementation as it stands (documentation of current behaviour, not
a new decision). Audit gap G-04.

Numbering: `docs/adr/ADR-LOG.md` already carries an inline entry titled `ADR-0025` for this same design (audit docs cite
it as ADR-0025). ADR-0025 was taken, so this standalone record uses the next free number. The inline entry remains the
decision record; this file expands it into implementation-level detail. See Open items.

Citations use `path:symbol`. Symbols are functions, classes or constants in the named file.

## Context

On-chain data carries no invoice reference (ADR-0003: no invoice id in any contract call or event). A seller therefore
cannot read from the chain which payment settles which invoice. Two options were considered in COMPLETION_PLAN 2c: an
invoice reference in announcement metadata (links every payment of a seller across invoices for any chain observer) or
local matching (private, less exact). The design chosen is local matching only, run in the seller's browser.

The implementation has three parts:

- `apps/web/src/lib/reconciliationMatch.ts`: pure matching. `proposeInvoiceMatch` returns `exact`, `ambiguous` or `none`
  for one observation against registered invoices. `registrationFromInvoice` builds the minimised registration.
- `apps/web/src/lib/reconciliationVault.ts`: `ReconciliationVault`, the encrypted document (observations, registrations,
  archived receipts, reorg tombstones), its compare-and-swap writes and its import/export.
- `apps/web/src/components/ReconciliationLedger.tsx`: the seller UI (unlock, observations, proposals, registrations,
  `ReceiptArchive`, encrypted backup, and the legacy plaintext section).

The legacy plaintext ledger (`apps/web/src/lib/reconciliationLedger.ts`) is retained only for reading, exporting and
deleting old data.

## Decision

1. **Matching is local and proposal-only.** Nothing is published. `proposeInvoiceMatch` is a pure function over one
   observation, the registered invoices and a context of observations. A result is a hint; only a seller confirmation
   links anything (section "Why matching is proposal plus confirm").
2. **Opt-in registration, minimised.** The invoice-creation form offers a checkbox that is unchecked by default
   (`apps/web/src/views/CreateInvoice.tsx`, `registerForMatching` state). When checked, `registrationFromInvoice` keeps
   only the digest, nonce, chain, asset, expected router net amount, creation and expiry times, and a registration
   timestamp. Fiat-quoted invoices are refused (`registrationFromInvoice` throws `UserFacingError` unless
   `amountPolicy.mode === 'fixed_token'`).
3. **All reconciliation state is one encrypted document per seller and chain scope.** Observations, registrations,
   archived receipts, the reorg cutoff and tombstones live inside a single AES-GCM envelope managed by
   `ReconciliationVault` (see "What is stored locally").
4. **Matching rules** (`proposeInvoiceMatch`, constants in `reconciliationMatch.ts`):
   - Only an *eligible* observation takes part: `evidenceStatus === 'verified-at-scan'`, `evidenceSource ===
     'verified-router-scan'`, no `invoiceDigest` annotation, and `provenance` absent or `'live-scan'` (`eligible`).
     Imported history and reorg-invalidated observations never take part.
   - A registered invoice is a *candidate* for an observation when chain id and asset match, the invoice's
     `expectedNetMinorUnits` equals the observation's `amountMinorUnits`, and `recordedAt >= createdAt * 1000 -
     MATCH_CLOCK_SKEW_MS` (5 minutes) (`candidate`).
   - Invoices already linked to a current verified observation are removed from the open set before matching
     (`proposeInvoiceMatch`, `claimed`).
   - More than one candidate invoice: `ambiguous`, reason `multiple-invoices`.
   - For the single candidate invoice, another eligible observation that is also a candidate: `ambiguous`, reason
     `multiple-payments` (`competing`).
   - `recordedAt > expiresAt * 1000 + MATCH_LATE_GRACE_MS` (7 days): `ambiguous`, reason `late-observation`.
   - Otherwise `exact`. Note there is no upper bound before expiry; the window for `exact` is effectively
     `[createdAt - 5 min, expiresAt + 7 days]`, and observations beyond the late bound are reported as ambiguous.
5. **Amount is the router net amount.** `registrationFromInvoice` computes it as `routerNet(grossForNet(wanted))` for
   `feePolicy === 'payer_pays'` and `routerNet(wanted)` otherwise, both from `@ghostpay/chain-adapters`. Observations
   carry `metadata.netAmount` through `recordFromVerifiedMatch` (`apps/web/src/lib/reconciliationLedger.ts`).
6. **Confirmation re-runs matching inside the write.** `ReconciliationVault.confirmProposal` applies `withSaved` and
   then `proposeInvoiceMatch` on the current decrypted document inside `change()`. It links only when the result is
   `exact` and names the requested digest; anything else throws the "no longer has a single exact invoice match" message.
7. **Archive is opt-in and never evidence.** The receipt panel offers an archive action (`ReceiptPanel.tsx`,
   `archiveReceipt`). Archived receipts are not read by matching (see "Why a seller-signed receipt is never payment
   evidence").

## Privacy and data lifecycle

### What is stored locally

Storage location and keys:

- IndexedDB database `ghostpay-reconciliation-encrypted`, object store `vaults`, key `${sellerKeyId}:${chainId}`
  (`apps/web/src/lib/reconciliationVault.ts:IdbReconciliationVaultStore.db`, `ReconciliationVault.snapshot`, `scopeKey`).
- `sellerKeyId` is `checkpointKeyId(spendingPublicKey, viewingPublicKey)`, a SHA-256 of the public key pair
  (`apps/web/src/lib/scanClient.ts:checkpointKeyId`). It is a public identifier of the seller scope, not a key.

Persisted envelope (plaintext on disk): `format`, `version` (1), `sellerKeyId`, `chainId`, `salt` (32 random bytes,
new per write), `iv` (12 random bytes, new per write), `ciphertext` (`ReconciliationVault.encrypt`, `parseEnvelope`).
`parseEnvelope` also caps the text at `MAX_VAULT_BYTES` (8,000,000).

Encryption (`ReconciliationVault.aes`, `aad`, `encrypt`, `decrypt`):

- Base key: the 32-byte viewing key from `revealViewingKey` (`apps/web/src/lib/session.ts`), imported as HKDF key
  material in `ReconciliationVault.unlock`. The caller's key buffer and the local copy are zero-filled in `unlock`'s
  `finally`.
- Per-write AES-GCM-256 key: HKDF-SHA-256 with the envelope salt and info `GhostPay/reconciliation/v1/aes-gcm|<sellerKeyId>:<chainId>`.
- AES-GCM with 128-bit tag. AAD is the JSON of the envelope header (`format`, `version`, scope, `salt`, `iv`).
- Plaintext document is JSON of `Document`, which contains:
  - `records`: `VaultRecord` items. Fields are those of `ReconciliationRecord` in `reconciliationLedger.ts`: `id`,
    `sellerKeyId`, `chainId`, `transactionHash`, `blockNumber`, `blockHash`, `logIndex`, `stealthAddress`, `asset`,
    `amountMinorUnits`, `viewTagMatched`, optional `invoiceDigest`, `recordedAt`, `evidenceStatus`, `evidenceSource`,
    plus `provenance` (`'live-scan' | 'imported-history'`).
  - `invoices`: `RegisteredInvoice` items (digest, nonce, chain, asset, expected net, `createdAt`, `expiresAt`,
    `registeredAt`; see `reconciliationMatch.ts:RegisteredInvoice`).
  - `receipts`: `ArchivedReceipt` items (`SignedReceipt` plus `archivedAt`).
  - `invalidatedFrom`, `invalidatedAt`, `tombstones`, `saturated`.
- The module's own comment states that only ciphertext and public scope identifiers are persisted and that no plaintext
  document is cached (`reconciliationVault.ts`, comment above `ReconciliationScope`).

Bounds, enforced on write, decrypt and import (`validateDocument`, `encrypt`, `mergeImport`):

| Bound | Value | Symbol |
| --- | --- | --- |
| Vault ciphertext text | 8,000,000 characters | `MAX_VAULT_BYTES` |
| Decrypted plaintext | 4,000,000 bytes | `MAX_VAULT_BYTES / 2` in `decrypt` |
| Observations and tombstones | 2,000 each | `MAX_RECONCILIATION_RECORDS` |
| Registered invoices | 500 | `MAX_REGISTERED_INVOICES` |
| Archived receipts | 500 | `MAX_ARCHIVED_RECEIPTS` |

Never stored (`registrationFromInvoice` and its comment on `RegisteredInvoice`): invoice line items, memo, fiat totals,
meta-address, signer public key. Never stored in any form: spending or viewing private keys. The viewing-key buffer is
zero-filled in `ReconciliationVault.unlock`, and only the derived HKDF key material is held, in memory, while unlocked. Plaintext observations are never written to
`localStorage`: the legacy write path is disabled (see below).

### Retention

No time-based expiry, pruning or automatic deletion exists in `reconciliationVault.ts` or `reconciliationLedger.ts`.
Observations, registrations and receipts persist until the seller deletes them, or until the browser clears the site's
IndexedDB. Locking or changing session does not delete anything; it only clears memory (see below). Reorg tombstones
and the cutoff persist across "delete observations" (`clearRecords` keeps them).

### Lock, session change and stale actions

- `ReconciliationVault.lock` drops the base key and bumps `revision`, so in-flight operations fail with the stale guard.
- `ReconciliationLedger.tsx:reset` (the Lock button, a change of chain or seller key, and any session change via
  `subscribeSession`) locks the vault and clears all component state. Unmounting locks the vault through the cleanup of
  the mount effect in `ReconciliationLedger`.
- `ReconciliationLedger.tsx:run` checks mounted state, revision, chain and seller scope, and session identity before and
  after each action. Writes go through `ReconciliationVaultStore.compareAndSwap` (the interface documents an exact
  previous-ciphertext comparison inside one transaction), with up to four attempts in `ReconciliationVault.change`, so a
  concurrent tab cannot be overwritten blindly.

### Export and delete

Encrypted backup:

- "Export encrypted reconciliation backup" (`ReconciliationLedger.tsx`) calls `ReconciliationVault.exportEncrypted`,
  which returns the stored envelope text, and downloads `ghostpay-reconciliation-encrypted.json`. The file is readable
  only with the same seller's viewing key.
- Import is a preview then activate (`previewImport`, `activateImport`). Activation decrypts the backup again against
  the current database and merges with `mergeImport`. Plaintext legacy ledgers and seller receipts are not accepted as
  backups (UI hint in `ReconciliationLedger.tsx`).

Encrypted vault deletion:

- "Delete encrypted observations" calls `clearRecords`. Confirmed by `window.confirm`. It empties `records` and keeps
  `invalidatedFrom`, `invalidatedAt`, `tombstones`, `invoices`, `receipts` and `saturated`, so old backups cannot revive
  invalidated observations.
- Registrations: `removeInvoice` (one) and `clearInvoices` (all). Removing a registration never changes observations or
  their annotations (`removeInvoice` doc comment; UI text "Saved observations and links are kept").
- Receipts: `removeReceipt` (one, by signature) and `clearReceipts` (all), both confirmed in `ReceiptArchive`.
- Deletions are allowed while the vault is saturated (read-only). Writes that add data are refused.

Plaintext exports (deliberately unencrypted, each behind a confirmation):

- Archived receipts: `ReconciliationVault.exportReceipts` returns `[` + `receiptJson` of each entry + `]`.
  `receiptJson` re-verifies every signature. Downloaded as `ghostpay-receipts.json`. The UI warns the file reveals payment
  details.
- Legacy records: `exportUntrustedLegacyReconciliation` returns the raw stored bytes, up to 2,000,000 bytes
  (`MAX_LEDGER_BYTES`). Downloaded as `ghostpay-untrusted-legacy-ledger.txt`.

### Legacy plaintext ledger

- Key names: `ghostpay.reconciliation.records.v1` (data) and `ghostpay.reconciliation.enabled.v1` (flag).
- Writing is disabled: `isReconciliationLedgerEnabled` returns `false`; `setReconciliationLedgerEnabled(true)` and
  `saveReconciliationRecord` throw ("The legacy ledger is read-only").
- Reading: `readReconciliationRecords` (the UI's "Read untrusted legacy records" button). Results are shown as untrusted.
- Deleting: `clearReconciliationRecords` removes the data key (and `setReconciliationLedgerEnabled(false)` removes both
  keys).
- Legacy data is never imported as payment proof or copied into the encrypted vault (UI text in `ReconciliationLedger.tsx`).

### Reorg invalidation

- The scanner reports a reorg through `onQuarantine` and `onReorg` (`apps/web/src/lib/scanClient.ts`, calls near lines
  278 and 303). `apps/web/src/views/Scan.tsx` (`onReorg`) collects observations of the current run at or above the
  rolled-back block, then calls `ReconciliationVault.invalidateFrom(block, observed, canonicalHash)`.
- `invalidateFrom` reads the canonical block hash for each affected height (at most 8 reads in flight,
  `CANONICAL_READS_IN_FLIGHT`). If any read fails, nothing is written, and the error is surfaced by `Scan.tsx`.
- Only observations whose stored `blockHash` differs from the canonical hash are invalidated
  (`evidenceStatus: 'invalidated-after-reorg'`) and tombstoned. Unchanged history is untouched, so a shallow or overstated
  rollback cannot invalidate it.
- The cutoff (`invalidatedFrom`, `invalidatedAt`) is merged with any earlier cutoff (`mergeCutoffs`). It applies to
  later imports of observations the vault did not hold.
- A tombstoned observation id is refused for good by `withSaved` ("This historical observation was invalidated by a
  reorg").
- If tombstones exceed `MAX_RECONCILIATION_RECORDS`, the vault becomes `saturated` (read-only). `invalidateFrom` then
  throws a `UserFacingError` telling the seller to export the history.
- An invalidated observation no longer counts as `claimed`, so an invoice linked only to it reopens for matching
  (`proposeInvoiceMatch`, `claimed` filter).

## Why a seller-signed receipt is never payment evidence

- A receipt is signed by the seller's signer key with domain `RECEIPT_DOMAIN` (`apps/web/src/lib/receipts.ts`).
  `verifyReceipt` checks the signature only and does not read the chain. A valid signature shows that the seller issued
  the receipt, not that a payment arrived.
- Matching has no receipt input. `proposeInvoiceMatch` takes only an observation, `RegisteredInvoice` values and
  observations. `ReconciliationVault.proposals` and `confirmProposal` read `records` and `invoices` only.
  `reconciliationMatch.ts` states this at the top of the module.
- `ReceiptArchive` says the same to the seller ("never counts as payment evidence; archived receipts do not affect
  matching or verification").
- Archiving only stores the receipt after `verifyReceipt` (`ReconciliationVault.archiveReceipt`). Validity of the
  signature is not payment evidence.
- Practical consequence: any receipt the seller issued, even one for a transaction that never settled, verifies. The
  design therefore keeps receipts out of every decision path.

## Why matching is proposal plus confirm, not automatic

- The chain has no invoice reference, so every link is an inference from chain, asset, amount and time. Inference can be
  wrong. Amounts collide (two invoices can share an exact net amount), and two payments can match one invoice.
- Time is observation time, not block time (`MATCH_LATE_GRACE_MS` comment in `reconciliationMatch.ts`). A payment first
  seen late may have been paid late, so it is downgraded to `ambiguous` rather than `exact`.
- Another client may compute a different gross, so a real payment can be missed. A missed payment is safe. A wrong
  automatic link is not.
- UI: `ProposalView` (`ReconciliationLedger.tsx`) shows a confirm button only for `exact`. The text says "This is a local
  inference, not payment proof." For `ambiguous` it shows a warning and no action. Only the manual digest annotation can
  resolve an ambiguous case.
- Server-side of the flow: `confirmProposal` refuses imported history, requires an unlinked verified observation, and
  re-runs matching on the decrypted current document inside the compare-and-swap loop. A stale proposal therefore cannot
  link.
- Saving an observation (`ReconciliationVault.save`) never links an invoice automatically. A manual digest typed in the
  "Add verified payment to ledger" form is stored as the seller's annotation. The form hint says it is "not opened or
  checked" (`MatchLedgerAction`).

## Consequences

- Matching is best-effort and local. It misses payments made by other clients with a different gross, and it leaves
  identical amounts ambiguous. Late scans downgrade to ambiguous.
- Anyone who can read the browser profile sees that a vault exists, its scope identifier (`sellerKeyId`), the chain
  id and the ciphertext size. Observations, registrations and receipts are encrypted. Only the envelope header is
  stored in clear (`reconciliationVault.ts:ReconciliationVault.encrypt`, and the comment above
  `ReconciliationScope`). Plaintext is visible to the page only while the vault is unlocked. Because `sellerKeyId` is a
  hash of the public key pair, it links the device to the seller's public meta-address. Audit 24 records this as Info
  (`docs/audits/24-ai-assisted-security-audit-2026-10-28.md`, finding L3-F9), and ADR-LOG's ADR-0025 entry accepts it.
- Plaintext exports of receipts and legacy records leak payment details if mishandled. They sit behind confirmations
  only.
- The format and bounds are part of the encrypted-data contract. This build reads version 1, 2 and 3 documents
  (`validateDocument`) and writes version 3. Any other build must accept version 3 before it can read a backup
  written by this one.
- The reorg path depends on the scanner reporting canonical hashes. If they cannot be read, nothing is written and the
  seller is warned to stop relying on historical records.
- The feature is web-only, experimental, and not audited on its own.

## Evidence (tests in the repository)

These tests exercise the described behaviour. They are listed, not re-run for this document.

- `apps/web/src/lib/reconciliationMatch.test.ts`: exact pairing, `none` cases (chain, asset, amount, early observation,
  no invoices), invalidated, annotated and imported observations never proposed, `multiple-invoices`, `multiple-payments`,
  claimed invoices not re-offered, `late-observation`, net amount for both fee policies, fiat refusal, strict validation.
- `apps/web/src/lib/reconciliationVault.test.ts`, `apps/web/src/lib/reconciliationVault.invoices.test.ts`: vault
  encryption, scope and envelope checks, CAS, invoices and receipts in the vault, import and reorg behaviour.
- `apps/web/src/components/ReconciliationLedger.test.tsx`, `ReconciliationLedger.invoices.test.tsx`: UI actions,
  confirmations, read-only state.

## Open items

1. **Version drift in ADR-LOG.** The inline ADR-0025 entry says "Document version 2 adds them; version 1 documents
   upgrade on the next write". The code writes version 3 (`Document.version: 3`, `mergeImport`, `invalidateFrom`), and
   reads versions 1, 2 and 3. The entry should be corrected or amended.
2. **Numbering.** This file is ADR-0026 because ADR-0025 is taken by the inline ADR-LOG entry. Decide whether to renumber
   the inline entry to a standalone file, or to keep this as an expansion.
3. **No retention policy.** Observations and receipts live until deleted. Decide whether a retention limit or an
   automatic prune is wanted.
4. **Forget local scan data.** Audit 24 (L3-F9) suggests a confirmed "forget this seller's local scan data" action and
   listing the identifiers in the browser-profile row of the threat model. Neither exists yet.
5. **Manual annotations are unchecked.** A typed digest that is not a registered invoice is stored and counted as a link
   (`MatchLedgerAction`, `save`). Decide whether to require registration.
6. **Expiry is not an upper bound.** An observation between expiry and expiry plus 7 days is `exact` with no further
   check. Decide whether that grace window is right.
7. **Plaintext exports rely on a confirmation only.** Consider a warning that the file must not be stored in shared
   locations.
