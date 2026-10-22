# Phase B review: P2 wallet handoff and QR

Date: 2026-10-21. Reviewer: documentation author (self-run; not independent). Playbook: Proposal 2. Related audits: 01 (P2-1..P2-4, S-07, G-25, G-28), 03.

## Scope reviewed

`apps/web/src/lib/wallet.ts` (EIP-6963 discovery, EIP-1193 calls, consistency checks), `qr.ts` and `components/QrView.tsx` (local QR), the receipt export in `payExec.ts`, wallet UI in `Pay.tsx`.

## What the feature does

Wallets are discovered through EIP-6963 announcements, with a clearly labelled `window.ethereum` fallback only when nothing announces. Before sending, the app re-checks the account and chain and refuses if they changed; it switches network once and refuses if the wallet will not. Invalid shapes, contradictory chain ids and lying account lists are rejected. QR codes are generated locally as SVG elements from numbers and a fixed path (no network, no inline style, no image decode), encoding the public invoice URL only, with a bearer-link warning. A local receipt can be downloaded.

## Evidence (existing tests)

| Check | Test |
|---|---|
| Discovery and sanitising | `wallet.test.ts`: "collects announced providers, sanitizing untrusted metadata", "falls back to a labelled injected provider only when nothing announced" |
| Consistency and refusal | "connects when everything is consistent", "refuses a provider that lies about accounts", "refuses a provider that gives contradictory chain ids", "rejects invalid shapes from the provider", "refuses to send if the account or chain changed after connecting" |
| Network switching | "switches network once when the wallet is on another chain", "refuses when the chain cannot be switched" |
| User rejection | "reports a user rejection plainly", "treats a user rejection during send as such" |
| Tx verification | "verifies an identical transaction", "reports not-visible-yet after retries", "throws on a contract-creation tx and on malformed shapes", "returns success and reverted states" |
| Signing | "signs typed data through the wallet", "rejects bad hashes and signatures from the wallet" |
| UI | `Pay.test.tsx`: "REFUSES a wallet that lies about its accounts or chain", "shows a clear message when no wallet is installed", "surfaces a user rejection and lets them retry" |
| QR | `qr.test.ts`: "builds a square matrix and a path from it", "is deterministic", "produces standalone SVG text with only numbers and a fixed path", "fails clearly when the text is too long for a QR code" |
| End to end (mock wallet, real browser) | Playwright "pays a native invoice: preview equals calldata, the wallet gets exactly that, and the user RPC confirms it" |

## Checklist

- [x] No hidden wallet fallback; labelled injected provider only.
- [x] Local QR, no network (egress test covers parse/review only; QR generation has no fetch by construction and a unit test on the output).
- [x] Provider lies about account/chain are refused.
- [x] Receipt is local; "included" is not "final".
- [ ] Two independent provider paths tested with **real** wallets: not done (audit P2-4; mock wallet only).
- [ ] `WalletAdapter` interface / capabilities / WalletConnect: not built (P2-1; optional in the playbook). Mobile users without an injected wallet cannot pay.
- [ ] Accessibility audit and localisation: no axe or screen-reader pass; no i18n layer (P2-3, S-07). Keyboard, labels, live regions and a contrast check exist in Playwright (Chromium only).
- [ ] Copy/download accessibility of the QR bearer warning: asserted by UI tests, not audited by users with assistive tech.

## Residual risks and gaps

1. A malicious wallet extension can lie about everything consistently; the independent RPC re-read is the only cross-check and needs a user RPC.
2. Wallet-side display (what the wallet shows the user) is outside the app's control. Users should confirm the router address, not the seller's.
3. QR codes of a bearer link are shoulder-surfing and screenshot risks; the link may also land in history when scanned by a phone camera that opens the browser (S3-03).
4. Browsers other than Chromium untested.

## Verdict

Good defensive design against mock failures; unproven against real wallets. Run on at least two real wallets on a testnet before any claim of compatibility.
