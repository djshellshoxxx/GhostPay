# Local reconciliation and receipt archive

GhostPay can suggest which invoice matches a router-verified scan observation and keep seller-issued receipts in an
encrypted local archive. Both are optional. A local match is an inference, and a signed receipt is a statement signed by
a key; neither independently proves payment or establishes the seller's identity.

## Register and match an invoice

1. Create an invoice with a fixed token amount and explicitly select registration for matching. The checkbox starts off.
2. In **Scan and receive**, scan with the same seller keys and chain, then unlock the encrypted reconciliation vault.
3. Review a proposed invoice digest, chain, asset and router net amount. A unique match offers **Confirm proposed invoice
   match**. Confirming creates a local association; it does not silently mark an invoice paid or publish an invoice reference.
4. When more than one invoice or payment matches, the result is ambiguous. An observation first recorded at or after invoice
   expiry is also ambiguous because the scan timestamp does not establish when the payment happened. Review those cases
   manually. A typed invoice digest is only your annotation and is not validated payment evidence.

Matching uses observation time, not block time (note dated 2026-11-11). Once you save a payment on this device, saving
or confirming it again keeps that first saved time, so a payment saved before expiry can still be confirmed later. Two
cases do not keep an earlier time:
- A payment you have not saved yet is timed by the scan that is showing it now. Every rescan re-times it, so save a
  payment before its invoice expires if you want to confirm it later.
- A payment restored from a backup or imported from another device takes the time of the next live scan that saves it.
  Confirm such payments before expiry on the original device, or check them manually.

Because the time is not the block time, an old payment can be suggested for an invoice created after it, or shown as
ambiguous for an invoice that has since expired. Check the transaction date yourself before confirming a match for an
old payment.

Only eligible router-verified scan observations participate. Imported history, reorg-invalidated observations, signed
receipt files and QR contents never become payment evidence through this workflow. A scan that changes while saving or
confirming invalidates the pending action; refresh and review the result before retrying.

## Archive a seller receipt

Issue a receipt from an eligible scan result, review the fields, then explicitly choose its archive action. The archive
stores the signed receipt; it never contributes to invoice matching or chain verification. A signature establishes that
the corresponding private key signed the fields, not the person's identity or independent proof of payment.

The vault deduplicates receipt signatures and keeps at most 500 receipts and 500 invoice registrations per seller and
chain. The archive offers individual deletion, deletion of all archived receipts, and a plaintext receipt export after
confirmation. That export reveals payment details; keep it out of shared locations unless you intend to share them.

## Storage, backup and deletion

Reconciliation data is stored in this browser's IndexedDB and encrypted using a key derived from the seller's viewing key.
Stored invoice registrations contain only digest, nonce, chain, asset, expected net amount and timestamps. They omit
line items, memo, customer labels and full invoice links. Observations include transaction, block and recipient data.
Receipts retain their signed fields. Private seller keys are not saved in this document.

The public seller-scope identifier, chain and ciphertext size remain visible in the browser profile. Unlocked content is
visible to the page. There is no automatic retention deadline: entries stay until you delete them or clear this site's data.
Locking the vault clears access from the current component; it does not erase stored data.

- **Export encrypted reconciliation backup** saves ciphertext. Restoring it needs the same seller viewing key, so retain
  your encrypted seller keystore separately. A public seller-configuration QR cannot restore this archive.
- Backup import first previews the merged counts, then requires activation. Imported observations are historical and
  untrusted until rescanned; known reorg invalidation is retained.
- Deleting observations keeps invoice registrations, receipts and reorg invalidation history. Delete registrations and
  archived receipts separately in their sections. Removing a registration does not remove an existing observation link.
- Clearing this site's data in browser settings removes the vault and other GhostPay site data. Back up what you need
  first. External files you previously exported remain until you delete those files separately.

If invalidation history reaches capacity, the vault becomes read-only; export and deletion still work. It retains that
safety state so an old backup cannot revive invalidated observations. See [ADR-0026](../adr/ADR-0026-local-reconciliation-and-receipt-archive.md)
for the exact format, limits and lifecycle.
