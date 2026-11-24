# 10 Feature 5 stage 1: privacy-aware scanning (Tor/proxy, padded fixed-window queries)

Priority P2 | Effort M (5-8 d) | Owner: chain-adapters + web | Deps: 02, 05
Sources: Roadmap Feature 5 stage 1/5B; gap-analysis item 9 (G-20); SPEC_REVIEW C5. Stages 2-3 stay research-only (no PIR/MPC build here).

## 1. Scope and honesty
Stage 1 hides **IP** from the RPC/indexer when the user supplies a SOCKS/Tor-capable path, and blurs **query range**. It does not hide the user's interest in the announcer, nor reduce download/CPU. A browser page cannot open SOCKS itself: supported modes are (a) user-configured HTTPS RPC/indexer endpoint reachable via Tor Browser (onion URL or normal URL), (b) user-run local proxy endpoint (`http://127.0.0.1:port` JSON-RPC forwarder over Tor). Copy must say this.

## 2. Interfaces
```ts
interface ScanTransport { name: 'direct'|'tor-browser'|'local-proxy'; endpoint: string; requireProxy: boolean }
interface WindowPolicy { windowBlocks: number /*fixed, e.g. 2048*/; alignTo: 'multiple'; padBefore: number; padAfter: number; jitterMs: [min,max]; maxParallel: 1 }
async function* scanWindows(adapter, from, to, policy, transport, signal): AsyncIterable<LogPage>
```
Rules: ranges aligned to multiples of `windowBlocks` (so many users issue identical queries); always fetch whole windows, discard out-of-range locally; filter only by announcer address + event topic (never by `schemeId`-derived tag or stealth address; the only caller filter is the public manifest router, for a single block too large to fetch whole, the same query for every GhostPay user); a window the provider refuses as too large is split into deterministic halves, only that window; the second RPC gets the same windows; request order randomised; CSPRNG jitter between requests (reuse `jitter.ts`); fixed dummy-sized requests optional ("cover windows" from random past ranges, capped, off by default); `requireProxy` blocks direct fallback (no silent downgrade, DNS-leak-safe: no fallback RPC unless user lists one). Optional indexer API `GET /v1/logs?chainId&from&to` returns public events + block hashes; client verifies emitter, ABI, block hash against second provider (spec 02 rule 7). Settings UI: transport, window size, "paranoid" preset, status line showing what each party learns.

## 3. Threats
Indexer injects/omits logs (verify emitter+hash, cross-check; omission only partly detectable); announcer spam in a window the indexer cannot serve (response cap) or cross-check (block cap) stops an indexer-sourced scan with an error, because the indexer always serves whole windows and has no caller filter (residual; the RPC source narrows such blocks to the router lane); window alignment leaks head position (inherent); windows cover only `eth_getLogs`: the `eth_getBlockByNumber` reads at the checkpoint, window ends, page end and checkpoint anchor are exact, so each RPC (including the second one) still learns exactly how far the seller has scanned (residual; grid-aligning those reads is future work); proxy misconfig leaks IP (egress Playwright test with mocked fetch); timing correlation (jitter, residual); user mistakes "Tor" for full privacy (copy).

## 4. Tests
Unit: window alignment properties, no request ever contains key/tag/address fields (schema-assert on all outgoing bodies); `requireProxy` blocks direct; jitter bounds. Playwright egress allowlist: only configured endpoint contacted. Malicious indexer fixture: forged and omitted logs detected where specified.

## 5. Acceptance
- [ ] Outgoing-request audit test green. - [ ] SPEC_REVIEW C5 wording fixed. - [ ] Docs list per-party disclosure table. - [ ] Stages 2-3 remain flagged "research, disabled".
