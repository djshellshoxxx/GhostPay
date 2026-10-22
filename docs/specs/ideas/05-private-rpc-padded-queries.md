# Idea 05 (A6): Tor/onion/proxy-aware RPC mode with padded fixed-window queries

Status: draft spec | Priority: shortlist #6 (ideas.md) | Effort: M (6-8 d, +1-2 d optional reference proxy) | Owner: chain-adapters + apps/web | Date: 2026-10-21
Closes: D8 (RPC sees IP + addresses), gap #9 / G-20. Refines [spec 10](../10-feature5-stage1-private-scanning.md) (see section 12 for corrections).
Plan: [../../remote/plans/ideas/05-private-rpc-padded-queries.md](../../remote/plans/ideas/05-private-rpc-padded-queries.md)
Read for this spec: `packages/chain-adapters/src/{rpc,logs}.ts`, `apps/web/src/lib/{settings,scanClient,jitter}.ts`, `apps/web/index.html`, `apps/web/public/_headers`, `docs/operators/local-scanner-and-rpc.md`. Browser behaviours I could not test are marked UNVERIFIED and need a manual check in the named browser before the docs claim them.

## 1. What a browser can and cannot do (read first)
- A web page **cannot** open SOCKS, cannot choose a proxy, cannot create a Tor circuit, cannot read the browser's proxy settings, and cannot verify that its own traffic goes through Tor. `fetch` goes wherever the browser (or OS/VPN) sends it. Any in-page "Tor mode" is therefore a **policy and hygiene layer**: it controls *which URLs the app contacts* and *the shape of the queries*, and relies on the user's environment for the IP hiding.
- A static page **cannot** run a Tor client. Tor-in-WASM/WebRTC bridges exist as research projects (Snowflake-style); none is audited for this use and bundling one is **rejected** here (supply-chain, size, no operator-run bridge allowed, performance).
- What does work, all 100% client-side:
  1. **Tor Browser** (user's). Every request, including to clearnet `https://` RPCs, leaves via Tor; `.onion` URLs resolve. The page cannot detect this reliably (UA/viewport heuristics are spoofable and fragile; they are used only for a *hint*, never for a security decision).
  2. **Onion RPC endpoint** (`http(s)://<56 chars>.onion`). In a browser without Tor the hostname does not resolve, so the request fails closed: an onion URL is **self-proving** that, if it works, the browser has a Tor-capable resolver. (Caveat: some systems resolve `.onion` through a gateway/DNS suffix; the app only accepts the literal `.onion` TLD, not gateways like `*.onion.*`).
  3. **User-run local forwarder** on loopback (`http://127.0.0.1:<port>`), which relays JSON-RPC to the real node through the user's Tor/SOCKS (`socks5h`). The page only talks HTTP to loopback; the proxy does the SOCKS. Not self-proving: the app cannot know what the forwarder does.
  4. **HTTPS gateway the user trusts** (a VPN or Tor-fronted reverse proxy at a normal URL). Indistinguishable from direct to the page. Treated as `direct` with a user-asserted label, never shown as verified.
- Browser obstacles (UNVERIFIED unless stated): (a) **CSP**: the current policy is `connect-src 'self' https: wss:` (read from `index.html`/`_headers`), so `http://*.onion` and `http://127.0.0.1` are blocked today; (b) **mixed content**: an `https:` page requesting `http://` is blocked except for "potentially trustworthy" origins; loopback is exempt in Chromium/Firefox, Safari behaviour UNVERIFIED; `.onion` is treated as trustworthy in Tor Browser (UNVERIFIED, version-dependent); (c) **Chrome Local/Private Network Access**: a public site calling loopback may trigger a permission prompt and a CORS preflight needing `Access-Control-Allow-Private-Network: true` (UNVERIFIED, version-dependent); (d) **CORS**: the node/forwarder must allow the app's origin, nothing else; (e) Tor latency and exit-node blocks by RPC providers (Cloudflare challenges) are real: expect timeouts/403.
- The CSP cannot be varied per user on static hosting. Section 4.6 therefore ships a **second entry page with a stricter meta CSP**.

## 2. Goals / non-goals
Goals: (G1) first-class Settings for a private RPC path (`onion`, `local-proxy`, `tor-browser`/`https-gateway` as user-asserted); (G2) "no direct fallback" (`requireProxy`) enforced in code *and*, in the private page, by the browser through CSP; (G3) fixed, aligned, padded `eth_getLogs` windows with randomized order and jitter; (G4) every RPC call the app makes goes through one choke point so nothing leaks outside the policy; (G5) honest status line showing what each party can still learn; (G6) wire `requestWithFallbackCheck` into the scanner (gap item 7) over the same private path.
Non-goals: no anonymity guarantee; not hiding transaction broadcast content, timing or wallet RPC (the injected wallet uses its own RPC); no PIR/MPC (spec 10 stages 2-3 stay research); no cover queries for *address* reads (rejected, section 7); no bundled Tor/WASM; **no GhostPay-operated indexer, proxy, bridge or directory** (spec 10's optional `GET /v1/logs` indexer is rejected under the no-operator-service constraint; users may point at any third-party or self-run standard JSON-RPC endpoint instead); no change to on-chain contracts.

## 3. UX
Settings > "Private RPC" (per chain, next to the existing RPC URL):
- Mode: `Direct` (default, today's behaviour) | `Onion address` | `Local proxy (loopback)` | `I use Tor Browser / a VPN with my normal RPC URL`.
- Fields: endpoint URL (validated per mode, section 4.1), optional second endpoint for cross-checking, window size (250 / 500 / 1000 blocks; capped at the chain's `getLogsMaxRange`), preset: `Normal` | `Paranoid` (window 1000, start blur on, jitter 1-5 s, cover windows 1 per 4, cross-check on), "Never fall back to a direct connection" (default **on** whenever mode is not Direct, shown but its off state needs a confirm).
- Status line (always visible on Scan and Sweep): e.g. "Provider sees: Tor exit or no IP (you assert this), the announcer's logs for windows 11,000-12,999, not your address. Provider does not see: ... Everything below is not hidden: ..." with a per-party table (section 8). The line is colour-neutral; green only for `onion` that has answered `eth_chainId` this session ("reachable only through a Tor-capable resolver"), never for asserted modes.
- If the private path fails: "Could not reach your private RPC. Nothing was sent to any other server. [Retry] [Change settings] [Use direct for this scan only]". The last needs a modal that states the provider will see your IP; it does not persist.
- Link to a guide page `docs/user/private-rpc.md` (written at implementation time) with the browser-limits section 1 verbatim and the two supported setups (Tor Browser + onion URL; Tor + local forwarder).

## 4. Design
### 4.1 Endpoint kinds and validation (extends `validateRpcUrl`)
```ts
export type RpcPathKind = 'direct' | 'onion' | 'local-proxy' | 'asserted-private';
export interface PrivateEndpoint { kind: RpcPathKind; url: string; }          // url normalised by validatePrivateUrl
export function validatePrivateUrl(kind: RpcPathKind, raw: string): string;  // throws ChainAdapterError RPC_URL_REJECTED, message never echoes URL
```
- `direct`, `asserted-private`: as today (`https:`/`wss:`, no credentials, no fragment).
- `onion`: host matches `/^[a-z2-7]{56}\.onion$/` (v3 only; v2 is dead) or labelled subdomain of it; scheme `http:` or `https:`; no credentials, fragment; explicit port allowed.
- `local-proxy`: host exactly `127.0.0.1`, `[::1]` or `localhost`; scheme `http:`/`https:`; port required; path allowed; no credentials. (Extends the existing `allowInsecureLocalhost` idea with a typed kind instead of a boolean.)
Existing `rpcUrls` setting keeps meaning "direct". New settings fields (additive; `sanitizeSettings` already drops unknown/invalid fields, key stays `ghostpay.settings.v1`):
```ts
interface PrivateRpcSettings { mode: RpcPathKind; endpoints: Record<string /*chainId*/, string>; secondary?: Record<string,string>;
  requireProxy: boolean; windowBlocks: 250|500|1000; startBlurWindows: number /*0..128*/; coverEvery: number /*0=off, else 1 per N real*/; jitterMs: [number, number]; crossCheck: boolean; }
```
Storage warning kept: endpoints (and API keys in them) are plain text in `localStorage`; the local-proxy design keeps the upstream URL/API key in the forwarder's own config so the browser never holds it.

### 4.2 Single egress choke point
`createClient` already takes an `RpcTransport`. Add `PolicyTransport` (packages/chain-adapters/src/transport.ts):
```ts
export interface EgressPolicy { allowedOrigins: ReadonlySet<string>; requireProxy: boolean; methods: ReadonlySet<string>; }
export function policyTransport(inner: RpcTransport, policy: EgressPolicy, audit?: (e: { origin: string; method: string }) => void): RpcTransport;
```
It (1) rejects any URL whose origin is not in `allowedOrigins` (no redirect: `redirect: 'error'` already), (2) rejects any JSON-RPC `method` not in an allowlist (`eth_chainId`, `eth_blockNumber`, `eth_getBlockByNumber`, `eth_getLogs`, plus the specific read methods spec 02/sweep use: `eth_getBalance`, `eth_call`, `eth_getTransactionByHash`, `eth_getTransactionReceipt`, `eth_getCode`, `eth_getTransactionCount`, `eth_estimateGas`, `eth_gasPrice`, `eth_feeHistory`, `eth_sendRawTransaction`), (3) never constructs a second client on failure. Every RPC consumer in `apps/web` (scan, sweep, pay readback, manifest readback spec 01, payment verification spec 02) obtains clients from one factory `services.rpc(chainId)` that wraps the policy; a lint rule / test forbids `fetch(` and `new WebSocket(` outside that module and `relayerClient.ts` (existing worker scan already forbids network in the worker). WebSocket transport stays out of private modes in v1 (one long-lived connection is a stable fingerprint for the provider and not needed for log scans).
Tor-appropriate defaults when mode != direct: `timeoutMs` 45 000, `retries` 3, `maxParallel` 1, `maxResponseBytes` unchanged (2 MiB; windows of 1000 blocks on the announcer are small).

### 4.3 Fixed-window planner (packages/chain-adapters/src/windows.ts)
```ts
export interface WindowPolicy { windowBlocks: number; startBlurWindows: number; coverEvery: number; maxRealPerRun: number /*default 50*/; }
export interface Window { index: number; from: bigint; to: bigint; real: boolean }   // from = index*W, to = from+W-1
export function planWindows(opts: { nextBlock: bigint; confirmedHead: bigint; deployBlock: bigint; policy: WindowPolicy; random: () => number }): { order: Window[]; cursorAfter(done: ReadonlySet<number>): bigint };
```
Rules:
1. Global grid: window `k` covers `[k*W, (k+1)*W - 1]` from block 0, `W <= chain.getLogsMaxRange`, so every user with the same W on the same chain asks *byte-identical* ranges. (spec 10's example 2048 exceeds the 1000 cap in `chains.ts`; fixed.)
2. First window = `floor(nextBlock / W)`, minus `startBlurWindows` random extra windows chosen as a multiple of a coarse grid (`G=16` windows), never below the one containing `deployBlock`. Extra cost: at most `startBlurWindows` requests once, then the cursor is saved so it never repeats.
3. Last window is clipped to `confirmedHead = head - minConfirmations + 1` (the existing `minConfirmations`); the clipped query `to` equals the confirmed head. This reveals the (public) head. Querying beyond head instead is provider-dependent (UNVERIFIED), not used.
4. Whole windows are fetched; logs outside `[nextBlock, confirmedHead]` are discarded locally after fetch. Filter is only `{address: announcer, topics: [ANNOUNCEMENT_TOPIC, schemeIdTopic]}`: the same constants for every user (already how `logs.ts` builds it; a test locks this in).
5. Up to `maxRealPerRun` real windows are selected, then **shuffled** with CSPRNG Fisher-Yates; cover windows (if `coverEvery>0`) are random past windows from `[deployBlock, confirmedHead)` interleaved at about 1 per N real, fetched and discarded (never parsed into results, never counted as progress).
6. The cursor advances only across the **contiguous completed prefix** (set of done window indexes), so out-of-order completion cannot skip a hole. A window failure leaves its hole; the cursor stays before it.
7. Resume: the stored cursor is window-aligned (`nextBlock` multiple of W except at the clipped head). Reorg re-check: only blocks within `finalityDepth` of the head are verified via `getBlock`; the checkpoint is stored only for finalized windows, so the app never asks the provider about `cursor.last` (which would reveal the last scan position); `ScanCursor.last` becomes optional-unused in private mode. (Behavioural change to `fetchAnnouncements`; gated by `windowPolicy` option, default off, existing tests untouched.)
8. Jitter: between requests `randomDelayMs(jitterMs)` from `apps/web/src/lib/jitter.ts`, injected into the adapter as `sleep`/`random` options (chain-adapters cannot import from the web app). Defaults: Normal 200-2000 ms, Paranoid 1000-5000 ms. Timers are throttled in background tabs; the scan view shows that.
`fetchAnnouncements` gets `windowPolicy?: WindowPolicy`; scanning with no policy is bit-identical to today.

### 4.4 What the provider sees per request (the claim we can make)
For a log window the provider sees: a JSON-RPC `eth_getLogs` for the announcer address, a fixed topic list, and a grid-aligned range, from an IP that is (user-asserted) Tor/VPN/proxy. It does **not** see your viewing key, tag, stealth addresses (the filter does not include them), or which logs matched. The set of windows you fetch still reveals roughly **when you first started and when you last scanned** (first window, last window), your scan **cadence**, and **that you scan at all**. Padding hides the *exact* range of interest; with N users on the same grid and provider it makes you one of those users, and at present N is tiny: do not claim an anonymity set.

### 4.5 Other RPC calls (not padded; stated)
Sweep and verification reads (`eth_getBalance`/`eth_call balanceOf` for a one-time address, `eth_getTransactionByHash` for claim-by-hash) reveal the specific address/hash to the provider. Over a private path they are unlinked from your IP only. **Decoy address queries are rejected**: random decoys have zero balance, real ones do not, timing and ordering give the real one away, and it burns quota. Mitigations available: use your own node (local scanner doc), do these reads in a separate session/circuit (Tor Browser "New Identity"), and do not batch them with log scans. Broadcast (`eth_sendRawTransaction`) through the private endpoint hides IP, not content or timing; the wallet's own RPC (injected provider) is outside the app's control.

### 4.6 Strict private page (browser-enforced no-egress)
Second entry `apps/web/private/index.html` built from the same bundle (Vite multi-page; same hashed assets, same SRI/release verification as `index.html`; exact build change belongs to the plan). Its meta CSP: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' http://*.onion:* https://*.onion:* http://127.0.0.1:* http://localhost:* http://[::1]:* https://127.0.0.1:* https://localhost:*; object-src 'none'; base-uri 'none'; form-action 'none'; worker-src 'self'` (wildcard-TLD host-source validity, `[::1]` syntax and port wildcards are UNVERIFIED across browsers; fall back to listing explicit ports if one fails). There is no `https:`/`wss:`: the browser itself blocks every clearnet RPC, relayer, price feed or accidental fetch. That is the strongest `requireProxy` this architecture can offer: egress is limited to the static host, onion hosts and loopback. Consequences, stated in the UI: the relayer (https only today, `checkRelayerUrl`) is unusable unless its operator publishes an onion URL (allow `.onion` in `checkRelayerUrl` only in this build); fiat price feeds (spec 03) are unavailable; pure clearnet RPC is unavailable (use a local forwarder). Header CSP in `_headers` is not needed (meta works on GitHub Pages); where headers exist the `/private/*` path gets the same string. Loading the app itself still exposes the user's IP to the static host and its CDN: load the page in Tor Browser, or from a copy the user hosts (onion/IPFS/local file; hosting is owner-gated ADR-0015, outside this spec).

### 4.7 Optional reference forwarder (user-run, not a service)
`tools/private-rpc-proxy/` (Node, ~100 lines, zero dependencies beyond a SOCKS client if needed, UNVERIFIED lib choice): listens on loopback only; config file holds upstream RPC URL (incl. API key) and the Tor SOCKS address (`socks5h://127.0.0.1:9050`); accepts only POST of single JSON-RPC objects with the section 4.2 method allowlist; refuses batches and anything with `Origin` not equal to the configured app origin; replies with `Access-Control-Allow-Origin` pinned to that origin, `Access-Control-Allow-Private-Network: true` on preflight; size/time caps; no logging of request bodies. The point is to move SOCKS and secrets out of the browser. Shipping it is optional; if not shipped, the guide documents the three requirements for any forwarder. The project operates nothing.

## 5. Integration (cross-spec)
- Spec 02: scanner robustness and `requestWithFallbackCheck` use: scanner passes `secondary` (already in `FetchOptions`) built from the same policy; the second provider sees the same padded windows (and doubles exposure to one more operator, stated). Over Tor Browser both requests may share a circuit: provider collusion/correlation is not defeated.
- Spec 01 manifest readback and spec 02 verification calls use the same factory, so they are covered by `allowedOrigins`.
- B1 (backup) restores scan cursors window-aligned (rewind in 04 section 4.4 is a multiple of W).
- A5/C2: a future multi-relayer or scanner daemon reuses `policyTransport`.

## 6. Threat model
| Threat | Handling |
|---|---|
| Provider logs IP + query | hidden only if the user's path is Tor/proxy/VPN; onion kind self-proving; others asserted. |
| Silent downgrade to direct | `requireProxy` in `policyTransport` (code) + strict page CSP (browser). No automatic fallback RPC; secondary endpoint is only used if listed by the user and subject to the same policy. |
| DNS leak | clearnet hostnames resolve through the browser: safe only inside Tor Browser/VPN-with-DNS. Onion/loopback avoid clearnet DNS. Cannot be verified by the page. |
| Malicious/faulty RPC omits or forges logs | cross-check with a second endpoint where configured; validate emitter/ABI/block hash (existing `logs.ts`); omission only partly detectable. State in UI. |
| Malicious local forwarder | it sees all queries and could lie; user-run by definition; allowlisted methods limit what a compromised page can ask, not what a bad forwarder does. |
| Timing / cadence correlation | jitter, shuffled order, optional cover; residual correlation stays. Tor Browser circuit isolation is per site, not per request. |
| Misreading as anonymity | status line and docs state limits; no "anonymous" wording; Paranoid is still not anonymity. |
| Page fingerprint and static-host fetch | untouched; advice to use Tor Browser and (later) onion/IPFS hosting. |
| Settings tampering (XSS rewrites endpoint) | settings are plain `localStorage` (existing risk); the strict page narrows reachable origins; residual stated. |
| Quota/DoS of provider by cover traffic | capped (1 per N, per-run limit), default off. |

## 7. Rejected or redesigned
- Operator-run indexer/proxy/bridge/relay of any kind: rejected (constraint); replaced by user-supplied standard JSON-RPC endpoints and an optional user-run forwarder.
- In-page Tor (WASM): rejected. In-page SOCKS: impossible.
- Auto-detecting Tor Browser to turn the feature on: rejected as a security signal; hint only.
- Decoy address/balance queries: rejected (section 4.5).
- Third-party "is this Tor?" check (e.g. a Tor Project check endpoint): rejected as default because the check itself is an extra clearnet request; could be offered as a manual user-opened link.
- WebSocket subscriptions in private modes: out for v1.

## 8. Per-party disclosure table (to ship in docs and UI)
| Party | Learns in Direct | Learns in private modes | Still not hidden |
|---|---|---|---|
| RPC provider | IP, announcer log ranges (exact), reads of your one-time addresses, broadcast | no IP (if path real), grid-aligned ranges | that someone scans, approx start/last-scan, address reads and tx content, timing |
| Static host/CDN | IP, user agent, when you load the app | same unless app loaded via Tor/onion | |
| Relayer | owner, destination, amount, fee, timing, IP | IP only if relayer has onion URL | all sweep content |
| Wallet's RPC | payer/tx data | unchanged (outside app) | |
| Local network/ISP | RPC hostnames | with Tor: that you use Tor | |
| Chain observers | unchanged | unchanged | everything on-chain |

## 9. Failure modes
Unreachable onion/proxy (Tor not running) -> timeout after 45 s, clear message, nothing sent elsewhere. Mixed-content/CSP block (UNVERIFIED browsers) -> detect `TypeError` plus URL kind and show the specific cause list (section 1 obstacles) instead of "network error". CORS missing on forwarder -> same. Provider rejects Tor exit (403/429/challenge) -> retries with back-off, then fail closed; suggest another provider or own node. Window rejected by provider range cap -> halve `W` is NOT done automatically (would change the grid); show "provider max range is smaller than the grid; choose 250 or 500". `eth_chainId` mismatch -> reject (existing). Cross-check disagreement -> `RPC_FAILURE`, no data accepted. Tab backgrounded -> slow, resume safe by cursor rules. Checkpoint from direct mode (non-aligned) -> first private run re-aligns downward to the grid (re-fetches up to W-1 blocks, deduped by `id`).

## 10. Test plan
Unit (chain-adapters, `*.test.ts`): `validatePrivateUrl` tables (v3 onion ok, v2/short/gateway domains/credentials/ports rejected, loopback variants); window grid properties over a seeded PRNG loop (all `from % W == 0`, `to - from + 1 == W` except clipped tail, windows disjoint and cover `[nextBlock, head]`, shuffle is a permutation, cursor never skips a hole, cover windows never advance the cursor, start blur multiple of G and >= deploy window); `policyTransport` (foreign origin refused, disallowed method refused, no second attempt on another origin, redirect rejected); outgoing-body schema test: for a full simulated scan, every request is a single JSON-RPC object with allowlisted method, `eth_getLogs` params exactly `{address: announcer, topics: [TOPIC,...], fromBlock, toBlock}` and **no other field**, no key/tag/stealth address anywhere (assert by scanning bodies for the test viewing key, spending key, and each stealth address hex); `fetchAnnouncements` without policy unchanged (existing tests); retry/timeouts under Tor defaults with injected `sleep`.
Web: settings sanitize/migration (old settings load unchanged), mode switching, status line contents per mode, fallback modal requires confirm and does not persist, relayer URL onion allowance only in private build.
Playwright egress: (1) normal page: with private mode set to a mock onion/loopback endpoint, record all requests: only the static origin and the configured endpoint(s); (2) private page: assert the served CSP string equals the spec string and an injected `fetch('https://example.invalid')` is blocked by the browser (CSP violation event); (3) failure of the private endpoint produces zero requests to any other origin. Manual (CI cannot do Tor): Tor Browser + onion RPC, Tor + local forwarder in Chromium and Firefox, Safari loopback, Chrome PNA prompt; results recorded in `docs/reviews/` before docs claim support.
Malicious-endpoint fixture: forged log (wrong emitter), duplicate, wrong block hash, oversized response, slow-loris -> rejected within caps.

## 11. Acceptance criteria
- [ ] Single egress factory; test fails if `fetch`/`WebSocket` appear elsewhere (except relayer client and the static asset loader).
- [ ] Outgoing-request audit test green (no secret or per-user value ever in a request body).
- [ ] Window grid properties green; cursor never skips; direct-mode scanning unchanged.
- [ ] Strict page ships with exact CSP; Playwright proves browser-level block of clearnet.
- [ ] Status line + per-party table + browser-limits text shipped; reviewed by someone who did not write it; no "anonymous" wording (grep check).
- [ ] Manual compatibility matrix filled (Tor Browser, Chromium, Firefox, Safari) with unverified items marked.
- [ ] `requestWithFallbackCheck` used by the scanner when a second endpoint is set.
- [ ] `docs/operators/local-scanner-and-rpc.md` updated (it currently says no Tor mode exists); SPEC_REVIEW C5 wording checked.
- [ ] Spec 10 corrected (section 12).

## 12. Corrections to spec 10 and open points
Spec 10 proposes 2048-block windows (exceeds `getLogsMaxRange` 1000), an optional GhostPay-style `GET /v1/logs` indexer (rejected: operator service), `alignTo: 'multiple'` without a shared grid definition (fixed here: global grid from block 0), and `ScanTransport.requireProxy` without a browser-enforced counterpart (added: strict page). Open: exact CSP wildcard behaviour; whether to allow plain `http://` onion on an `https:` host page (blocked as mixed content in some browsers: then the user must open the app from an onion/IPFS copy); ADR for the second entry page and CSP split (needs a short ADR before code).

## 13. Effort and dependencies
Validation + transport policy 1.5 d; window planner + cursor semantics + `fetchAnnouncements` option 2 d; settings + UI + status line 1.5 d; strict page build + CSP + Playwright egress 1.5 d; docs + manual matrix 1 d; optional forwarder 1-2 d. Total 6-8 d (+1-2). Depends on: spec 02 (scanner/verification structure, can land in parallel if the factory is introduced first), spec 01 (uses the factory), ADR for the CSP split; hosting ADR-0015 only for onion/IPFS hosting advice. No contract or relayer change.

## 14. Audit checklist
- [ ] Every outbound request in `apps/web` enumerated; each goes through the factory or is an explicitly listed exception.
- [ ] No request body contains per-user values besides what section 4.4/4.5 list.
- [ ] No automatic downgrade path exists (grep + test); fallback modal does not persist.
- [ ] CSP string of the private page exactly as specified; subresource/release verification covers it.
- [ ] Window grid and cursor logic reviewed for hole-skipping (loss of payments is the worst bug here).
- [ ] Docs/UI claims match section 4.4 and 8; every browser behaviour claim either tested or marked UNVERIFIED.
- [ ] Optional forwarder (if shipped): loopback-only bind, origin pin, method allowlist, no logging, config secrets not echoed.
