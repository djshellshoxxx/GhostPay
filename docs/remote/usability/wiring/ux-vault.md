# Wiring plan: ux-vault in apps/web

No code was added to apps/web. Proposed integration:

## Files
- `apps/web/src/vault/storage.ts`: `VaultStorage` over IndexedDB (object store `vault`, keys as given; `put` with empty bytes = delete). Must be same-origin, no sync. Request `navigator.storage.persist()`.
- `apps/web/src/vault/VaultProvider.tsx`: creates `createVault({storage, now: Date.now})` once; holds `ProfileSession | undefined` in React state (not in localStorage/Redux devtools); auto-lock on idle timer (UI-owned, e.g. 5 min) and on `visibilitychange` hidden after N minutes, calling `session.lock()` and dropping book state.
- `apps/web/src/vault/components/`: `ProfilePicker`, `UnlockForm`, `CreateProfileForm`, `AddressBookList` (search box + tag chips + network select), `ContactForm` (shows `analyzeCandidate` findings before save; block findings disable save, high findings require a confirm checkbox), `DuplicatesReview` (`findDuplicateGroups`), `BackupPanel` (export, copy/download `backupToText`, import file/paste, merge vs replace radio, conflict policy select, report dialog), `ChangePasswordForm`.
- Send flow integration: recipient picker reads `searchContacts`; on selection show full address with first/last 6 chars emphasised and re-run `isLookalikeAddress` against the pasted address.

## State
`profiles: ProfileInfo[]` (from `listProfiles`), `session`, `query/tags/network/sort` filter state, `pendingFindings`, `importReport`. Never persist the book, password or backup password anywhere; clear password inputs after submit; use `autocomplete="new-password"` / `current-password`.

## i18n keys (ux-i18n)
`vault.profile.{create,unlock,lock,delete,publicLabelHint,publicLabelWarning}`, `vault.error.{UNLOCK_FAILED,DECRYPT_FAILED,CORRUPT,UNSUPPORTED_VERSION,WEAK_PASSWORD,LIMIT,DUPLICATE,STORAGE,LOCKED}`, `vault.contact.{label,address,network,tags,note,add,edit,remove}`, `vault.finding.{exact-address,lookalike-address,confusable-label,duplicate-label,mixed-script-label}`, `vault.backup.{export,import,merge,replace,policy.newer,policy.local,policy.incoming,report.added,report.updated,report.unchanged,report.removed,report.conflicts,report.warnings,migrated,passwordWarning}`. Map `UNLOCK_FAILED`/`DECRYPT_FAILED` to one string ("Wrong password, or the data was modified"); do not add detail.

## UX requirements
Warn that losing the password means losing the data (no recovery, no custodian). Show `publicLabel` warning (stored unencrypted). Show backup report before navigating away; default import mode is merge with policy `newer`; replace requires typed confirmation.

## e2e ideas (Playwright)
Create profile, add two contacts, reload, unlock; wrong password message identical for unknown profile; export then import into second profile and compare list; tamper exported file (flip one char) and see uniform error; look-alike address blocks save without confirm; IndexedDB inspection asserts no plaintext label/address strings; lock on idle clears list from DOM.
