# Wiring plan: ux-connect (smart-wallet-compat, hw-signer, wallet-connect)

Status: NOT wired. Nothing in apps/web was edited. Everything below that touches a real wallet, device or relay is UNVERIFIED and needs manual or e2e confirmation. Wire one spec at a time in the order of specs/README.md (smart-wallet-compat, hw-signer, then wallet-connect after mode-guard).

Dependency: add `"@ghostpay/ux-connect": "workspace:*"` (match repo convention) to `apps/web/package.json`. The package has no runtime dependencies.

## 1. smart-wallet-compat
Files:
- `apps/web/src/lib/payExec.ts`: after `connectWallet`, call the user RPC `eth_getCode(account, "latest")` through the existing RPC helper (user-chosen host only), pass the string to `assessAccount({code, rdns, matrix, token})`. Use `report.path` instead of the current permit/approve branch. `permit` only when `report.path === 'permit'`.
- `apps/web/src/lib/wallet.ts` `pollReceipt`: take a `PollPolicy`; when `timeoutMs === null` loop until a receipt, `userStopped` or `dropped`, using `evaluateWait` each tick. Keep `verifySubmission` untouched; call it only with a `txHash` (`isVerifiable`). For Safe/4337 wallets that return `safeTxHash`/`userOpHash`, show "waiting for other signers" and resolve to a tx hash via the wallet's own status method before verifying (resolution step is NOT implemented here).
- `apps/web/src/lib/walletMatrix.ts` (new): static `WalletProfile[]` JSON passed through `validateMatrix` at startup; fail closed to an empty matrix.
- `apps/web/src/views/Pay.tsx`: state `waitState`, message banner, "Stop waiting" button (does not cancel on-chain).
State (state.tsx): `pay.assessment: CompatReport | null`, `pay.waitState: WaitState`, `pay.pendingRef: PendingRef | null`.
i18n keys: `pay.compat.contractWallet`, `pay.compat.twoTx`, `pay.compat.awaitingSigners`, `pay.compat.stopWaiting`, `pay.compat.stoppedNote`, `pay.compat.batchOffer`, `pay.compat.invalidCode`, `pay.compat.delegated`, `pay.compat.unknownWallet`.
e2e ideas: mock provider returning `0x6080` code -> two-step flow and no permit prompt; mock receipts delayed 5 simulated minutes -> no failure; stop waiting -> idle without error; `eth_getCode` returns garbage -> approve path.

## 2. hw-signer
Files:
- `apps/web/src/views/Pay.tsx`: before `eth_sendTransaction` / `eth_signTypedData_v4`, build the request, call `createSignSession` and render `session.display.lines` as a "Check these on your device" table plus warnings via `describeSigningRisk`. When `display.blind`, require an extra checkbox. Drive `advance` with the wallet promise result (`signature`/`error`) and a tick from the app's timer (the timer lives in the app, not the package).
- `apps/web/src/lib/wallet.ts`: wrap provider rejection objects with `classifyHwError`; map `HwError.message` to i18n.
- `apps/web/src/lib/sweep.ts`: no change (HWSIG-1). The `Signer` interface is exported but not required until Phase 2.
i18n keys: `hw.review.title`, `hw.review.compare`, `hw.blind.confirm`, `hw.err.<code>` for each of the 11 codes, `hw.timeout`, `hw.tips.ledgerLike`, `hw.risk.<warning>`.
e2e ideas: mock wallet rejecting with 4001 shows the decline message and allows retry; mock wallet answering after 121 s is discarded; mock answering with a 32-byte value shows `malformed-signature`.
Manual (UNVERIFIED, needs real devices): the text on each device model versus `display.lines`, status words, blind-signing toggles.

## 3. wallet-connect (requires mode-guard, security review for the SDK)
Files (the SDK adapter is NOT written):
- New `apps/web/src/lib/wcAdapter.ts`: wraps the chosen WalletConnect SDK (pinned, after bundle-scan allowlist review). Before ANY SDK call, `relayGate(settings) === 'ok'`. Uses `buildProposal`, `settleSession`, `buildRequest`, `acceptResponse`, `sweepExpired` and returns an `Eip1193Provider`-shaped object whose `request()` rejects non-allowlisted methods with `{code:4200}`.
- `apps/web/src/lib/settings.ts`: `wc: {optedIn:false, disclosureAcked:null, relayUrl:null, projectId:null}` (defaults off, nothing hard-coded).
- `apps/web/src/views/Settings.tsx`: opt-in toggle, relay URL, project id, disclosure modal (increments `CURRENT_DISCLOSURE_VERSION` on text change).
- `apps/web/src/views/Pay.tsx`: extra wallet-list entry "Mobile wallet (WalletConnect)", QR/link from the pairing URI rendered locally; deep-link button on mobile; show `redactPairingUri` in any debug view.
- `apps/web/src/lib/defaultServices.ts`: register adapter factory lazily (no import at startup so the SDK chunk is not loaded before opt-in).
- CSP: connect-src already allows wss per spec; verify only the user-chosen relay host is contacted.
i18n keys: `wc.disclosure.title/body/accept`, `wc.settings.relayUrl`, `wc.settings.projectId`, `wc.gate.<reason>` (5), `wc.err.chainMismatch`, `wc.err.methodNotAllowed`, `wc.session.expired`, `wc.open.deepLink`.
e2e ideas: network spy sees zero connections before opt-in and acceptance; wrong chain answer produces the same WalletCallError as the injected path; replayed response ignored; session expiry mid-request.
