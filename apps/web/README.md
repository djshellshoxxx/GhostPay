# @ghostpay/web

Static React 19 + Vite app: seller keys, invoice creation, pay, scan, sweep, settings, about (`src/views/`). Client-side only; invoice state lives in the URL fragment (`#gpi=v1.`). Uses `@ghostpay/chain-adapters`, `@ghostpay/core-crypto` and `@ghostpay/invoice-schema` (resolved through their built `dist/`, so run `npm run build:libs` first). It does not import `secret-box`, `tx-review`, `address-safety`, `btc-silent-payments` or `policy-scheme`.

Status: pre-audit; wallet, RPC and relayer interactions are mocked in tests; payment is disabled without a deployment manifest (none ships, see `deployments/`). Differences from the spec and open items: [`DEVIATIONS.md`](./DEVIATIONS.md). Embed SDK: `public/ghostpay-embed-v1.js` (popup only).

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

Prototype hosting on GitHub Pages (base path, CSP limits, theme overlay): [`docs/remote/pages-prototype.md`](../../docs/remote/pages-prototype.md). Not a hardened production host.
