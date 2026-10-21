# Deviations, assumptions and open items (apps/web)

Real code in `packages/*` wins over the docs. Items below are differences from `docs/APP_AND_RELAYER_SPEC.md` section 1,
the roadmap features or the brief, plus things that are deliberately not done. Nothing here was verified against a real
wallet, a real chain or a real RPC provider; all of that is mocked.

## Dependencies
1. `@noble/hashes` (2.4.0) is declared in `package.json` because the keystore uses its scrypt; `package-lock.json` carries the entry (an earlier note here said it did not; that was stale, audit 01 section 5 row 7).
2. The app resolves `@ghostpay/*` through their built `dist/` (their `main`/`types`). Build those packages first on a clean checkout.

## Not implemented (and why)
3. **ERC-6538 registry (G-07)**: implemented in `components/RegistryPanel.tsx` (Seller keys view). The canonical registry address is a constant in
   `chain-adapters` (`0x6538E6bf4B0eBd30A8Ea093027Ac2422ce5d6538`, CONTRACTS_SPEC section 1), not a manifest field; the earlier reason given here ("the
   manifest has no registry address") was not a real blocker (audit 01 section 5 row 10). Before any use the app checks through the user's RPC that the address has
   code and answers `ERC6538REGISTRY_ENTRY_TYPE_HASH()` with the known constant. Publishing needs an explicit confirmation that it publicly and permanently links the
   signing wallet to the meta-address. Limit: no runtime code hash of the deployed registry has been verified from an official source (a behavioural probe only), and
   it was tested against mocks, not a real chain.
4. **Fiat-priced (`fiat_quote`) invoices cannot be paid yet**: `chain-adapters` ships an empty `FEEDS` table (no verified Chainlink addresses, see its
   `TODO-VERIFY.md`; official sources were unreachable). The code path exists and is unit-tested with an injected feed. Create invoice therefore **does not offer**
   "Fiat price" on a chain without a verified feed (`hasFeedsForChain`); it is not just a warning any more (G-03).
5. **Manifest trust (S3-01 / G-05).** Manifests are compiled into the hashed bundle from `deployments/<chainId>.json` (validated at build time); there is no
   runtime fetch and no mutable `/deployments/` path. Pay, Scan and Sweep are disabled until `verifyDeployment` has read the bundled addresses back from the chain
   (code hashes, `FEE_BPS == 25`, `FEE_RECIPIENT`, `ANNOUNCER == canonical`), through the user's RPC and, if configured, a second independent provider. This needs an
   RPC; **with no RPC nothing is payable** (previously a native payment worked without one). The signature field is verified against build-time release keys
   (`GHOSTPAY_RELEASE_PUBKEYS`, EMPTY by default), so by default the UI says "an unsigned manifest". A lying single RPC can still fake the read-back; the second
   provider is optional. A compromised host serving a different bundle defeats all of it (D7).
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

## Behaviour added by the audit fixes (docs/audits/03, 04)
- **Scan integrity (S3-02, D4):** announcement metadata is a claim. Rows are "Received" only after router caller + canonical block hash + an independent trace of the
  amount (ERC-20 `Transfer(router -> one-time address, net)` in that block; native: balance or successful router receipt). Non-router matches are "Unverified
  announcement". Matches are de-duplicated by (one-time address, ephemeral key), carry their chain id, and show confirmations against `finalityDepth`.
  "Deep scan" ignores the view tag for router announcements (costly, warned); "Check a payer's transaction hash" tests one transaction without the tag shortcut.
  The tag-free check is `core-crypto.checkAnnouncement(..., { ignoreViewTag: true })`, wrapped by `chain-adapters/deepscan`.
- **Sweep privacy (D1, D8):** the notice says the payer can follow the funds; the destination is looked up (transactions sent, balance, code, reuse in this tab) and a
  non-fresh destination needs an explicit acknowledgement; RPC-visibility warnings on Scan and Sweep. Destinations are NOT persisted (a stored list would itself be a
  linkage record); only this tab remembers them.
- **Direct sweep (S3-09):** allowlisted tokens only, `maxFeePerGas` capped at 500 gwei, native sweeps refused when the worst-case fee is over 5 % of the balance, and a
  confirmation screen shows the exact fee parameters before anything is signed.
- **Approvals (S3-19):** the allowance is read, never sent, before the final preview; the exact-amount approval is requested after the user confirms the preview; the
  allowance that really exists afterwards is shown (a wallet may let the user raise it) and "Revoke approval" is offered.
- **Display text (S3-12):** invoice memo and line items go through `lib/sanitize.ts` (bidi/zero-width/tag/private-use characters shown as `⟨U+XXXX⟩`, mixed-alphabet
  words flagged). The schema-level rejection belongs to `packages/invoice-schema` and is not done here.
- **Keystore (S3-13/S3-26):** import ceilings N<=2^18, r<=8, p<=2; passphrase minimum 14 characters plus a strength estimate; `autocomplete="off"`.
- **RPC (S3-14):** `chain-adapters` re-verifies `eth_chainId` every 60 s and after any transport failure; an optional second RPC per chain makes contract reads, balances,
  receipts and logs require identical answers. Rejecting private-range RPC hosts in the browser is NOT done.
- **Wallet picker (S3-22):** shows `rdns`, warns on duplicate names, a uuid announced twice with different identity, mixed-alphabet or non-ASCII names, missing `rdns`.
- **Tags (S3-16):** record id and lookup token are bound into the AAD, `find` checks the decrypted address. Old (v1-AAD) tag records do not decrypt (unreleased format).
- **Embed SDK (S3-10), CSP (S3-11), release hash (S3-04), history (S3-03):** see `README.md`.

## Hardening notes
19. `public/_headers` is the real header policy. Neither `vite preview` nor the unit tests apply it, so e2e exercises the **meta** CSP (same
    directives minus `frame-ancestors`, which browsers ignore in a meta tag). `scripts/scan-bundle.mjs` asserts the `_headers` file still
    contains the key directives and that the built `index.html` has no inline script/style/handler.
20. `connect-src` is `'self' https: wss:` by default because RPC and relayer origins are user data (spec section 1); the RPC adapter allows only https/wss. Setting `GHOSTPAY_CONNECT_ORIGINS` at build time narrows it (README). Meta-only hosting cannot enforce `frame-ancestors` or protect the worker script response.
21. **Bundle scan allowlist.** The scan fails on `eval`, `new Function`, `Function()`, string timers, `document.write`, `insertAdjacentHTML`,
    `outerHTML=`, `importScripts`, stray `Math.random`, any `innerHTML=` outside two React DOM fingerprints, any
    `dangerouslySetInnerHTML:`/`=` use, source maps, `@font-face`, remote CSS, inline HTML, shipped manifests and any URL host not in
    `ALLOWED_URLS`. React DOM and viem legitimately contain inert strings: SVG/XLink/MathML namespace identifiers (`w3.org`), React's
    error-decoder text (`react.dev/errors/`), and viem error-message hints (`viem.sh`, `4byte.sourcify.dev`). None is ever fetched; each is
    listed with its reason in the script. React DOM's own `innerHTML` uses (creating a `<script>` element through a div, and applying the
    `dangerouslySetInnerHTML` prop) are matched by exact fingerprints; the app source is separately scanned and ESLint-forbidden from using them.
22. No inline `style=` attributes are used anywhere (the CSP has no `'unsafe-inline'`): the QR code is an SVG built from React elements and CSS classes.

## Coverage exclusions (thresholds 90/85/90/90 are NOT lowered)
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

## Egress test scope (audit 01 section 5 row 12)
The Playwright suite asserts that only the app's own origin and the configured RPC are contacted during parsing/review (`app.spec.ts`), the whole payment flow
(`flows.spec.ts`, pay) and the scan flow (`flows.spec.ts`, scan). The sweep, Settings "Test" button and registry flows are covered by unit tests with injected
fetch/RPC only, not by an e2e egress assertion, and the allow-list is the single configured RPC origin (a relayer origin is not modelled in e2e).

## Unverified (be explicit)
- No real wallet, browser extension, mobile wallet, chain, RPC provider or relayer was used. Wallets and RPC are mocks; the manifests used in
  tests are clearly fake placeholders (`src/test/fakeManifest.ts`, `e2e/fixtures/84532.json`); the e2e mock node serves matching fake contract code so the real
  `verifyDeployment` runs, but no real contract was read.
- Only Chromium (the pre-installed build) was run; Firefox/Safari are untested. No axe/screen-reader audit was run: accessibility is by
  construction (labels, roles, live regions, focus management, 44 px targets, contrast ratio check in e2e) plus a few Playwright checks.
- The embed SDK was verified against a second local origin only; it was not tested inside real merchant pages.
- No external audit. `README`-level claims of privacy are bounded by `docs/threat-model/THREAT_MODEL.md`.
