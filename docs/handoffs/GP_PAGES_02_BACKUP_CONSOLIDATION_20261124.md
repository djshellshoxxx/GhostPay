# GP-PAGES-02 seller-keystore backup verification and restoration: consolidation handoff (2026-11-24 UTC)

- Worker: Claude Code session `ghostpay-backup-60`. Branch: `claude/backup-recovery`. PR: #641. Base main: `c8e131c1402a96b5c9d5cd8dc5ae4f0c02188063`.
- Donors merged with ancestry (merge `b3d85b7d`; original branches untouched): #530 `88f7d1b4`, #540 `8daebb0f`, #573 `56fb25aa`, #629 `4b1ed14c`.
- Not merged, with reasons:
  - #577/#596 (suspended invoice signer after idle) depend on the unmerged idle-lock stack #544/#365.
  - #333 replays #314, which is already on main.
  - #239/#240/#260 are older Spec 18 payment-export work, owned by merged #539 and open #622.

## Conflict decision

Main's #314 operation ownership takes precedence: one operation slot, and the newest action owns the form. #530 had given verification an independent controller; that design was not kept. Verification therefore supersedes a pending unlock, as main's tests require. #530's real-crypto test was rewritten to prove that the loaded keys and the saved vault stay unchanged when this happens. #314's delete-ownership tests now type the sole-copy deletion phrase that #573 requires.

## Changes after the merge

- `2f73c419`: an independent review found a regression. Starting Verify left a superseded export's "Encrypting…" text on screen, because verification now reports in its own panel. Verify now clears the shared message, as main did by overwriting it. A regression assertion was added (RED, then GREEN).
- `ba3873c7`: a refused verification attempt clears the passphrase.
- New known-answer test: a fixed v1 keystore over the public scheme1-001 vector keys (`packages/ux-vault/src/keystore-portable.vectors.testutil.ts`). The restored keys rederive the vector's meta-address, stealth address and one-time key. Damaged copies fail closed with typed errors.
- Fuzz tests (fast-check):
  - `packages/ux-vault/src/keystore-portable.fuzz.test.ts`.
  - `apps/web/src/lib/session.backupFuzz.test.ts`.
  - A one-off 20,000-case envelope run found no raw runtime errors.

## Local evidence (Windows, 4 GB RAM; Playwright not run locally)

- ux-vault: typecheck and lint pass. Tests: 375/377 in the full run. The 2 `stealth-export-portable` header cases failed under memory pressure; that file passes 58/58 alone. The new vector test passes 2/2 and the fuzz test 5/5.
- web: typecheck passes; eslint on the changed files passes. Unit tests pass: SellerKeys* 77/77, the session/keyVault/keystore/i18n/App suites and the backup fuzz test (3/3).
- `scripts/scan-secrets.sh`: OK.
- Hosted CI for the exact head is the browser gate (full, lean, Pages artifact on Anvil, beta acceptance). Record its result in the PR.

## Remaining

- Mobile-browser and other-device restoration acceptance stays pending (Spec 18). The verification notice says recovery on another device or browser is untested.
- The suspended-signer idle fix (#577/#596) follows the idle-lock owner.
