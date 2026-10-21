# Plan: idea 04 (B1) encrypted backup, restore drill, scan-state restore

Spec: [docs/specs/ideas/04-encrypted-backup-restore.md](../../../specs/ideas/04-encrypted-backup-restore.md). Branch base `claude/remote-extensions-3`. Estimates are single-engineer days, unverified guesses. Owner role: WEB.

## Order and slices (each slice is one PR, green CI on its own)
| # | Slice | Files (new unless noted) | Days | Exit check |
|---|---|---|---|---|
| 0 | Spec reconciliation: update spec 08 labels/AAD to match `tags.ts`, point it at the B1 container; decide wordlist licence | docs/specs/08-*.md (separate PR, not this one) | 0.5 | reviewer ack |
| 1 | Crypto core: container, KDF, HKDF section keys, commit tag, padding, strict parsers, KAT hooks (`test` salt/iv injection) | apps/web/src/lib/backup.ts, backup.test.ts, test-vectors/backup.json | 3 | tamper/fuzz tests, KATs |
| 2 | Independent KAT checker | tools/backup-kat/{node.mjs,check.py} | 0.5 | both reproduce vectors |
| 3 | Section builders/restorers: keys (reuse keystore patterns), tags (`TagVault.putMany` single IDB tx, merge by newest `updatedAt`), settings, scan rules 4.4 | lib/backup.ts, lib/tags.ts (edit: putMany), lib/idbStore.ts (edit), lib/scanClient.ts (edit: checkpoint export/import, rewind) | 2.5 | restore atomicity tests |
| 4 | Local match persistence `ScanStateStore` (fixes reload-resume losing matches) | lib/scanState.ts, views/Scan.tsx (edit) | 1.5 | reload keeps matches; IDB dump ciphertext only |
| 5 | UI: panel in Seller keys, options, passphrase generator, dry-run, staleness line | views/SellerKeys.tsx (edit) or views/Backup.tsx, components/Common.tsx (binary download) | 2 | component tests |
| 6 | Drill wizard + gating of Create invoice / meta-address sharing; waiver | lib/drill.ts, views/CreateInvoice.tsx (edit), views/SellerKeys.tsx | 1.5 | gate tests |
| 7 | Playwright clean-profile restore, egress/no-leak test, importer fuzz | apps/web/e2e/backup.spec.ts (path per existing e2e layout, UNVERIFIED) | 1 | green |
| 8 | Docs | docs/user/backup-and-restore.md, About/limits copy, THIRD_PARTY.md | 0.5 | copy review |
Total about 11 d worst case; slices 1-3 are the minimum useful release (backup + restore without drill gate is NOT shippable alone: ship 6 with it).

## Task notes
- Reuse `derive`-style scrypt call from `keystore.ts` (`@noble/hashes/scrypt.js`, `maxmem: 2**31`); do not duplicate param bounds, export a shared `checkScryptParams`.
- Never read keys outside `session.ts` helpers; add a function there that hands a scoped callback the raw bytes (`withSecrets(fn)`) and zeroizes after.
- Binary/Blob download helper: object URL revoked on next tick; no filename containing labels.
- Settings restore goes through `sanitizeSettings`; RPC URLs only when the section included them.
- Rewind constant `finalityDepth + windowBlocks` read from chain config; when idea 05 lands, `windowBlocks` is the privacy grid size, else 1000.

## Risks and mitigations
- Data-loss bug in restore: atomic tx, validate-before-commit, KATs, dual-implementation check, never delete local data in v1 (no "replace" for tags in first release).
- Scrypt memory on phones: keep 2^17 default, clear error, test on a low-end device.
- Users skip the drill: gating on meta-address sharing and invoice creation; waiver is typed and per-session.
- Overclaim in copy: copy review step plus grep for "safe"/"secure"/"cloud".
- Existing reload-resume defect: slice 4 or an explicit UI limitation notice; do not restore cursors without matches.

## Gates
G-B1a (after 1-3): KATs agree across implementations; fuzz clean; restore atomicity proven by fault injection (throw at every write). G-B1b (after 6-7): clean-profile e2e; drill gate; no secret/backup bytes in storage, logs or requests. G-B1c: self-review recorded in `docs/reviews/`, then external audit scope note (crypto container, restore logic).

## Open decisions for the owner
Wordlist bundling licence; default of "include keys" (spec: on); whether `Create invoice` gate may be waived at all; neutral filename default; whether to store drill state per meta-address fingerprint (spec: yes).
