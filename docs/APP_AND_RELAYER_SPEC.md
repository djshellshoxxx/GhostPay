# Web App and Relayer Specification (implementation targets)

Supplements DEVELOPER_SPECIFICATION Modules C and D, the Roadmap features, and FEE_SCHEDULE.md. Where they conflict, SPEC_REVIEW.md wins.

## 1. `apps/web` (React 19 + Vite 8, static output, TypeScript strict)

### Views (state-driven, no server routes; the invoice lives in `location.hash`)
1. **Home**: choose Seller / Pay / Sweep, privacy limits summary, fee disclosure, release hash display.
2. **Seller keys**: generate or import keys locally; show meta-address; backup via encrypted keystore export (scrypt N=2^17,r=8,p=1 from `@noble/hashes`, AES-256-GCM, versioned JSON); never write raw keys to storage; optional registry publish (ERC-6538) with a public-association warning.
3. **Create invoice**: form -> `createInvoice` + sign + optional encrypt -> link, QR (locally generated, no network), copy. Shows bearer-link warning.
4. **Pay**: parse `#gpi=` -> validation errors fail closed -> review screen (chain, token, destination derived, gross, fee from `FEE_SCHEDULE`, net, expiry, quote source/timestamp, fee recipient from manifest, public-data notice) -> optional jitter delay (Feature 6, nothing signed while waiting) -> optional gas buffer (Feature 1) -> wallet call built from the SAME object that the preview rendered; before sending, decode the final calldata and assert equality with the preview (token, stealth, gross, minNet, fee, metadata).
5. **Scan and receive**: select chain/RPC/start block; scanner worker; list matches; local encrypted tags (Feature 4).
6. **Sweep**: for a match, derive the stealth key in memory, show source/destination/fee/linkability notice, produce the EIP-712 sweep (+permit) signature, submit to relayer (quote shown) or direct broadcast if the user funds gas.
7. **Settings**: RPC URLs per chain (validated, https/wss only, chainId verified on connect), relayer URL, delay range, lock timeout, theme.
8. **About/Privacy**: observer table, limitations, fee disclosure, how to verify the release.

### Security controls (all testable)
- CSP: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' <user-configured origins injected at build as an allowlist plus a runtime-checked list>; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; worker-src 'self'`. Because user RPC origins are runtime data, `connect-src` is broad (`https: wss:`) in the static header with a runtime allowlist check in the RPC adapter; this trade-off is documented. `_headers` file for Cloudflare Pages/Netlify; meta CSP fallback for GitHub Pages (no `frame-ancestors`).
- `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, restrictive `Permissions-Policy`, COOP/CORP where hosts allow.
- No third-party scripts/fonts/analytics; Playwright egress test fails on any request to an origin that is not same-origin or a configured RPC/relayer.
- Never log `location.href`/hash; after parsing, offer `history.replaceState` to clear the fragment.
- Secrets live in a dedicated module with non-serializable types; Web Worker receives the viewing key only during a scan; worker has no network access by design (the adapter fetches logs; worker gets public logs only) with a test that scanning code imports no `fetch`/`WebSocket`/`XMLHttpRequest`.
- Build output scan script: fails on `eval`, `new Function`, `innerHTML`, `dangerouslySetInnerHTML`, `http://` literals, unknown hostnames.
- Accessibility: keyboard flows, labelled inputs, ARIA live regions for status, no colour-only status.

## 2. `packages/chain-adapters` (viem)

`config/chains.ts` (ids, names, native symbol, block time, finality depth, log range cap), `config/tokens.ts` (allowlist per chain with decimals and permit support flag), `fees.ts` (`FEE_SCHEDULE`, pure fee/buffer/sponsor math with bigint), `deployments.ts` (manifest loader that validates JSON against `deployments/schema.json`), `rpc.ts` (client factory verifying `eth_chainId`, timeouts, response size cap, retry with jitter, optional fallback provider reconciliation), `logs.ts` (paginated `Announcement` log fetch with reorg-safe cursor, emitter and chain checks), `quote.ts` (Chainlink `latestRoundData` with staleness/positive/decimals checks; fail closed), `router.ts` (typed ABI wrappers + calldata decode for preview equality), `sweep.ts` (EIP-712 typed data builders and permit signing).

## 3. `apps/relayer` (Node 22, minimal dependencies: `viem` only plus Node built-ins)

HTTP JSON API, `Content-Type: application/json`, body cap 16 KiB, strict schema validation, no CORS wildcard (configured origin list), HTTPS terminated by the host.
- `POST /v1/quote` `{chainId, token, owner, destination, amount}` -> `{fee, feeTo, expiresAt, quoteToken}`; fee per FEE_SCHEDULE F-SPONSOR using a live gas estimate and token price in token units; `quoteToken` is an HMAC (server secret) over the quote so the server is stateless and single-use is enforced by the sweep nonce.
- `POST /v1/sweep` `{sweep, sweepSig, permit?, quoteToken}` -> verifies quote token, `sweep.fee >= quote.fee`, `sweep.feeTo == relayer feeTo`, chain/token allowlists, deadline window (<= 30 min), recovers signer == owner, simulates via `eth_call`/`estimateGas`, enforces gas price cap and daily budget, sends from the relayer hot key, returns `{txHash}`.
- `GET /healthz`, `GET /v1/info` (chains, fee policy, relayer fee address, version, policy cap). No auth for users; rate limits per IP-bucket and per owner address; circuit breaker when balance low or error rate high.
- Hot key from env or file (mode 600), never logged; balance alerts; one in-flight tx per chain with nonce management; bounded queue.
- Logging: structured, no request bodies, no destination, no signature; IP stored only as a rotating salted hash for rate limiting with <=24 h retention; documented privacy notice.
- Failure modes defined: RPC down (503), simulation revert (422 with reason class only), budget exhausted (429/503), replay (409).
- Compliance hook interface (`PolicyGate`) executed before sending; default allow-all; operator may supply a sanctions screen (ADR-0006).

## 4. Release engineering
Reproducible build script, `SHA256SUMS`, SBOM (CycloneDX via `npm sbom`), signed tag instructions, GitHub Actions workflows with SHA-pinned actions and least-privilege permissions (drafted with `@<SHA>` placeholders only where the SHA could not be verified offline; see audit notes), `_headers`, deployment manifest signing procedure.
