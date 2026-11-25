# External wallet disclosure on main (#287 item 3, owner gate 4) — 2026-11-25 UTC

Worker: Claude Code session `newghostpay-ae`. PR A `claude/w-wallet-disclosure-287-20261125` (#677), PR B
`claude/w-wallet-disclosure-ui-287-20261125`, stacked on PR A. Base main `69485773`.

## Provenance

Main had no disclosure gate. It existed only on the #372 stack: the disclosure parts of `8c196d12`, focus fix
`8ce7f1db`, and #589 `902464ad`/`697cb731` + #606 (head `f941ac01`). Ported by hand; donor branches untouched.
Not ported: the donor's retention (ghostpay-42, #676), invoice metadata (W4), `addressReuse` (superseded by #674),
global privacy masking (`privacyMode`, #569, not on main) and the donor-only connect hardening.

## PR A — library and optional gate (no app behaviour change)

- `lib/walletDisclosure.ts`: frozen, bounded descriptions of `eth_requestAccounts`, `wallet_switchEthereumChain`,
  `eth_sendTransaction`, `eth_signTypedData_v4`; typed-data labels only from declared fields of fitting type;
  `WalletDisclosureController` (one prompt, two-minute decision window, approval timed from the decision).
- `lib/walletCallSummary.ts`: canonical calldata labels from local ABIs (built-in plus an extra ABI).
- `lib/wallet.ts`: optional `disclosure` gate on the session and on `connectWallet`. Exact reviewed parameters sent
  as a plain copy; approval re-checked immediately before each provider call and never after a returned hash; a gate
  without a usable approval cancels; an unreadable journal refuses before the review opens. Without a gate the
  requests, call sequences and journal behaviour equal main.

An independent AI-assisted review (not a professional audit) found no fund-loss path and ten issues, all fixed with
regression tests (`wallet.disclosure.review.test.ts`) and mutation checks; see the PR #677 comment.

## PR B — dialog and wiring

- `components/WalletDisclosure.tsx`: `WalletDisclosureProvider` (one modal dialog, background `inert`, focus trap,
  Escape cancels, focus returns to the opener or the page heading) and `useWalletDisclosure()`. Values are in a
  `<dl>`, never in a live region (#286 item 5). The app lock, a session change, hiding or leaving the page cancel an
  open review.
- `AppShell.tsx`: one provider for the shell. Its gate scope is stable for the life of the shell; session or
  settings changes only cancel an open review (a first version tied the scope to them, which left every connected
  wallet's gate permanently stale after a key re-import: caught by the Policy guard suite).
- Pay, Registry and Policy pass the gate to `connectWallet`, so connect, switch, permit and send are all shown first.
- Tests: legacy suites use `useAutoApprovedWalletDisclosures()` (unit) or `approveWalletDisclosures(page)` (e2e,
  Playwright `addLocatorHandler`), which press the real dialog button and record the methods shown; nothing stubs
  the gate. Pay asserts the shown sequence for native, ERC-20 approve-then-pay and permit flows; the dialog suite
  covers presence before any provider call, cancel, Escape, focus return, scope change and app lock.

## Not done / for others

- User documentation of the dialog and of wallet-extension RPC traffic: W3 (ghostpay-backup-60) owns the docs and
  scan wording and links to the `wallet.disclosure.*` texts.
- When #569 global masking lands, the provider should call `allowPresentation(!masked)` again (the donor's form).
- e2e and the full web suite run in hosted CI only (local memory on this shared machine was too low).
