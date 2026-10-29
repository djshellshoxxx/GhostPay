# @ghostpay/web

Static React 19 + Vite app. Client-side only: there is no server-side state. Invoice data lives in the URL fragment (`#gpi=v1.`), which the browser does not send to the host.

**Status: pre-audit, testnet only.** Wallet, RPC and relayer interactions are mocked in automated tests. Payment is disabled on every chain until a deployment manifest is loaded, and none ships (see `public/deployments/README.md`). Known deviations from the spec and open items: [`DEVIATIONS.md`](./DEVIATIONS.md).

## Views

Defined in `src/App.tsx` and `src/views/`:

| View | Purpose |
|---|---|
| Home | Entry point: "What do you want to do?" |
| Seller keys (`SellerKeys.tsx`) | Create or load the stealth meta-address keys |
| Create invoice (`CreateInvoice.tsx`) | Build a signed invoice link |
| Pay (`Pay.tsx`) | Review an invoice and pay it through the router |
| Scan (`Scan.tsx`) | Find payments with the viewing key |
| Sweep (`Sweep.tsx`) | Move a one-time address balance to a destination |
| Bitcoin (`src/features/btc/`) | Silent payments on testnet4, signet and regtest; mainnet disabled |
| Public registry (`src/features/registry/`) | ERC-6538 registry flow (testnet) |
| Settings (`Settings.tsx`) | RPC URL per chain, relayer URL (https only), payment delay range, idle lock (locks local tags; wipes seller keys only when they can be loaded again, never keys with no backup; hex keys imported without their signing key are wiped, and the signing key generated for them is lost with a notice), theme, pinned seller signing keys |
| About (`About.tsx`) | Project status and limits |

## Workspace dependencies

Imported from the other packages (non-test files only):

- `@ghostpay/chain-adapters`, `@ghostpay/core-crypto`, `@ghostpay/invoice-schema`: EVM invoices, keys, signing and router transactions.
- `@ghostpay/btc-silent-payments`: the Bitcoin view (`features/btc/*.ts`).
- `@ghostpay/secret-box`: `lib/session.ts`.
- `@ghostpay/tx-review`: `lib/sweep.ts`, `lib/txGuard.ts`.
- `@ghostpay/address-safety`: `lib/sweep.ts`, `lib/displayText.ts`.

Workspace packages resolve through their built `dist/`, so run `npm run build:libs` from the repository root before building or testing this app.

## Scripts (`package.json`)

```bash
npm run dev -w @ghostpay/web         # vite
npm run build -w @ghostpay/web       # tsc --noEmit && vite build; postbuild runs scripts/scan-bundle.mjs
npm run preview -w @ghostpay/web
npm run typecheck -w @ghostpay/web
npm run lint -w @ghostpay/web
npm test -w @ghostpay/web            # vitest run --coverage
npm run test:e2e -w @ghostpay/web    # Playwright (e2e/), needs Chromium
```

The Bitcoin regtest end-to-end test (`src/features/btc/regtest.e2e.test.ts`) needs a local regtest node and is not part of the default run.

## Embed script

`public/ghostpay-embed-v1.js` is the popup embed SDK (frozen); `public/ghostpay-embed-v2.js` adds the optional iframe mode. Their
behaviour is covered by `src/embed.test.ts` and `src/embedV2.test.ts`. No SRI value is published yet (audit S3-10 and S3-11 are open:
`scripts/embed-sri.mjs` and `scripts/csp.mjs` are not wired into the build, see [DEVIATIONS.md](DEVIATIONS.md) items 6 and 20).
Merchants who pin the SDK compute the SHA-384 of the exact file they embed; a changed file then fails closed.

## Hosting

Prototype hosting on GitHub Pages (base path, CSP limits, theme overlay): [`docs/remote/pages-prototype.md`](../../docs/remote/pages-prototype.md). This is not a hardened production host, and no official host exists.

## User-facing guides

Read the [user guides](../../docs/user/README.md) before using the app. They describe what each view does and what it reveals.
