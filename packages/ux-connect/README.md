# @ghostpay/ux-connect

Pure logic (no DOM, no network, no timers; clock and ids are injected) for three usability specs:

- `compat.ts` smart-wallet-compat: `classifyAccount`, `choosePath`, `pollPolicy`, `evaluateWait`, `assessAccount`, `validateMatrix`, pending proposal refs.
- `hwsigner.ts` hw-signer: typed sign requests, on-device comparison text (`describeTx`, `describeTypedData`), sign sessions with timeouts, error taxonomy.
- `wcsession.ts` wallet-connect: allowlisted methods, namespaces/settlement, origin binding, request/response validation, pairing URI parsing, opt-in relay gate.
- `hex.ts` shared strict validators and `Result`.

Specs: `docs/remote/usability/specs/{smart-wallet-compat,hw-signer,wallet-connect}.md`.
Wiring: `docs/remote/usability/wiring/ux-connect.md`. Audit: `docs/remote/usability/audit-ux-connect.md`.

UNVERIFIED: no real wallet, device, relay or SDK was used. Hardware status words, WalletConnect codes and the pairing grammar are from memory. Not wired into apps/web.

Checks: `npm run typecheck && npm run lint && npm test` (coverage thresholds 95/90/95/95).
