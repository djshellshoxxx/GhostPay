# Deviations, assumptions and open items (apps/web)

Real code in `packages/*` wins over the docs. Items below are differences from `docs/APP_AND_RELAYER_SPEC.md` section 1,
the roadmap features or the brief, plus things that are deliberately not done. Nothing here was verified against a real
wallet, a real chain or a real RPC provider; all of that is mocked.

## Dependencies
1. `@noble/hashes` (2.4.0) is declared in `package.json` because the keystore uses its scrypt. It was already installed (hoisted,
   used by `core-crypto`), nothing was downloaded, but `package-lock.json` has no entry for it under `apps/web`. Run
   `npm install --package-lock-only` once (a root-level change that was out of this task's ownership).
2. The app resolves `@ghostpay/*` through their built `dist/` (their `main`/`types`). Build those packages first on a clean checkout.

## Not implemented (and why)
3. **ERC-6538 registry publish**: the deployment manifest has no registry address, and publishing associates the meta-address with a
   wallet publicly. The Seller keys page says so and shares the meta-address directly instead.
4. **Fiat-priced (`fiat_quote`) invoices cannot be paid yet**: `chain-adapters` ships an empty `FEEDS` table (no verified Chainlink
   addresses, see its `TODO-VERIFY.md`). The code path exists (`createPayContext` -> `readPrice` -> `fiatToTokenAmount`, round up for the
   payer) and is unit-tested with an injected feed; with no feed it fails closed with a plain message. The Create page warns about this.
5. **Manifest signatures are not verified.** `DeploymentManifest.signature` is optional and no release key exists. The UI shows
   "carries no signature" / "whose signature this app does not verify" next to the fee recipient instead of implying verification.
6. **Embed SDK (`public/ghostpay-embed-v1.js`)** is popup-only (GitHub Pages cannot send `frame-ancestors`) and takes a full invoice link
   (`data-invoice`), not `data-amount/currency/token/chain/merchant-id`: the merchant-profile mode needs a signed merchant profile
   format that does not exist yet. The link must be https (or `localhost`) and on the same origin as the script. Because the popup uses
   `noopener`, there is no `postMessage` channel and no completion callback in v1.
7. WalletConnect-style adapters (optional in the playbook) are not built. Wallet paths: EIP-6963 discovery and a labelled
   `window.ethereum` EIP-1193 fallback.
8. No network-reachable "light indexer" (Feature 5); scanning uses the user's RPC through `chain-adapters`.

## Behaviour choices the specs left open
9. **Relayer wire format.** `apps/relayer` did not exist when this was written, so the client follows APP_AND_RELAYER_SPEC section 3 literally:
   `POST /v1/quote {chainId, token, owner, destination, amount}` -> `{fee, feeTo, expiresAt, quoteToken}` and
   `POST /v1/sweep {sweep, sweepSig, permit, quoteToken}` -> `{txHash}`. All uint256 values are decimal strings. `permit` is
   `{value, deadline, v, r, s}` (the `sweepWithPermit` tuple). If the relayer chooses other names this client needs a one-file change
   (`src/lib/relayerClient.ts`). The client rejects a quote above the 3 % published cap before signing anything.
10. **Relayed sweeps need an ERC-2612 token** (the router sweep contract pulls with a permit). Other cases use the **direct sweep**: the
    stealth key signs a plain EIP-1559 transfer (ERC-20 `transfer` or native) that the stealth address pays gas for. The signed transaction
    is checked to carry the hash returned by the RPC.
11. **Local tags**: `chain-adapters` does not keep the transaction hash of an announcement, so the tag payload stores
    `announcementId = blockHash:logIndex` instead of `transactionHash`. The per-profile HKDF salt lives in one `meta` record rather than
    in every record; each record has its own fresh 96-bit IV. The idle lock timeout locks the tag vault only; seller keys stay in memory
    until wiped or the tab closes (auto-wiping unexported keys seemed worse).
12. **Gas buffer sizing** (Feature 1): `calculateBuffer` with a fixed 100 000 gas sweep estimate (not simulated), `2 x eth_gasPrice` as max
    fee, `DEFAULT_BUFFER_SAFETY_BPS` (20 %), a hard cap of 0.01 native coin, and a 120 s quote lifetime. It needs the user's RPC.
    Buffer payments go through approval (the router cannot combine a permit with a buffer).
13. **Permit domain version** is probed as `"2"` then `"1"`; each candidate is accepted only if the locally computed domain separator equals
    the token's on-chain `DOMAIN_SEPARATOR`. The wallet's permit signature is verified to recover to the payer before it is used.
    Spec 04 post-sign: `classifyPermit` (`chain-adapters/src/permit.ts`) re-reads allowance, nonce and domain and runs a static `permit`
    call. A front-run permit (allowance now covers) takes the allowance path; `nonce_consumed`/`sig_invalid`/`expired` raise
    `PermitRejectedError` with a per-state message, nothing is sent, and only the next user-pressed Prepare switches to an exact approval.
    A reverted static `permit` call is reported as `sig_invalid` even if an RPC fault caused it (fail closed). Option C (`PermitSkipped`
    event) is a contract change and is not done.
14. **Independent verification needs the user's RPC.** After `eth_sendTransaction`, the app fetches the transaction from the user's own
    RPC and compares sender, target, calldata, value and chain id with the preview (this is what catches a provider that mutates the
    transaction or lies about the chain). With no RPC configured the payment still works but the result says it could not be verified.
    A provider that lies consistently about everything AND has no independent RPC cannot be detected by a web page.
15. **Delay (Feature 6)** uses `performance.now()` for the due time and re-reads the invoice/quote/manifest state when it ends; the wall
    clock only decides invoice expiry. The page must stay open (closing the tab cancels; nothing is persisted, nothing is signed while waiting).
16. **Invoice link in the address bar** is cleared with `history.replaceState` right after it is read (default on, switchable in Settings,
    with a manual "Remove link" button otherwise). The invoice stays in memory only; "Forget this invoice" drops it.
17. The Create page cross-checks totals as `sum(qty x unit) + tax` and the Pay page recomputes them (`invoice-schema` leaves that to the UI).
    A mismatch blocks payment. Tax is rounded half-up from the percentage.
18. Settings (incl. RPC URLs that may contain provider keys) are stored in `localStorage` as plain text and the Settings page says so. No key
    material is ever stored; an e2e test inspects localStorage, sessionStorage, IndexedDB and cookies.

## Hardening notes
19. `public/_headers` is the real header policy. Neither `vite preview` nor the unit tests apply it, so e2e exercises the **meta** CSP (same
    directives minus `frame-ancestors`, which browsers ignore in a meta tag). `scripts/scan-bundle.mjs` asserts the `_headers` file still
    contains the key directives and that the built `index.html` has no inline script/style/handler.
20. `connect-src` is `'self' https: wss:` because RPC and relayer origins are user data (spec section 1); the RPC adapter allows only https/wss.
21. **Bundle scan allowlist.** The scan fails on `eval`, `new Function`, `Function()`, string timers, `document.write`, `insertAdjacentHTML`,
    `outerHTML=`, `importScripts`, stray `Math.random`, any `innerHTML=` outside two React DOM fingerprints, any
    `dangerouslySetInnerHTML:`/`=` use, source maps, `@font-face`, remote CSS, inline HTML, shipped manifests and any URL host not in
    `ALLOWED_URLS`. React DOM and viem legitimately contain inert strings: SVG/XLink/MathML namespace identifiers (`w3.org`), React's
    error-decoder text (`react.dev/errors/`), and viem error-message hints (`viem.sh`, `4byte.sourcify.dev`). None is ever fetched; each is
    listed with its reason in the script. React DOM's own `innerHTML` uses (creating a `<script>` element through a div, and applying the
    `dangerouslySetInnerHTML` prop) are matched by exact fingerprints; the app source is separately scanned and ESLint-forbidden from using them.
22. No inline `style=` attributes are used anywhere (the CSP has no `'unsafe-inline'`): the QR code is an SVG built from React elements and CSS classes.

## Coverage exclusions (thresholds 90/85/90/90 are NOT lowered)
Test files named `*.nocov.test.*` run in a second pass without coverage (`vitest.nocov.config.ts`, chained in `npm test`). Only the
150-case tag-archive fuzz (`src/lib/tagArchive.fuzz.nocov.test.ts`) does: v8 block coverage deoptimises scrypt ~10x (measured 13.9 s
uncovered vs >120 s covered). Its cases, 120 s deadline and KDF cost are unchanged, and `tagArchive.ts` is still covered by `tagArchive.test.ts`.
Excluded from the coverage denominator, each with its own evidence instead:
- `src/main.tsx`: bootstraps React with real globals (exercised by every e2e test).
- `src/lib/scanner.worker.ts`: a 10-line `onmessage` forwarder; all logic is in `scannerCore.ts` (tested in-process, including a source scan
  asserting no network/storage API) and the real worker runs in the e2e scan test under the CSP.
- `src/lib/workerFactory.ts`: one `new Worker(new URL(...))` line (e2e).
- `src/lib/idbStore.ts`: the IndexedDB `TagStore`; jsdom has no IndexedDB and no fake is installed. `tags.ts` is tested against `MemoryTagStore`; the
  real store is covered by the e2e test that inspects the real IndexedDB for ciphertext only and deletes it.
- `src/lib/defaultServices.ts`: wires real `fetch`, IndexedDB, `Worker` and wallet discovery into the `Services` interface (e2e).
- `src/test/**`, `*.test.*`, `*.testutil.*`, `src/vite-env.d.ts`: test code and ambient types.
Everything else under `src/` (all views, components and `lib/` logic) is measured.

## Unverified (be explicit)
- No real wallet, browser extension, mobile wallet, chain, RPC provider or relayer was used. Wallets and RPC are mocks; the manifest used in
  tests is a clearly fake placeholder in `src/test/fakeManifest.ts` and is never served by the app.
- Only Chromium (the pre-installed build) was run; Firefox/Safari are untested. No axe/screen-reader audit was run: accessibility is by
  construction (labels, roles, live regions, focus management, 44 px targets, contrast ratio check in e2e) plus a few Playwright checks.
- The embed SDK was verified against a second local origin only; it was not tested inside real merchant pages.
- No external audit. `README`-level claims of privacy are bounded by `docs/threat-model/THREAT_MODEL.md`.
