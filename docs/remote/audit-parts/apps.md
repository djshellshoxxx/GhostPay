# Audit part: apps/relayer and apps/web

Date 2026-10-21. Repo HEAD `3524033`. Read-only audit. No repo source edited. Scratch and builds in `/tmp/claude-0/audit-apps/`.
Evidence method: PoCs from `docs/audits/poc/` re-run against fresh builds (relayer compiled with `tsc --outDir` to scratch; web built with `vite build --outDir` to scratch, hash `index-BwN8AJe2.js`, which equals the clean-room hash in audit 03, so the stale-dist issue is not present in this checkout). New probe: `/tmp/claude-0/audit-apps/probe1.mjs`.
Key fact: `git diff d6e5ea1 HEAD -- apps/` is empty. No app code changed since audit 03, so every audit-03 finding about `apps/*` is still present unless noted below. Only `.github/` changed (ci.yml e2e job, release.yml, nightly.yml, dependabot).
Status vocabulary: CONFIRMED (reproduced or unambiguous in code), PLAUSIBLE (code path real, not exercised end to end), REFUTED, FIXED.
`npm audit --omit=dev`: 0 vulnerabilities (re-run today).

## 1. Verification of audit 03 findings that touch apps/*

| ID | Sev (orig) | Result | Evidence |
|---|---|---|---|
| S3-01 manifest is unauthenticated root of trust | High | CONFIRMED | `apps/web/src/lib/manifest.ts:33`, `lib/pay.ts` `assertReadyToSend` compares calldata `to` against `ctx.manifest.router` (same untrusted value). No `eth_getCode`/bytecode-hash read-back anywhere in `apps/web/src`. Unchanged code. |
| S3-02 forged announcement shown as payment | Medium | CONFIRMED | poc-02: `scanner matches forged announcement: true | metadata claims net = 1000000000000`. `ScanMatch.viaRouter` only changes a label (`lib/scanClient.ts` match build). |
| S3-03 fragment lands in History DB | Medium | CONFIRMED | poc-10 re-run: `urls in History DB: [.../, .../#gpi=v1.eyJ...] RESULT: full invoice fragment IS persisted`. |
| S3-04 release-hash widget self-attested | Medium | PARTLY FIXED | `lib/release.ts` still fetches same-origin entry script (self-attested, CONFIRMED by code). Pipeline gap FIXED: `.github/workflows/release.yml` now has SHA256SUMS check, CycloneDX/SBOM, `actions/attest-build-provenance`, `environment: release` approval. Widget copy and threat-model wording still need to say "informational only". |
| S3-05 breaker stuck half_open, healthz ok | Medium | CONFIRMED | poc-11 re-run: step 3 `409 nonce_used | healthz=ok breaker=half_open`; steps 4 and 5 (+1 h) `503 breaker_open`. `breaker.ts:41-48` `allow()` returns false in half_open; `service.ts:319` probe has no finally. |
| S3-06 gas griefing / breaker poisoning by reverted sweeps | Medium | PLAUSIBLE | Logic at `service.ts:372-378` (`sweep_reverted` -> `recordFailure`). Front-run not executed. Breaker accounting exercised via poc-11. |
| S3-07 XFF trust / rate-limit bypass | Low | CONFIRMED | poc-05: `trustProxyHops=0 -> 429s=30`, `trustProxyHops=1 -> 429s=0` with spoofed XFF. Also reproduced with the new probe (N-01). |
| S3-08 SecretBytes redaction best-effort | Low | CONFIRMED | poc-01 prints 11 LEAK lines (core-crypto, out of apps scope but reproduced). |
| S3-09 direct sweep to arbitrary "token", uncapped fee | Low | CONFIRMED | poc-07 passes; `views/Sweep.tsx` `onDirect` has no allowlist check although the page shows "will not be swept from here". |
| S3-10 embed SDK unversioned, no SRI | Low | CONFIRMED | `public/_headers`: `/ghostpay-embed-v1.js` `max-age=3600`. SDK code itself re-reviewed: sound (same-origin https link check, `noopener,noreferrer`, no innerHTML, fail closed when `document.currentScript` is null). |
| S3-11 meta-only hosting: framable, worker without CSP | Low | CONFIRMED | poc-04: headers mode `app renders inside a cross-origin <iframe> false`; meta mode `true`. Inline script/handler, `connect-src http:`, `frame-src` violations still blocked in both. No JS frame-buster exists (`grep window.top` empty). |
| S3-12 bidi/zero-width in invoice text | Low | CONFIRMED | poc-03: `SPOOF-ACCEPTED` x5. Rendered through React text nodes (no injection). |
| S3-13 keystore import scrypt cost, 10-char passphrase | Low | CONFIRMED | poc-08: `N=2^20,r=16,p=4 ... ~56 s CPU and ~2048 MiB RAM`. All AAD-tamper cases rejected. |
| S3-14 RPC adapter trust gaps | Low | CONFIRMED | poc-06: forged `blockHash` log and fabricated log ACCEPTED. |
| S3-15 scan UI chain relabel, no worker reply timeout | Low | CONFIRMED (code) | Code unchanged; not re-executed. |
| S3-16 tag record splice | Low | CONFIRMED | poc-08: `find(A) returns label of B`. |
| S3-17 CI/supply chain | Low | PARTLY FIXED | e2e job now in ci.yml (`npm run test:e2e`), release/nightly workflows, dependabot added. Still open: Dockerfile base images pinned by tag not digest (`apps/relayer/Dockerfile:5,15`), `.gitignore` patterns. Action SHA to tag mapping not verified here. |
| S3-18 relayer ops hardening | Low | CONFIRMED | (a) poc-05 `1100 half-open header connections ... legit /healthz NOT SERVED: ECONNRESET`. (c) example `feeTo` `0x...0001` passes `parseAddress` (`codec.ts`), so copy-paste burns fees. (d) `secrets.ts` still accepts `RELAYER_KEY`/`QUOTE_SECRET` env values. |
| S3-19 approval before final preview | Low | CONFIRMED (code) | `Pay.tsx` `onPrepare` -> `payExec.ensureAllowance`. |
| S3-20 quote token leading zeros | Info | CONFIRMED | poc-05: `two leading zeros in expiry still verifies true`. |
| S3-21..27 | Info | Unchanged | Not re-tested individually. |

Prior claims REFUTED: none. Everything in poc-04/05/09 marked "safe" held up again (no XSS, no alerts, 0 storage keys, 0 external requests, no service worker, referrer empty, preview-vs-calldata mutation 3000 nibble flips accepted=0, request smuggling and chunked cap rejected, CORS allowlist exact, `__proto__` rejected).

## 2. New findings

### N-01 Relayer lane exhaustion by zero-cost junk sweeps
- Severity: Medium. Status: CONFIRMED.
- File: `apps/relayer/src/service.ts:282-285,316-345` with `lane.ts:36-38`, `server.ts:183-190` (IP limit), `limiter.ts` (owner limit).
- Evidence: `probe1.mjs` part C. 40 concurrent sweeps, each signed by a fresh throw-away key (no funds, no allowance), each with its own spoofed `X-Forwarded-For` (example config `trustProxyHops: 1`), 300 ms simulated RPC latency: result `{ '422 token_transfer_failed': 16, '503 queue_full': 24 }`, 16 simulations ran, last finished at 4.9 s. A legitimate user in that window gets `503 queue_full`. Health stays `ok`, breaker `closed` (reverts are classed as user errors), so there is no alarm.
- Why: signature recovery and the owner limiter only prove a key exists, which an attacker mints for free. Every accepted request then occupies a lane slot for 3 RPC round trips (`eth_gasPrice`, `eth_getBalance`, `simulate`+`estimateGas`). Even without XFF spoofing, 30 req/min/IP across a handful of IPs saturates a 16-slot queue at typical RPC latency. This differs from S3-06: no funds and no front-running are needed and it does not touch the breaker.
- Fix: run the cheap eth_call simulation outside the serial lane (only the nonce acquire plus send needs serialization), cache gas price/balance for a few seconds, cap queue admission per IP bucket, require a fee-bearing precondition (for example an `balanceOf(owner) >= amount` cached read before queueing), and enforce the proxy allowlist so XFF cannot be spoofed (S3-07).

### N-02 Fee is never re-checked against current gas cost at send time
- Severity: Low. Status: CONFIRMED (code).
- File: `apps/relayer/src/service.ts:242` (`s.fee < quote.fee` is the only floor), `:315-380` (`runJob` accepts any `gasPrice <= maxGasPriceWei`).
- Evidence: the quote prices gas at quote-time `eth_gasPrice` with operator `gasUnits`; the job later sends at the then-current gas price and the real simulated `gasLimit` and never compares `gasLimit * gasPrice` (in token units) with `s.fee`. Quote TTL is configurable up to 600 s (`config.ts`), example 120 s.
- Exploit: quote when gas is low, wait for a spike up to `maxGasPriceWei` (example 5 gwei, no config ceiling), submit within TTL; relayer pays the difference. Bounded by TTL, daily budget and rate limits, so Low.
- Fix: at send time recompute `gasCost(gasLimit, gasPrice)` and refuse (`fee_below_cost`, 422/503) when `s.fee < gasCost`; clamp `quoteTtlSeconds` to a smaller maximum.

### N-03 Malformed request target yields 500 and an error-level log
- Severity: Low (Info). Status: CONFIRMED.
- File: `apps/relayer/src/server.ts:207` (`new URL(req.url ?? '/', base)` throws on targets such as `//` or `http://[`).
- Evidence: `probe1.mjs` A and A2: `GET // HTTP/1.1` and `GET http://[ HTTP/1.1` both return `500 Internal Server Error`. It is caught by `handle` (no crash, no stack leaked, generic body), but it is logged as `error`/`internal_error`, which can drive alerting noise and skews error-rate monitoring.
- Fix: wrap URL parsing and answer 400 `invalid_url`.

### N-04 Stale prepared payment survives an in-tab invoice swap (hashchange)
- Severity: Medium. Status: PLAUSIBLE (code path read, not executed in a browser).
- File: `apps/web/src/App.tsx:63-70` (`hashchange` replaces the fragment and forces the Pay view), `apps/web/src/views/Pay.tsx:55-72` (fragment effect sets `parsed` and `phase='review'` but never clears `built`, `wallet`, `result`, `bufferQuote`), `Pay.tsx:523` (FinalPreview rendered whenever `built !== undefined && phase !== 'done' && ctx !== undefined`), `lib/payExec.ts` / `lib/pay.ts` `assertReadyToSend` (compares router, chain, token and amounts only).
- Scenario: an attacker page opens the app (without `noopener`) with invoice A, the payer connects a wallet and presses Prepare; `built` contains a payment to the one-time address derived from A's meta-address. The attacker page then navigates the named window to the same app URL with fragment B (same-document navigation fires `hashchange`). The page now shows B's seller, memo and line items from `parsed`, while the still-enabled "Send payment in my wallet" button sends A's prepared transaction. Amounts must equal B's reviewed amounts for `assertReadyToSend` to pass, which an attacker controlling both invoices can arrange. The stealth destination is never compared with the reviewed invoice's meta-address. The embed SDK uses `noopener`, so only a custom attacker page can do this.
- Fix: key all Pay state on a fragment identity (reset `built`, `wallet`, `result`, `bufferQuote`, `schedule` whenever `fragment` changes), disable Send unless `built` was built from the current `parsed`, and consider ignoring `hashchange` while `phase` is not `input`/`review`.

### N-05 Ambiguous submission outcomes: viem retry on send, duplicate-sweep window
- Severity: Low. Status: PLAUSIBLE.
- File: `apps/relayer/src/runtime.ts:57` (`http(url, { timeout: 10_000, retryCount: 1 })`), `service.ts:350-363` (any exception from `nonces.acquire()`/`sendSweep` becomes `send_failed`, `nonces.invalidate()`, `budget.release`, `recordFailure`), `service.ts:366-379` (receipt timeout only invalidates the nonce).
- Issue: if the first `eth_sendRawTransaction` times out after the node accepted it, viem retries and gets `already known`/`nonce too low`, so the relayer reports `send_failed`, refunds the budget reservation and counts a breaker failure for a transaction that is actually in the mempool. The client retries; a second simulation on `latest` state may still pass, producing a second transaction that reverts on chain (relayer pays gas, breaker failure). The same window exists after `receipt_timeout` (lane released, first tx still pending, `eth_call` simulates on `latest`).
- Fix: use `retryCount: 0` for the send call (or treat `already known` as success with the locally computed hash), simulate against `pending`, and keep a short in-memory set of recently submitted `(owner, nonce)` pairs to reject duplicates before simulating.

### N-06 Web relayer client mis-parses the relayer error body and reads unbounded text before the size cap
- Severity: Low (Info). Status: CONFIRMED (code).
- File: `apps/web/src/lib/relayerClient.ts:45-47` expects `{"error": "<class>"}`; the relayer sends `{"error":{"code":"<class>"}}` (`server.ts` `send(... { error: { code } })`). The class is therefore never shown, so users see only `HTTP 503` and cannot tell `quote_expired` from `breaker_open`. Separately `res.text()` (line 41) is fully read before the 16 KiB check, so a hostile user-configured relayer can stream data for 15 s.
- Fix: read `j.error.code`; read with a streaming reader that stops at the cap.

### N-07 Relayer does not verify the sweep contract on chain; chain id is checked only at startup
- Severity: Low. Status: PLAUSIBLE.
- File: `apps/relayer/src/runtime.ts:49-56`, `config.ts:~215` (`sweepRelayer` from config when no manifest is present; allowed for testnets).
- Issue: no `eth_getCode`/bytecode-hash comparison and no `eth_chainId` re-check after startup. A typo or a repointed RPC makes the hot key sign sweeps against an arbitrary address (low impact: calldata only, but gas is spent) and the simulation would be answered by that RPC.
- Fix: at startup and periodically, compare `getCode(sweepRelayer)` keccak to the manifest `bytecodeHashes` and re-run `eth_chainId`.

### N-08 Config accepts an exposed listener with trusted-proxy mode
- Severity: Low. Status: CONFIRMED (code).
- File: `apps/relayer/src/config.ts:257-258` (`listen.host` any non-empty string; no cross-check with `trustProxyHops`), `relayer.config.example.json:4` (`trustProxyHops: 1`), `Dockerfile` `EXPOSE 8787`.
- Issue: nothing refuses `host: 0.0.0.0` together with `trustProxyHops >= 1`, the exact configuration that makes S3-07 and N-01 trivial.
- Fix: refuse (or log a startup warning for) non-loopback host with `trustProxyHops > 0` unless an explicit `trustedProxies` allowlist is configured and checked against `req.socket.remoteAddress`.

## 3. Areas reviewed with no new defect found

Relayer
- SSRF: no user-controlled outbound URL exists. Outbound traffic is only to operator-configured `rpcUrl`/`rpcUrlEnv`, validated by `validateRpcUrl` (https/wss, no credentials; loopback http only with flag). Private-range hosts are operator-trusted (S3-14 note). REFUTED as a request-driven SSRF.
- Auth/replay: authorization is the EIP-712 owner signature plus on-chain nonce. Lane serializes through receipt so duplicates normally see the used nonce (residual window in N-05). Quote HMAC covers chain, token, owner, destination, amount, fee, feeTo, expiry, constant-time compare (poc-05: lowered fee, extended expiry, different destination, uppercase MAC all null).
- Body/protocol handling: 16 KiB cap enforced on streamed bytes, CL+TE and duplicate CL rejected, content-type exact, strict key allowlists, `__proto__` rejected, CORS exact-match and `Vary: Origin`.
- Log leakage: `log.ts` `sanitizeFields` allowlists seven fields with regex shape checks; no IP/address/amount/body can be logged. Startup errors print only `ConfigError`/`ChainAdapterError` messages (no URL echo). No `uncaughtException` handler (S3-18h) but all request paths are caught.
- Key handling: key files must be mode 0600 and regular; values never in errors. Residual: env-var alternatives, hex string copy of the key in `main.ts`/`runtime.ts` cannot be zeroed (Info).
- Config validation: strict, bounded, mainnet gated by manifest plus `ALLOW_MAINNET=1`, token flags for non-adapter tokens are operator-asserted (not verified on chain; Info).
- Budget/gas bounds: `maxGasLimit`, `maxGasPriceWei`, per-day reservation budget and balance floor all enforced before send. Budget `release()` rollover quirk (S3-18g) is minor.

Web
- XSS: no `dangerouslySetInnerHTML`/`innerHTML`/`eval` in app source or bundle (bundle scan plus poc-04: payload rendered as literal text, 0 injected nodes, 0 alerts). All invoice strings render as React text. Wallet icons restricted to short base64 data URIs and `img-src` allows only `self data:`.
- CSP/referrer: headers file and meta CSP agree; `base-uri 'none'`, `object-src 'none'`, `form-action 'none'`; referrer `no-referrer` (poc-04: Referer headers `[null,""]`). Residuals are S3-11 (framing and `connect-src https:`) and the missing HSTS/Trusted Types noted there.
- Storage: only `ghostpay.settings.v1` (plain RPC URLs, documented) and scan checkpoints (block number and hash) in localStorage; tag vault in IndexedDB is ciphertext with HKDF keys; seller keys memory-only; keystore export AES-256-GCM, scrypt N=2^17, header bound as AAD. poc-04: 0 hex keys in DOM, empty storage after key generation.
- URL fragment handling: parsed in memory, cleared with `replaceState` (not enough for History DB, S3-03), size bounded at 16 KiB, canonical JSON depth-limited, signature verified; unsigned/invalid shown as warnings or blockers.
- Service worker: none shipped or registered (poc-04 `probe sw 0`; `worker-src 'self'`).
- Dependencies: exact pins, `npm audit --omit=dev` 0 findings; `viem`'s bundled noble 1.x remains (S3-24).

## 4. Not done
- No real browser-wallet, no real testnet RPC, no Docker build, no systemd run, no front-running test for S3-06, no browser execution for N-04 (code path only).
- `scan-bundle.mjs` was not re-run against the scratch build (script hard-codes `apps/web/dist`); the PoC-04 browser probes cover the same CSP/XSS claims.
