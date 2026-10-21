# Security spec review: APP_AND_RELAYER_SPEC.md vs apps/relayer and apps/web

Scope: `docs/APP_AND_RELAYER_SPEC.md` (67 lines) checked against `apps/relayer/src/*.ts`, `apps/web/src/lib/sweep.ts`, `apps/web/src/lib/settings.ts`, `apps/web/public/_headers`, `apps/web/index.html`, `apps/web/scripts/scan-bundle.mjs`, plus `docs/FEE_SCHEDULE.md`, `docs/adr/ADR-LOG.md`, `docs/threat-model/THREAT_MODEL.md`, `docs/audits/03-security-review-client-relayer.md`, `apps/relayer/{README,PRIVACY,DEVIATIONS}.md`.

Branch: `claude/remote-extensions-1`. Review date: 2026-10-21. Method: code read only. No tests run, no PoC executed. Line refs are to the working tree at review time.

Evidence rules: `docs/remote/audits/*` (haiku reports) are unverified and were not relied on. Authority used: `docs/audits/0*.md` and the code.

## Summary

| Severity | Count | IDs |
|---|---|---|
| High | 3 | R-01, R-02, R-03 |
| Medium | 10 | R-04 .. R-07, R-10 .. R-13, R-15, R-25 |
| Low | 12 | R-08, R-09, R-14, R-16 .. R-24 |
| Total | 25 | |

Top three:
1. R-01: relayer breaker can latch in `half_open` forever. Still present in code. `/healthz` says `ok`.
2. R-02: per-owner limit is bypassable by minting owner keys. Serial lane can be filled by a sybil set. Quote path has no owner limit.
3. R-03: web client signs the relayer-chosen `feeTo` without checking it against the manifest fee recipient.

---

## Findings

### R-01 (High): breaker can latch in `half_open` permanently; health reports ok

- **Where:** `apps/relayer/src/breaker.ts:41-48` (`allow`), `:61-66` (`recordFailure`), `:36-38` (`isBlocking`); `apps/relayer/src/service.ts:282` (pre-lane `isBlocking`), `:319` (`breaker.allow()` in job), `:326`, `:332-347` (exits without record); `service.ts:173-179` (`health`). Spec: `docs/APP_AND_RELAYER_SPEC.md:35-36` (no state machine).
- **Evidence:** `allow()` moves `open` to `half_open` and admits one job. Only `recordSuccess` (to closed) and `recordFailure`/`trip` leave `half_open`. Any probe that exits without recording stays in `half_open`. Such exits include: `SimulationRevert` (rethrown by `op`, `service.ts:326`, `:342-344`), `gas_limit_too_high` (`:347`), `budget_exhausted` (`:350-352`), `gas_price_too_high` or `rpc_unavailable` from `gasPrice` (`:332`, not wrapped by `op`). Afterwards `allow()` returns false for `half_open` (`:42-47`) and `isBlocking()` is false (`:37`), so every later job gets `503 breaker_open` until restart. `health()` returns `ok` because only `open` counts as blocking (`:177`). Audit `docs/audits/03-security-review-client-relayer.md` S3-05 reports the same defect; PoC `docs/audits/poc/poc-11-relayer-breaker-stuck-half-open.mjs` exists. Not re-run here.
- **Trigger:** any owner-signed sweep that simulation-reverts (cheap, needs only a key), sent as the first request after cooldown.
- **Spec fix:** add to section 3, after the breaker sentence:
  > Circuit breaker states: `closed`, `open(until)`, `half_open(probe)`. Every admitted job MUST end by calling exactly one of `recordSuccess` or `recordFailure` (a user-caused outcome such as a simulation revert, `gas_limit_too_high`, `budget_exhausted` or `gas_price_too_high` counts as success for breaker purposes). A `half_open` state older than `cooldownSeconds` MUST revert to `open`. `/healthz` MUST report `degraded` while any chain is `half_open` for longer than `cooldownSeconds`.
  - Test: for each non-recording exit, a subsequent sweep after cooldown is admitted within one cooldown period.

### R-02 (High): owner rate limit is bypassable; serial lane and quote path are open to sybil DoS

- **Where:** `apps/relayer/src/service.ts:188-211` (`quote`, IP limit only, `eth_gasPrice` per call via `:304-314`), `:271-272` (owner limiter after signature recovery), `apps/relayer/src/lane.ts:156-195` (one job per chain), `:179` (`queue_full`), `service.ts:342` (simulation RPC inside the lane). Spec: `docs/APP_AND_RELAYER_SPEC.md:35` ("rate limits per IP-bucket and per owner address").
- **Evidence:** the owner key is the signing address, which an attacker creates freely. A fresh owner gets a fresh bucket (`limiter.ts:117-137`). Each sweep that passes signature recovery occupies the serial lane for at least one simulation RPC round trip. `maxPending` defaults to 16 (`config.ts:300`). Anyone with many IPs or owner keys can keep the lane full, and legitimate sweeps get `503 queue_full`. Quote path is bounded only per IP (`server.ts:243`) and each quote costs an RPC call. README `apps/relayer/README.md:98-99` admits the distributed case but the spec does not.
- **Spec fix:** replace line 35 with:
  > Admission control: (a) per-IP token bucket on all `POST` routes; (b) per-owner bucket after signature recovery; (c) a per-chain global bucket on jobs entering the lane, sized so that a full lane cannot starve a single-IP legitimate user for more than `queue.maxPending` jobs; (d) a cache of recent simulation failures keyed by the EIP-712 digest, TTL equal to `deadline` window. Limits are configuration keys with defaults and are tested by a load test that uses N distinct owners and M IPs.

### R-03 (High): web client signs the relayer-chosen `feeTo` without a manifest check

- **Where:** `apps/web/src/lib/sweep.ts:84` (only `!= owner` and `!= destination`), `:116` (`feeTo: i.quote.feeTo` signed into the EIP-712 order), `:111` (`deadline = now + 20 min`). Spec: `docs/APP_AND_RELAYER_SPEC.md:11` and `:17`/`:24` for the manifest fee recipient and relayer behaviour. Threat model `docs/threat-model/THREAT_MODEL.md:114` says the relayer "cannot change ... feeTo (enforced on-chain by the signature)". That holds only after the client has signed the relayer's chosen value.
- **Evidence:** `feeTo` comes from the relayer's `POST /v1/quote` response (`apps/web/src/lib/relayerClient.ts:84`). It is compared to neither `DeploymentManifest.feeRecipient` (field exists, `packages/chain-adapters/src/deployments.ts:13`) nor `GET /v1/info` `feeTo` that the client could check against the manifest. Fee is capped at 300 bps (`sweep.ts:81`), so a malicious relayer can divert up to 3% per sweep. Owner-address check does not protect this.
- **Spec fix:** add to section 1, view 6:
  > Relayed sweep: the client MUST refuse unless `quote.feeTo` equals the manifest fee recipient for the chain (ADR-0007). If the manifest has no fee recipient, relayed sweeps are disabled. The review screen MUST show the manifest-derived `feeTo` and the relayer-reported `feeTo` side by side when they differ (they must not differ to proceed).
  - Test: relayer returns a valid cap-compliant quote with a stranger `feeTo`; client throws and no signature is produced (`signSweep` not called).

### R-04 (Medium): fee is not checked against actual gas at send time

- **Where:** `apps/relayer/src/service.ts:194-196` (fee from configured `gasUnits` x quote-time `eth_gasPrice`), `:332` (gas price re-read at send), `:342-347` (gas limit from simulation +20%, capped only by `maxGasLimit`), `:349` (reservation). Spec `docs/APP_AND_RELAYER_SPEC.md:33`. DEVIATIONS item 2 (`apps/relayer/DEVIATIONS.md`) acknowledges operator-set gas units.
- **Evidence:** the `sweep` path checks `s.fee >= quote.fee` and `fee <= cap` only (`service.ts:242-243`). It never checks `fee >= ceil(gasLimit x gasPrice x 1.10)` in token units at send time. Gas price can rise during the 120 s TTL (`config.ts:282`), and the simulated gas can exceed `gasUnits`. Relayer then pays more than the fee covers.
- **Spec fix:** in section 3, add:
  > Before send, the relayer MUST verify `sweep.fee >= ceil(gasLimit x gasPrice x GAS_MULT_NUM / GAS_MULT_DEN)` converted to token units with the same converter used for the quote, else refuse with `422 fee_below_cost`. Quote TTL MUST NOT exceed the bound stated in the operator runbook for gas-price staleness.

### R-05 (Medium): mined reverts count as breaker failures; front-run griefing unspecified

- **Where:** `apps/relayer/src/service.ts:374-378` (`reverted` calls `breaker.recordFailure()`), contrasted with the comment at `:321` ("user-caused reverts do not"). Threat model `docs/threat-model/THREAT_MODEL.md:253` (OR 1.1, "front-run own signed sweep so the relayer's tx reverts", gap S3-06). Spec: no requirement.
- **Evidence:** an observer copies the broadcast calldata (sweep signature is public once the tx is in the mempool), submits it first, and the relayer's tx reverts with `NonceAlreadyUsed`. The revert is recorded as an operational failure and gas is lost. Repeating this trips the breaker at `failureRatio` 0.5 (`config.ts:296`).
- **Spec fix:** in section 3:
  > A mined transaction that reverts is an operational failure only when the revert is not explained by the order (`NonceAlreadyUsed`, `Expired`, `InvalidSignature`, `token_transfer_failed`). For those user-explainable reverts, the breaker is not charged. Relayer MUST NOT re-broadcast an order whose nonce is observed consumed.
  - Test: mined revert with `NonceAlreadyUsed` leaves breaker outcome window unchanged.

### R-06 (Medium): relayer `feeTo` defaults to the hot-key address and is not tied to the manifest

- **Where:** `apps/relayer/src/config.ts:197` (`feeTo` defaults to `ctx.hotKeyAddress`), `:198` (only `feeTo != sweepRelayer` enforced). `apps/relayer/src/main.ts:105-106` (hot key address passed as default). ADR-0007 in `docs/adr/ADR-LOG.md` (fee recipient from the manifest, no wallet address in defaults). Spec section 3 says nothing about `feeTo`.
- **Evidence:** fee revenue defaults to the account that signs every transaction. A hot-key compromise then loses gas budget and fee revenue together. Config can also set any `feeTo` without a check against the manifest. ADR-0007 and `FEE_SCHEDULE.md` require the owner-approved manifest recipient.
- **Spec fix:** in section 3:
  > `feeTo` is required per chain and MUST equal the manifest `feeRecipient` when a manifest exists (ADR-0007). The hot-key address MUST NOT be used as `feeTo`. Startup refuses otherwise.

### R-07 (Medium): spec body for `POST /v1/sweep` omits `chainId`, which the code requires

- **Where:** spec `docs/APP_AND_RELAYER_SPEC.md:34` (`{sweep, sweepSig, permit?, quoteToken}`). Code: `apps/relayer/src/validate.ts:76` (`chainId` required), `:92`. `apps/relayer/README.md:22`. `apps/relayer/DEVIATIONS.md` item 1.
- **Evidence:** a client written to the spec gets `400 invalid_chainId`. Spec and code disagree on the wire format. Chain id also selects the EIP-712 domain, so it must be in the signed-order description.
- **Spec fix:** replace line 34 body with `{chainId, sweep, sweepSig, permit?, quoteToken}` and add: "`chainId` selects the EIP-712 domain (`GhostPaySweepRelayer`, `1`, chainId, sweepRelayer)."

### R-08 (Low): failure-mode table is ambiguous

- **Where:** spec `docs/APP_AND_RELAYER_SPEC.md:38`; code `apps/relayer/src/service.ts:91-104` (REVERT_MAP), `:351` (`budget_exhausted` is 503 with Retry-After, not 429), `apps/relayer/src/server.ts:243-244` (429 `rate_limited_ip`).
- **Spec fix:** replace the sentence with a table that matches `apps/relayer/README.md` lines 33-45 exactly: `budget_exhausted` 503 with `Retry-After`; `rate_limited_owner`/`rate_limited_ip` 429; `replay` is `nonce_used` 409 only when simulation decodes `NonceAlreadyUsed`, otherwise `simulation_reverted` 422.

### R-09 (Low): spec and README claim quote single-use is enforced by the sweep nonce; it is not

- **Where:** spec `docs/APP_AND_RELAYER_SPEC.md:33`; `apps/relayer/src/quoteToken.ts:125-138` (MAC has no nonce or deadline), `:143-153`; `apps/relayer/src/service.ts:231-238`; `apps/relayer/README.md:97`.
- **Evidence:** one quote validates any sweep with the same chain, token, owner, destination, amount, fee, feeTo until `expiresAt`. The contract nonce blocks replay of one signed order, not reuse of the quote across orders. Harm is limited because each order needs the owner's signature.
- **Spec fix:** "A quote token is stateless and reusable for any order with the same bound fields until `expiresAt`. Replay of a signed order is blocked by the contract nonce. Quote reuse for a different nonce or deadline is accepted by design."

### R-10 (Medium): response semantics of `POST /v1/sweep` are undefined

- **Where:** spec `docs/APP_AND_RELAYER_SPEC.md:34`. Code: `apps/relayer/src/service.ts:365` and `:380` (response returned at broadcast, settlement continues async), `apps/relayer/src/lane.ts:184-186`; `apps/relayer/DEVIATIONS.md` item 7; `apps/web/src/lib/relayerClient.ts:103` (client comment: "verify it on your own RPC"). No status endpoint.
- **Evidence:** `{txHash}` means "broadcast", not "mined" or "succeeded". The client has no way to learn a revert except its own RPC. Spec is silent.
- **Spec fix:** "`{txHash}` is returned after broadcast, not after inclusion. The relayer makes no success promise. Clients MUST confirm inclusion and status on their own RPC. Optional `GET /v1/sweep/{txHash}` returns `pending|success|reverted|timeout` if implemented."

### R-11 (Medium): hot key may come from an env value with no permission check

- **Where:** spec `docs/APP_AND_RELAYER_SPEC.md:36` ("Hot key from env or file (mode 600)"). Code: `apps/relayer/src/secrets.ts:248-281` (mode check only on file path, `:262-265`), `:284` (`RELAYER_KEY` value var accepted).
- **Evidence:** a raw key in the environment is readable by same-uid processes (`/proc/<pid>/environ`) and by orchestrators. The systemd unit uses the file form (`apps/relayer/deploy/ghostpay-relayer.service`), the code does not refuse the env form.
- **Spec fix:** "The hot key MUST be read from a file with mode 0600 or stricter. The env-value form is for development only and requires `allowInsecureKeyEnv: true`; startup refuses it otherwise."

### R-12 (Medium): proxy trust, bind address and rate-limit keying are not specified

- **Where:** `apps/relayer/src/server.ts:167-176` (`clientIp`), `apps/relayer/src/config.ts:281` (`trustProxyHops` default 0), `apps/relayer/relayer.config.example.json:4` (`"trustProxyHops": 1`), `apps/relayer/src/config.ts:258` (`host` default `127.0.0.1`), `apps/relayer/Dockerfile:28` (`EXPOSE 8787`). Spec section 3 silent. Audit S3-07 documents XFF bypass.
- **Evidence:** when `trustProxyHops >= 1` and the listener is reachable without the proxy, the client chooses its bucket by header. When hops exceed real proxies, all clients share the proxy's bucket (`server.ts:172-175`). The Docker image exposes 8787 and the default host is loopback, so the image must override host, which the spec does not say.
- **Spec fix:** add to section 3: "The listener MUST accept connections only from the proxy (loopback or unix socket) unless `trustProxyHops` is 0. `trustProxyHops` MUST equal the number of trusted proxies. Startup MUST refuse `trustProxyHops > 0` with a non-loopback listener. Rate-limit IPv6 keys by /64."

### R-13 (Medium): single RPC trust for simulation, balance, nonce and receipts is not specified; RPC errors look like timeouts

- **Where:** `apps/relayer/src/runtime.ts:57` (one HTTP transport per chain, `retryCount: 1`, no response size cap), `apps/relayer/src/chain.ts:151-158` (`waitForReceipt` maps every error to `timeout`), `apps/relayer/src/service.ts:369-373` (timeout invalidates nonce; budget not released). Spec section 2 lists "response size cap" and "fallback provider reconciliation" for `rpc.ts`; spec section 3 says nothing about relayer RPC trust. Audit S3-14 and threat model trust boundary "user-chosen RPC provider".
- **Evidence:** a malicious or stale RPC controls simulation, balance, pending nonce and receipts. A transport error during receipt polling is indistinguishable from a dropped transaction, and the next nonce is re-read from a possibly stale node. `requestWithFallbackCheck` exists but is not used by the scanner or the relayer (spec section 5, `docs/APP_AND_RELAYER_SPEC.md:60`).
- **Spec fix:** section 3: "RPC responses are untrusted for accounting. The relayer MUST (a) use reconciliation across at least two endpoints for balance and receipt status, or (b) document single-RPC trust as an accepted risk in `PRIVACY.md` and the operator runbook. Receipt polling errors are distinct from `timeout`: `rpc_error` keeps the nonce and budget reservation."

### R-14 (Low): permit handling is unspecified

- **Where:** `apps/relayer/src/service.ts:225-228` (only `permit.value >= amount` and token permit flag), `apps/relayer/src/validate.ts:80-90` (no permit owner, no deadline window). Spec section 3 silent.
- **Evidence:** the permit signature, its deadline and its nonce are verified only by the simulation (`eth_call`). A permit with `deadline` in the past causes an opaque `simulation_reverted`.
- **Spec fix:** "Permit: `permit.deadline` MUST satisfy the same window as `sweep.deadline`; `permit.value >= amount`; the permit signature is verified by simulation only and mapped to `invalid_signature` 422."

### R-15 (Medium): build-scan rule in spec does not match `scan-bundle.mjs`; worker check is name-based

- **Where:** spec `docs/APP_AND_RELAYER_SPEC.md:23` ("fails on ... `innerHTML` ... `http://` literals, unknown hostnames"). Code: `apps/web/scripts/scan-bundle.mjs:12-20` (`ALLOWED_URLS` allows four `http://www.w3.org/...` and viem/React literals), `:23-27` (React innerHTML fingerprints), `:97-99` (network-API check runs only on files whose name matches `/worker/i`).
- **Evidence:** the spec's absolute wording is not what is enforced. If the scanner core ever ships in a non-`worker` chunk, the network-API check silently does not apply. Spec section 1 claims a test "that scanning code imports no fetch/WebSocket/XMLHttpRequest" which is a source-level check on `scannerCore.ts` only.
- **Spec fix:** "Build scan fails on `eval`, `new Function`, `.innerHTML =` outside the allowlisted React fingerprints, `http://` literals except the allowlist in `scan-bundle.mjs` `ALLOWED_URLS`, and unknown hostnames. Network APIs are forbidden in every chunk that imports `scannerCore`, identified by module graph, not by file name."

### R-16 (Low): section 1 presents an egress test as a control that works

- **Where:** spec `docs/APP_AND_RELAYER_SPEC.md:20` ("Playwright egress test fails on any request ... ") and `:17` ("Security controls (all testable)"). Section 5 row S1 security controls (`:56`) admits the test covers parse and review only. Code: `apps/web/e2e/*.spec.ts`.
- **Spec fix:** mark the sentence as target. Add: "Current coverage: parse and review screens only (section 5). Pay, scan and sweep egress assertions are required before a release."

### R-17 (Low): PolicyGate cannot be supplied by an operator and its order is undefined

- **Where:** spec `docs/APP_AND_RELAYER_SPEC.md:39`. Code: `apps/relayer/src/main.ts:106-107` (no policy argument; `runtime.ts:23` accepts one only in code), `apps/relayer/src/service.ts:271-280` (order: owner limit, then policy, fail-closed 503 `policy_unavailable`).
- **Spec fix:** "PolicyGate is a constructor dependency. Operators supply it by a module path in `RELAYER_POLICY_MODULE`, validated at startup. Order: signature recovery, owner limit, policy, breaker, simulation, send. Policy errors fail closed with 503 `policy_unavailable`."

### R-18 (Low): relayer URL rules are not in the CSP paragraph

- **Where:** spec `docs/APP_AND_RELAYER_SPEC.md:18` says the runtime allowlist is in "the RPC adapter". The relayer URL is checked only in `apps/web/src/lib/settings.ts:40` (`checkRelayerUrl`, https, no credentials, no query or fragment) and by `relayerClient.ts:31-40` (`redirect: 'error'`, `credentials: 'omit'`).
- **Spec fix:** name `checkRelayerUrl` as the relayer origin check and list its rules. Add: "relayer fetches use `redirect: 'error'` and `credentials: 'omit'` (tested)."

### R-19 (Low): sweep deadline hard-coded to 20 min without reading the relayer window

- **Where:** `apps/web/src/lib/sweep.ts:111` (`nowSeconds + 20 * 60`). Relayer window: `apps/relayer/src/config.ts:261-262` (min 30 s default, max configurable up to 1800 s), `apps/relayer/src/service.ts:246-247` (`deadline_too_soon`, `deadline_too_far`). Spec section 3 line 34 gives only "<= 30 min".
- **Spec fix:** "Client reads `deadlineWindowSeconds` from `GET /v1/info` and sets `deadline` inside it, with margin. Otherwise refuse relayed sweeps."

### R-20 (Low): stale or unverifiable claims in sections 3 and 4

- Section 4 (`docs/APP_AND_RELAYER_SPEC.md:42`) says actions are "drafted with `@<SHA>` placeholders only where the SHA could not be verified". `.github/workflows/ci.yml:24-128` and `nightly.yml:32-35` carry full SHAs. SHAs were not checked against upstream tags in this review (unverified). Section 5 row S4 (`docs/APP_AND_RELAYER_SPEC.md:67`) says the workflows are "drafted ... and have never run on GitHub", which conflicts with a live CI file.
- Section 3 "viem only plus Node built-ins" is corrected in section 5 (`:62`) but still stated as the target in `:30`. Node 22 claim vs `@types/node` 26 (`apps/relayer/DEVIATIONS.md` item 13) is not reconciled.
- **Spec fix:** section 4: state "workflows exist; SHA pins unverified in this review; not yet run on hosted GitHub" and remove the placeholder sentence. Section 3: add "(corrected in section 5)" to the dependency line.

### R-21 (Low): privacy wording for IP hash does not match code

- **Where:** spec `docs/APP_AND_RELAYER_SPEC.md:37` ("IP stored only as a rotating salted hash ... <=24 h retention"). Code: `apps/relayer/src/limiter.ts:41-81` (salt in memory, never written), `apps/relayer/src/config.ts:291` (`saltRotationHours` 1..24). `apps/relayer/PRIVACY.md` table is accurate.
- **Spec fix:** "IP is never stored or logged. A keyed hash lives in process memory until the salt rotates (`saltRotationHours`, maximum 24 h) or LRU eviction, whichever is first."

### R-22 (Low): obsolete header and HSTS on a non-TLS listener

- `apps/relayer/src/server.ts:42` sends `Permissions-Policy: interest-cohort=()`. The `interest-cohort` feature was a FLoC experiment. Status not verified in this review (unverified; no primary source fetched). `server.ts:40` sends HSTS although TLS terminates upstream (`DEVIATIONS` item 14).
- **Spec fix:** section 3 header list: name the exact headers the relayer sends (`nosniff`, `frame-ancestors 'none'`, `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, HSTS only when TLS is terminated by the relayer). Remove `interest-cohort`.

### R-23 (Low): several requirements are untestable as written

- `docs/APP_AND_RELAYER_SPEC.md:36` ("bounded queue"), `:35` ("rate limits"), `:37` ("documented privacy notice"), `:39` ("compliance hook ... operator may supply"), `:33` ("live gas estimate"), `:24` ("never log `location.href`"). No numbers, no test IDs. Config has defaults for `ipPerMinute` 30, `ipBurst` 10, `maxPending` 16 (`config.ts:286-300`), but `maxGasLimit`, `maxGasPriceWei`, `dailyBudgetWei`, `minBalanceWei` are required with no default (`config.ts:231-234`).
- **Spec fix:** give each control a number, its config key and a test ID. Example: "Daily budget: `chains[].dailyBudgetWei` (required). Test `budget.exhausted_503`."

### R-24 (Low): spec says the relayer serves quotes from a live price; the price is an operator constant

- Already in section 5 (`:61`), but section 3 line 33 still says "live gas estimate and token price in token units". Code: `apps/relayer/src/pricing.ts:70-80` (`FixedStablePriceSource`), `apps/relayer/src/config.ts:212-218` (`nativeUsdPrice`).
- **Spec fix:** replace with "gas price from `eth_gasPrice`; gas units from config; token price 1.0 (USD stables only); native price from config (no oracle in v1)."

---

### R-25 (Medium): missing threat coverage in the spec

Not covered by any spec requirement:
- hot-key compromise and rotation (gas and fee funds share one key; see R-06). No rotation or drain procedure.
- mempool griefing (R-05), sybil DoS (R-02), RPC trust (R-13), fee diversion by relayer (R-03, R-06).
- Clock skew: quote expiry and deadline use the relayer's `Date.now()` (`service.ts:199`, `:239`) while the client compares with its own clock (`sweep.ts:83`). No NTP or skew tolerance requirement.
- Threat model `docs/threat-model/THREAT_MODEL.md:183` already lists "Relayer censors, delays, runs out of gas funds" as availability only; the spec should reference it.
- **Spec fix:** add a "Threats in scope" paragraph to section 3 that lists the six items above with the mitigation ID that tests them.

---

## Standards and external references

- EIP-712 (typed data signing): https://eips.ethereum.org/EIPS/eip-712. Not fetched in this run. Unverified.
- EIP-2612 (permit): https://eips.ethereum.org/EIPS/eip-2612. Not fetched in this run. Unverified.
- EIP-2098 (compact signatures, referenced by `apps/relayer/DEVIATIONS.md` item 6): https://eips.ethereum.org/EIPS/eip-2098. Not fetched in this run. Unverified.
- FLoC / `interest-cohort` status (R-22): not researched. Unverified.
- Retrieval date for any of the above: none performed in this run (planned 2026-10-21).

No CVE identifiers are cited. None were found in the repo or invented.

## Unresolved, outside scope

- Whether the in-flight fixes listed in spec section 5 (`(in progress)` rows) are present on the branch: not verified; R-01 is present in the code as read.
- `docs/remote/audits/*` (haiku reports): not relied on.
