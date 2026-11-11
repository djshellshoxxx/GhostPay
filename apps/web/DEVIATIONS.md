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
4. **Fiat-priced (`fiat_quote`) invoices cannot be paid yet**: `chain-adapters` ships `FEEDS` entries only for testnets (ETH/USD and
   USDC/USD on Sepolia and Base Sepolia, `packages/chain-adapters/src/quote.ts`; see its `TODO-VERIFY.md`) and none for other chains. The code path exists (`createPayContext` -> `readPrice` -> `fiatToTokenAmount`, round up for the
   payer) and is unit-tested with an injected feed; with no feed for the chain and pair it fails closed with a plain message. The Create page warns about this.
5. **Manifest signatures are not verified.** `DeploymentManifest.signature` is optional and no release key exists. The UI shows
   "carries no signature" / "whose signature this app does not verify" next to the fee recipient instead of implying verification.
6. **Embed SDK.** `public/ghostpay-embed-v1.js` is frozen and popup-only (takes a full `data-invoice` link, no `postMessage`, so pinned
   hashes stay valid). `public/ghostpay-embed-v2.js` adds the optional sandboxed iframe mode, a `postMessage` completion protocol
   (`src/lib/embedProtocol.ts`, `embedHost.ts`) and a signed merchant profile (`@ghostpay/invoice-schema` `merchantProfile`). Popup stays the
   default. Iframe mode only works on a header-capable host: the checkout answers the handshake only when built with
   `VITE_EMBED_IFRAME=1`, served with the opt-in `deploy/nginx/security-headers-embed.conf` (explicit `frame-ancestors` allowlist), and
   given a profile whose `origins` contains the embedding origin. **The profile is not a security gate yet:** `verifyMerchantProfile`
   (`invoice-schema` `merchantProfile.ts`) checks the signature only against the `signer` key embedded in the profile itself, so anyone
   can sign a profile listing any origin. The `frame-ancestors` allowlist is the only gate today; the profile must be bound to the invoice
   signer before it can authorize anything (audit L3-F7). GitHub Pages cannot send `frame-ancestors`, so the flag is
   off there (a test enforces it), the checkout never answers, and the SDK falls back to the popup after 4 s. Still open: the SDK takes
   an invoice link, not `data-amount/currency/token/chain/merchant-id` (profile `templates` are signed and parsed but not yet turned
   into invoices, `data-template` is only forwarded); the profile is supplied inline (`?gpm=`) or via `fetchMerchantProfile`, with no
   payer-facing fingerprint/"unverified identity" UI yet (`signerFingerprint` exists; Pay.tsx/locales are out of this worker's scope);
   no SRI value is published (S3-10, below); the Playwright hostile-host-page test is not written (jsdom tests only). Every header
   source (`public/_headers`, `deploy/nginx`, `infra`) sends `Access-Control-Allow-Origin: *` for both SDK files, so a merchant can use
   `integrity=... crossorigin="anonymous"` with a hash computed from the exact file they embed (see the v2 header comment).
7. WalletConnect-style adapters (optional in the playbook) are not built. Wallet paths: EIP-6963 discovery and a labelled
   `window.ethereum` EIP-1193 fallback.
8. No network-reachable "light indexer" (Feature 5); scanning uses the user's RPC through `chain-adapters`.

## Behaviour choices the specs left open
9. **Relayer wire format.** The client speaks the format `apps/relayer` parses (`src/validate.ts`):
   `POST /v1/quote {chainId, token, owner, destination, amount}` -> `{fee, feeTo, expiresAt, quoteToken}` and
   `POST /v1/sweep {chainId, sweep, sweepSig, permit, quoteToken}` -> `{txHash}`. The top-level `chainId` on the sweep is
   required by the relayer (relayer DEVIATIONS item 1) although APP_AND_RELAYER_SPEC section 3 omits it. All uint256 values are
   decimal strings. `permit` is `{value, deadline, v, r, s}` (the `sweepWithPermit` tuple). Errors are `{error: {code}}`.
   `src/lib/relayerContract.test.ts` runs this client against the relayer's real parsers and HTTP server, so a change on one side
   alone fails CI. The client rejects a quote above the 3 % published cap before signing anything.
10. **Relayed sweeps need an ERC-2612 token** (the router sweep contract pulls with a permit). Other cases use the **direct sweep**: the
    stealth key signs a plain EIP-1559 transfer (ERC-20 `transfer` or native) that the stealth address pays gas for. The signed transaction
    is checked to carry the hash returned by the RPC.
11. **Local tags**: `chain-adapters` does not keep the transaction hash of an announcement, so the tag payload stores
    `announcementId = blockHash:logIndex` instead of `transactionHash`. The per-profile HKDF salt lives in one `meta` record rather than
    in every record; each record has its own fresh 96-bit IV. Unlocked tag keys belong to the seller keys that unlocked them: any key
    change locks the tag vault (audit L1-04). **Idle lock** (Settings, default 15 minutes without a click or key press): it always
    locks the tag vault and clears key hex and passphrases typed into Seller keys (its tag archive form included) and Sweep (audit
    G2-05, review C-R11), and it wipes the seller keys only when a copy survives the wipe: keys imported from a keystore or as hex, a
    keystore downloaded in this tab, or the vault record they were unlocked from or saved to still saved in this browser. That record
    is looked up in storage when the lock fires, before "Wipe keys from memory" wipes the keys (review C-R9), whenever Seller keys
    reads the saved vault, and at the step-up for a keystore download or a new vault, so a record deleted in another tab or with
    the site data makes them unsaved again from then on; unlocking a vault and the sweep step-up do not look for it. A signing key
    generated at a hex import exists only in this tab: until a keystore download or a vault save, the banner says that this key
    has no backup while payments stay sweepable from the hex, and the notice after an idle-lock wipe says that it is gone (review
    C-R10). Keys with no copy anywhere stay in memory under a visible "no backup" banner, because wiping them would lose every
    payment sent to their meta-address (audit L1-01); after a wipe a visible notice says what happened. Until the keys are backed
    up, Create invoice, the meta-address text, QR and copy button on Seller keys, the publish path of the ERC-6538 registry page
    and the create form of the experimental policy view need a backup or a typed waiver (when only that generated signing key
    lacks one, the meta-address on Seller keys is shown, since nothing is signed with it); the waiver never lets the idle lock
    wipe keys with no copy anywhere. "Unlock saved vault" and "Wipe keys from memory" over keys without a backup ask first, naming
    what would be lost. Keys unlocked from, saved to or found in the vault keep that record's passphrase as a step-up for sweeps,
    keystore export and a new vault for the rest of the session, also if the saved record is deleted; deleting a vault that names
    the loaded meta-address needs its passphrase, any other vault is deleted after its meta-address is shown (audit L1-02). Keys
    that were never in a vault have no step-up passphrase.
12. **Gas buffer sizing** (Feature 1, spec 13): `calculateBuffer` over `max(100 000, eth_estimateGas of the token transfer + 25 %)`
    (fails closed when the simulation fails), `2 x eth_gasPrice` as max fee, `DEFAULT_BUFFER_SAFETY_BPS` (20 %), a hard cap of 0.01
    native coin, and a 60 s quote lifetime, re-checked before the wallet is asked. It needs the user's RPC. Buffer payments go through
    approval (permit + buffer needs a deferred router change). Invoice v2 `bufferPolicy` (ADR-0024): declined hides the buffer; accepted
    bounds it by `min(maxWei, cap)` and raises a smaller estimate to `minWei` (shown); `buildFinal` re-checks the bounds. The Create page
    has no control for the policy yet (v2 invoices can only be produced through `buildInvoiceLink({ bufferPolicy })`). The fiat
    estimate stays hidden while no feed exists for the chain and pair.
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
    **Still open: audit S3-10 and S3-11.** `scripts/embed-sri.mjs` (content-addressed SDK copy, `embed-sri.json` with the SHA-384 SRI
    value, immutable `_headers` rule) and `scripts/csp.mjs` (`GHOSTPAY_CONNECT_ORIGINS` narrows `connect-src`) are unit-tested
    (`src/buildScripts.test.ts`) but **not wired into `npm run build`**: `dist/` has no content-addressed SDK file and no SRI value, and
    `connect-src` stays broad whatever `GHOSTPAY_CONNECT_ORIGINS` is set to.
21. **Bundle scan allowlist.** The scan fails on `eval`, `new Function`, `Function()`, string timers, `document.write`, `insertAdjacentHTML`,
    `outerHTML=`, `importScripts`, stray `Math.random`, any `innerHTML=` outside two React DOM fingerprints, any
    `dangerouslySetInnerHTML:`/`=` use, source maps, `@font-face`, remote CSS, inline HTML, shipped manifests and any URL host not in
    `ALLOWED_URLS`. React DOM and viem legitimately contain inert strings: SVG/XLink/MathML namespace identifiers (`w3.org`), React's
    error-decoder text (`react.dev/errors/`), and viem error-message hints (`viem.sh`, `4byte.sourcify.dev`). None is ever fetched; each is
    listed with its reason in the script. React DOM's own `innerHTML` uses (creating a `<script>` element through a div, and applying the
    `dangerouslySetInnerHTML` prop) are matched by exact fingerprints; the app source is separately scanned and ESLint-forbidden from using them.
    Release boundary (audit L8-04): the scan also fails on fixed strings of preserved code (PIR client and scan sources, light-client,
    quorum, scan-mode claims, `groth16`, `privacy-pools`), and ESLint forbids importing `createScanSource`, `createPir2Source`,
    `createLightSource`, `createQuorumSource`, `describeScanMode` and `SCAN_MODE_CLAIMS` from `@ghostpay/scan-source` in apps/web.
22. No inline `style=` attributes are used anywhere (the CSP has no `'unsafe-inline'`): the QR code is an SVG built from React elements and CSS classes.
23. **Bitcoin view header chain (full build profile only; `features/btc` stays rejected by the lean profile guard).**
    `src/features/btc/headers.ts` anchors `HeaderChain` (`@ghostpay/btc-silent-payments`) at the selected test network's
    pinned genesis header and syncs it from the configured Esplora server (`GET /blocks/:height`, 10 headers per request,
    falling back to `/block-height/:h` + `/block/:hash/header`). This is **header-chain validation against the chain the
    source claims is best, with most-work selection. It is NOT SPV, NOT full validation and NOT trustless.**
    Checked on this device: header linkage, proof of work against each header's nBits and the network limit, the exact
    nBits the difficulty rules require, median-time-past and the 2-hour future limit, BIP-34/66/65 versions, most cumulative
    work (strictly more) among the branches seen. Every scanned block must equal the checked chain's hash at its height
    (`HeaderAnchoredTweakSource`); a block's transactions are bound to that header by the txid Merkle root and the BIP-141
    witness commitment (`esplora.ts`, unchanged). **Not checked / trusted:** transactions, scripts and amounts of the
    outputs being spent (earlier blocks), spent status, signet block signatures, Core checkpoints/assumevalid; the server
    is trusted for availability and can withhold a heavier chain or eclipse the device (only one source can be configured
    today; `syncHeaders` accepts several and fails closed if any fails); test-network proof of work is cheap, so a server
    can mine a heavier fork. A first sync starts at genesis (no later checkpoint is pinned): slow on testnet4/signet
    (~10 requests per 100 headers). One "Update headers"/scan call runs at most 25 rounds of 4032 headers (~100 000) and
    says when more remain; progress is saved every 5 rounds and at the end of every call (also before a failure), so it
    resumes. While headers are behind (for example after a forget and a capped resync), results from blocks above the
    checked tip are "not yet checked": they are kept, never treated as reorged, but cannot be selected for a sweep (the
    view says so), and a new scan never goes above the checked tip.
    Memory (measured, `packages/btc-silent-payments/scripts/bench-headerchain-memory.mjs`: node --expose-gc, regtest
    headers connected in 2016-header batches, GC'd `heapUsed + arrayBuffers` with the chain alive minus after dropping it):
    before the compact store ~2 040 bytes per header (100 000 headers = 204 MB; review measured ~2.1 KB); now 147 B/header
    at 100 000 and 196 B/header at 300 000 (the arrays grow by doubling): ~59 MB for 300 000 (at 400 000: ~59 MB of data at 147 B/header, plus up to ~29 MB transient while the arrays double). The
    chain keeps 80 raw bytes + 32 hash bytes per header in typed arrays and cumulative work every 2016 headers; parsed
    headers are built only on demand. A vitest guard (`headerchain.memory.test.ts`, 20 000 headers) fails above 250 B.
    Loading also holds the stored text (160 B/header, one flat hex string; released right after `JSON.parse`) and the
    parsed copy while re-validating: about +64 MB transient at 400 000. Size limit: `MAX_HEADERS` = 400 000 per network; a
    saved chain above it is deleted on load and a sync past it fails closed (`UNSUPPORTED`): nothing above checked headers
    is scanned. Ceiling: signet grows ~52 600 headers a year and is near 325 000 now (2026-11), so it reaches the limit
    around 2028; testnet4 (from 2024) is far below. Re-validation yields to the event loop every 2016 headers and shows
    progress (seconds of main-thread CPU for ~300 000 headers, but no freeze).
    Competing branches: once the server disagrees, the package streams its branch in chunks of 1000 into a compact
    validation context (any invalid header stops it at once), adopts it as soon as its cumulative work is strictly
    greater, and extends it in later rounds; "no more work" is reported only after the branch was compared up to the
    source tip. The budget is what would be replaced: more than 10 080 checked headers above the exact fork point is not
    evaluated ("would replace more than 10080 checked headers"); separately, a branch that has not overtaken within
    one round (4032 headers) past the checked tip while the server claims more is "not evaluated" (`FORK_UNRESOLVED`,
    its own message). Nothing changes in either case. A shallow reorg is followed however far ahead the server is.
    Persistence: IndexedDB `ghostpay-btc-headers` / store `chains`; key `headers:v1:<network>` holds JSON
    `{version: 2, network, checkpoint, headersHex}` (all active headers as one hex string) and `headers:v1:<network>:work`
    its cumulative work. Public chain data only: no key, address, amount or scan result. A save reads the stored work and
    writes in one transaction and never replaces a chain with strictly more work; a refused save says another tab or
    window holds a heavier chain. A save reports success only after the transaction commits (`oncomplete`). Load
    re-validates every header with the pinned genesis as the **required** checkpoint (`HeaderChain.fromJSON` no longer
    accepts a call without one); any failure (bad JSON, old record format, wrong network, a substituted self-consistent
    anchor, a tampered header, over the size limit) deletes the record and resyncs from genesis. Without IndexedDB (or
    when a save fails) the view says headers are not kept. The package's `ScanState` is still **not** persisted (it is
    private and needs an encrypted store): scan results stay in memory.
    Saved headers are keyed by network only, so they pin whichever server first filled them: after a deliberate server
    change the new server may look like a lighter fork (or its blocks are refused with `REORG_DETECTED`). The view then
    says so and offers **"Forget saved headers for this network"**, behind a confirmation, which deletes the record and the
    in-memory chain; the next check starts at genesis from the configured server. It is never done automatically.
    Forgetting cancels a running check and bumps a generation counter: a sync started before it may not save (its
    fail-closed save is skipped) or change scan results.
    Failure handling: any failure fails the header check, keeps (and has saved) only the valid prefix, and blocks the
    scan. The reason shown depends on the error: a header that breaks a chain rule (linkage, difficulty, timestamps,
    version) says "a header the server sent failed validation, so the server's chain could not be evaluated"; a
    malformed answer or a header without valid proof of work (both found while parsing) says "The server returned data
    this app cannot trust"; an unreachable server or HTTP error says "The server could not be reached or refused the
    request" (a server without `/blocks/:height` is first retried one header at a time); a fork too deep, or a longer
    branch that did not overtake within the round ("not evaluated", `FORK_UNRESOLVED`), and the size limit have their
    own messages. An extension chunk that does not build on the current tip is refused (it is never connected as a
    silent reorg), and the fork point is found exactly (doubling probe, then binary search), so the 10 080 budget
    counts the real depth. When a competing branch hits an invalid header, its valid prefix is still adopted if it
    already has more work; the error is reported after.
    Sweeping needs checked inputs: a review, signature or broadcast is allowed only while no check or scan is running
    (the header chain is updated in place during a check, before the view's state catches up) and every input's block
    is at or below the checked tip with the hash the live checked chain has at that height. Forget clears the review,
    approval, signed transaction and every selection; a checked tip that drops below a reviewed input clears the review
    and the selections that cannot be swept. These gates are layered on purpose: the buttons render disabled from the
    busy state and the reviewed inputs; the click handlers check the busy state through a ref (set together with the
    state) and the inputs against the live chain; a clearing effect drops a review whose inputs are no longer checked.
    Tests pin the button gates mid-check (chain still unchanged) and the handler gates by calling the real handlers
    (React props) mid-check and after a fork check. The clearing effect remains a backstop (results are reconciled
    first), not pinned on its own. A chain loaded from storage (after a
    forget, or another tab's) is always compared with the results on screen, even when the sync does not move its tip.
    A forget during a check ends the busy state at once; a check started before it may not save, set the checked tip,
    keep its loaded chain or change results. A branch with no more work is ignored and its blocks are
    refused (`REORG_DETECTED`). A branch with more work is adopted; scan results from checked blocks above the fork are
    removed (spend tweaks wiped), the result is cut back to the fork height (or discarded) and the view says so. This
    happens whenever the chain changed, also when a later round of the same sync fails or the action went stale (review
    H2): the shared chain is updated in place, so results are invalidated before anything else is reported.
    `scanForPayments` without `headers` still exists (unit tests and per-block checks); the view never calls it that way.
    Not done (review L-d): parsed context is not limited to the last 2016 + 11 headers in the sense of dropping old ones:
    fork evaluation, reorg checks of scan results (`hashAt` at any scanned height), the probe and persistence read old
    active headers, so all are kept, but compactly (above). Remaining gaps: `spentCount` of a cut-back scan still
    counts outputs from removed blocks. Known costs, not fixed: each save builds the whole record in memory (one hex
    string from `hexRange` plus its JSON copy, ~128 MB temporary at 400 000 headers); without IndexedDB the in-memory
    store keeps one more copy of that text (so memory roughly doubles); `HeaderChain.toJSON` (a package API the view
    no longer uses for storage) still creates one string per header. The size limit is enforced before every round:
    a round never fetches past it, and a check at the limit fails closed every time instead of growing the chain. Unverified: the
    `/blocks/:height` field mapping follows the electrs/Esplora API and is exercised only against the test mock (no live
    server is contacted by tests); a mismatch fails closed (each rebuilt header must hash to the summary's `id`).

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
- Only Chromium (the pre-installed build) was run; Firefox/Safari are untested. No screen-reader audit was run; axe-core runs in `e2e/accessibility.spec.ts` (`e2e/accessibility-audit.ts`): accessibility is by
  construction (labels, roles, live regions, focus management, 44 px targets, contrast ratio check in e2e) plus a few Playwright checks.
- The embed SDK was verified against a second local origin only; it was not tested inside real merchant pages.
- No external audit. `README`-level claims of privacy are bounded by `docs/threat-model/THREAT_MODEL.md`.
