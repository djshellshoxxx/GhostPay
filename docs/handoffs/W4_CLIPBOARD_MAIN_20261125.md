# W4 clipboard cleanup onto main: handoff (2026-11-25)

## Source

- Branch `claude/w4-clipboard-286-main-20261125`, started from #580 head `e68d32d7e424daf7264165987868eb6b891048b2`, which contains #553 `068fbc36b80311c107dfd3619d631fca794fac58`.
- Merge `71260e10` brings in main `aaa71a112d90fd39f59b40de9f139e9cfdc62d61`. The only conflicts were the AppShell session import, which keeps main's `sessionHasExternalCopy`, and the ownership log, which keeps both sides.
- Fix `57bd6c7f` resolves the security review findings below. This handoff and the PR body are recorded in the commit after it.
- The #553 and #580 branches are unchanged. Both are ancestors of this branch.

## Security review findings

1. **HIGH, control regression (G2-02).** #580 removed backup clearing on Hide, Lock, unmount, the app lock and the activation retry, so cleanup depended on the opt-in timer (default 0).
   - Fix: `clipboardPrivacy.ts` tracks a confirmed backup by its length and SHA-256 digest only.
   - `clearCopiedRecovery()` reuses the double-read and single-plain-text-item check before writing `''`.
   - `SecretBackup` calls it again from Hide, automatic hiding, unmount and a module-level app-lock subscriber.
   - The BtcView, SolanaView and TronView sources are byte-identical to main, so their `lock()` calls `clearCopiedBackup()` first, as before.
   - A recovery write that settles after `current()` turns false is checked inside the helper. The check is tied to that copy, so a newer copy is never cleared.
   - A newer pending app write makes the check wait for it. If that write fails, the check runs again. If it succeeds, the backup is no longer tracked.
2. **MEDIUM, fail-open on denied read.**
   - Fix: a refused or missing read, or a refused clear, makes `copiedRecoveryUnverified()` true.
   - `CopiedBackupNotice` is mounted in AppShell. It shows a warning with an accessible status message, a **Check clipboard again** button and an explicit **Empty clipboard** button.
   - One capture-phase retry runs at the next click or key press. After that, retries are manual.

**Decision:** there is no automatic blind `writeText('')`, because it could erase newer content (#286). `emptyClipboardOnRequest()` is the only unchecked write. Only the explicit button calls it, and its hint states the consequence. If the browser refuses it, an alert appears and the notice stays. The decision is also recorded in `docs/privacy/clipboard-actions.md`.

The opt-in Off/30/60 timer is unchanged for the 23 `CopyButton` sites. For backups it adds a timed check.

## Evidence

- `npm run build -- --workspace @ghostpay/web` on `71260e10`: exit 0. This covers dependency builds, web `tsc --noEmit`, `vite build` and the bundle scan of 20 files.
- On the fix (`apps/web`):
  - `npx tsc -p tsconfig.json --noEmit`: exit 0.
  - Typed ESLint on 20 changed files: exit 0.
  - Vitest on `clipboardPrivacy`, `SensitiveClipboard`, `SecretBackup`, `SecretBackup.views`, the `CopyButton` fuzz test and `Common`: 86/86 passed.
  - Vitest on the BtcView, SolanaView and TronView tests, `SharedComponents.i18n`, `securityKeys`, `settings` and `settingsExchange`: 99/99 passed.
- **Fail-before:** the same seven test files run against the production files from `71260e10` give 55 failed and 54 passed. Behavioural failures:
  - BtcView: Lock empties the clipboard; next-click retry after a refused app lock.
  - SolanaView and TronView: Lock empties the clipboard.
  - All five view-leave cases.
  - The remaining failures need the new exports.
- `node scripts/i18n/check.mjs`: 0 errors.
- `bash scripts/scan-secrets.sh`: OK.
- `git diff --check`: clean.
- **Bounded offline model check.** This is a scratch harness and is not committed. It imports the production helper under a virtual clock. It mixes app copies (30% of them backups), deferred, refused and apply-at-settle writes, external and rich copies, preference revocation, unmounts, Hide and explicit Empty.
  - Run: ten seeds × 2,000 traces × 48 events, 0 failures.
  - Oracles: a clear only with matching single plain-text content and no newer pending write; non-backup copies only after their deadline, without revocation; blind writes only from Empty; Off-only traces never read; after a drain, one readable Hide removes a tracked backup.
  - Mutation sensitivity: removing the text match, the pending-write guard or the format check fails the oracles. Removing the retry fails liveness.
- Not run locally: Playwright (no browsers installed), the full web suite with coverage, anvil and forge. Hosted CI qualifies these.

## Composition

- `CreateInvoice.tsx` changes one line (`autoClearAfterMs`). FC-01 #650 adds `<PaymentRequestDownload>` on the next line. If #664 lands first, merge `origin/main` and keep both lines.
- The related #585/#600 privacy-minimal invoice continuation edits the same Copy link row. W4 coordinates it next.

## Open

- An integration lock was not taken and nothing was merged. Handed to W1.
- The browser paste or permission prompt for a clipboard read on Hide and Lock is a deliberate trade-off. The copy warning says so.
