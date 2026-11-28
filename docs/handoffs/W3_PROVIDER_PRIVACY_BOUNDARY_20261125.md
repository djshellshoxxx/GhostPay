# W3 — EVM provider/privacy boundary (2026-11-25)

- **Worker:** W3, home team (`%USERPROFILE%\GhostPay-coordination\TEAM.md`), Claude Code session `ghostpay-backup-60`.
- **Branch:** `claude/w3-provider-privacy-boundary`, base main `32ae3977`. Draft PR #672.
- **Builds on, without taking over:** #658 (RPC disclosure evidence, test-only), #228 (dispatch-time policy check idea, stacked on unmerged #222), #649/#664 (Sweep balance consent), #677/#679 (newghostpay-ae, wallet disclosure).

## Done on this branch

**M1. Saved intent is never silently weakened.** `loadScanPrivacy` no longer turns corrupt or invalid saved settings into Direct or field defaults. The same goes for a storage read the browser refuses. Such settings load with `unreadable: true` and `requireProxy: true`:
- `planScan` blocks with `scanPrivacy.blocked.settingsUnreadable`.
- `privatePathForbidsDirect` is true, so the second RPC is skipped and Sweep stays on-request.
- A disclosure row explains this in Scan and Settings.

Saving valid settings clears the lock; the flag is never saved, and Settings reloads the saved copy after a save. Nothing saved, or no storage API at all, still gives the defaults. Older saved versions without newer fields load as saved.

**M2. The current policy is checked before each scan request.** `openScanClients({ assertCurrent })` checks the route before every request and after every answer at:
- the scan-endpoint transport (client retries and chain re-checks; the refusal is a non-retryable adapter error);
- the cached app RPC (wrapped, not modified);
- the indexer fetch;
- the final scan client.

`Scan.tsx` snapshots the saved scan privacy settings, Settings RPC and second RPC when the scan starts, and also guards the second RPC. A change in this tab or another stops the scan with `scanPrivacy.blocked.routeChanged`, and delayed answers are discarded. Checkpoints, submitted hashes and recovery records are untouched.

**M4 (scan side).** A scan disclosure row says that a connected wallet's own RPC traffic is outside these settings and checks. `docs/user/privacy-limits.md` gains a section on what the scan privacy settings cover and what they don't. The in-app wallet explanation belongs to newghostpay-ae (`wallet.disclosure.*`, `components/WalletDisclosure.tsx`, #677/#679). Link the docs section to that dialog once #679 is on main.

## Evidence

- New `apps/web/src/lib/scanPrivacy.integrity.test.ts`: unit cases plus a seeded fast-check property, "no saved value is weakened to an unrequired Direct scan". The guard tests cover a delayed answer, a failure after a change, a transport retry, a change during the initial chain check, and the cached client.
- One assertion in `scanPrivacy.test.ts` encoded the forbidden Direct fallback. It now expects the lock; its sanitising checks remain.
- The pinned `scanPrivacyDisclosure` key count in `scanPrivacy.i18n.test.ts` goes from 38 to 44 (six new keys, English in all four locales, native review pending like the existing scan privacy keys).
- Local: nothing ran. Free RAM was 78–369 MB against TEAM's 900 MB minimum.
- Hosted CI on `18586c52`: `ts-test (web)` failed only on the pinned count, and `ts-lint` flagged test-file style. Both are fixed in `3842a1e1`. Requalify on the final head.

## Remaining

- **M3: bind consent to endpoint, chain and action outside Scan.** In Sweep this means after #664 or its successor, re-reading `privatePathForbidsDirect` at click time instead of once at mount. In Pay it means the receipt-consent path only (wallet connect/send belongs to newghostpay-ae).
- **App-RPC transport retries.** The cached Settings-RPC client's internal retries are covered per logical request, not per transport send. Changing that means touching `AppShell`/`defaultServices`.
- **#658's Phase 8 candidates** (not started): fewer position-revealing reads, ordering of second-provider lookups.
