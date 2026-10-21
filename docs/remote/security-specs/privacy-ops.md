# Security spec: privacy operations (RPC choice, logging, telemetry, network layer, correlation)

Status: draft. Date: 2026-10-21. Branch: `claude/remote-extensions-1`. Author: haiku spec run (unreviewed).
Scope: `apps/web` (client), `apps/relayer` (sweep relayer and its operator runbook), `packages/chain-adapters` (RPC access), and project-wide docs and release process as they affect metadata leakage.
Out of scope: contract internals (except where events leak metadata), key handling (`key-lifecycle.md`), relayer griefing and rate limits (`relayer-abuse.md`), incident response (`incident-response.md`).

Evidence rule: repo facts below cite files, read by grep or read in this run. Claims from `docs/remote/audits/*` (haiku reports) are UNVERIFIED and are not used as evidence here. External sources in section 9 were NOT fetched in this run (network to primary sources unavailable); they are marked [U].

## 0. Existing coverage (grep result, 2026-10-21)

Question: does a spec exist for these rules? Answer: no single spec. Rules are scattered, partly tested, partly research only.

| Topic | Where it lives today | Gap |
|---|---|---|
| No analytics or telemetry | `SECURITY.md:16`; `docs/remote/modules-needed.md` row 16 ("Exists as a rule") | Rule only. No test that forbids a new SDK. Egress test covers parse and review flows only (`docs/audits/01-completeness-audit.md` S-03). |
| Relayer log fields | `apps/relayer/src/log.ts` (allowlist, `sanitizeFields`); `apps/relayer/PRIVACY.md`; `docs/operators/relayer-runbook.md` sections 7 and 10 | Log test in `apps/relayer/src/api.test.ts` covers scan of values; operator retention is "days, not months" with no number. |
| Relayer retention | `apps/relayer/PRIVACY.md` (memory-only salted HMAC buckets, salt rotation max 24 h, `apps/relayer/src/config.ts:53`) | Good. Proxy, CDN and RPC logs are operator duty only. |
| Web app privacy notice | none. `PRIVACY.md` exists only under `apps/relayer/`. | No web privacy notice at repo root or in `docs/user/`. `docs/user/privacy-limits.md` is the closest. |
| RPC choice and risk | `docs/operators/local-scanner-and-rpc.md`; `docs/user/privacy-limits.md`; threat model rows at `docs/threat-model/THREAT_MODEL.md:24-25, 167` | Advice only. No requirement on default providers, endpoint separation, or cross-check. Two-provider helper `requestWithFallbackCheck` exists but unused (`local-scanner-and-rpc.md`, audit S3-14). |
| RPC URL storage | `docs/operators/local-scanner-and-rpc.md` step 3 (plain text in `localStorage`); threat model row 209 (S3-03 Open) | Accepted caveat only; no requirement. |
| Tor, I2P, onion | `docs/remote/onion-i2p-research.md` (research, sections 1-5, 2.6 correlation list, 4.4 tests); `docs/threat-model/THREAT_MODEL.md:123` (onion mirror NOT ENABLED, ADR-0015) | No Tor mode in app (`local-scanner-and-rpc.md`, Feature 5 stage 1 not built). No normative requirement. Research has test list (4.4) but no spec. |
| Correlation and linkability | `docs/user/privacy-limits.md`; threat model row 205 (linking table); `docs/POST_LAUNCH_FEATURES_SECURITY_ROADMAP.md` lines ~269, ~509 | Descriptive only. D1, D3, D8 Open or In progress. No testable requirement on UI claims. |
| Referrer and history leakage | `docs/MASTER_BLUEPRINT.md:74, 143`; threat model rows for S3-03 | Partly implemented per audit 03 (history cleaned). Not tied to a spec. |

Conclusion: the spec is missing as a single normative document. This file fills that gap. Rows that are already adequate (relayer log allowlist, relayer retention) are cited as requirements, not re-derived.

## 1. Purpose

Define, in testable form, what GhostPay does and must not do that changes what an outside observer learns about a user beyond public chain data. Make false privacy claims (in UI, docs, or release notes) a defect. Give every privacy-relevant change a required review step.

Non-goal: anonymity against a global passive adversary. The product does not provide it (threat model; `docs/user/privacy-limits.md`).

## 2. Assets

| ID | Asset | Why it matters |
|---|---|---|
| PA1 | Link between payer, one-time stealth address, and seller wallet | Core promise: seller not identifiable from invoice. |
| PA2 | Seller meta-address and its reuse across invoices | Stable identifier (threat model D3). |
| PA3 | Client IP and network identity of payer and seller | Input to every RPC and host join (D8). |
| PA4 | Invoice link contents (bearer secret in URL fragment) | Anyone holding it sees the invoice. |
| PA5 | Relayer request tuple (owner, destination, token, amount, fee, timing) | Visible to relayer operator and its RPC. |
| PA6 | RPC provider identity and API keys in RPC URLs | Key leak and provider-side profiling. |
| PA7 | Logs, telemetry, crash reports, error text | Persistent copies outside user control. |

## 3. Adversaries

| ID | Adversary | Capability | Relevant assets |
|---|---|---|---|
| PA-ADV1 | Public chain analyst | Reads all chain data | PA1, PA2 (via router use and fixed metadata) |
| PA-ADV2 | User-chosen RPC provider | Sees IP, queried blocks and addresses, broadcast txs | PA3, PA1 (D8) |
| PA-ADV3 | Relayer operator and its RPC | Sees full sweep tuple, IP, timing | PA5, PA1 |
| PA-ADV4 | Static host, CDN, WAF, reverse proxy | Sees IP, user agent, file requests, timing | PA3 |
| PA-ADV5 | Third-party script, SDK or extension in page | Reads DOM, fragment, storage, network | PA4, PA6 |
| PA-ADV6 | Local network observer and ISP | Sees DNS and TCP metadata | PA3 |
| PA-ADV7 | Log and telemetry recipient (operator, vendor, support) | Receives whatever the product emits | PA7 |
| PA-ADV8 | Person with two invoices or two sweeps | Clusters by stable identifiers | PA2, PA1 |

Passive global observer and compromised end-user device are out of scope for guarantees (threat model row "compromised device").

## 4. Requirements

Conventions: MUST and SHOULD as in RFC 2119 [U]. Each requirement names its test in section 6 (AT-PO-n). "Verified" means the repo fact was read in this run.

### 4.1 RPC choice

- PO-RPC-1 (MUST): The client MUST contact only: same origin, the user-selected RPC endpoints, the user-selected relayer origin, and no other origin. Any shipped default endpoint MUST be listed in user docs with its operator name. Test AT-PO-1. Status: Open. Default list not located in this run (see Q1).
- PO-RPC-2 (MUST): The RPC URL scheme MUST be `https:` or `wss:`. URLs with embedded credentials MUST be rejected or shown a warning that they persist in plain text. Status: scheme check described in `local-scanner-and-rpc.md` step 1; credential warning not verified in code.
- PO-RPC-3 (MUST): Before the app shows a payment as received or releases goods (where the app says so), at least one RPC read of the one-time address balance MUST succeed on the same chain id as the invoice. Status: cited as "UI should verify balance" (threat model row 91, D4 Not yet). Open.
- PO-RPC-4 (SHOULD): Per-address reads (balance, nonce, code for a one-time address) and bulk `eth_getLogs` scans SHOULD use different configured endpoints when two are configured, so one provider does not hold both "this IP scanned" and "this IP cares about address X". Source: `onion-i2p-research.md` 2.6(5). Status: Open.
- PO-RPC-5 (SHOULD): Two-provider comparison for scanner announcements SHOULD be wired in, using the existing unused helper `requestWithFallbackCheck` (audit S3-14). Status: Open.
- PO-RPC-6 (MUST): Error text, logs and telemetry MUST NOT include a full RPC URL (it can carry an API key). Test AT-PO-5. Status: not verified in code; add test.
- PO-RPC-7 (MUST): Relayer docs MUST state that the configured RPC sees simulation `eth_call`s containing owner, destination, amounts and signature (`apps/relayer/PRIVACY.md` "What other parties see"; verified). Status: Met (doc).
- PO-RPC-8 (SHOULD): The relayer SHOULD use a private RPC or bundler for sweeps where the target chain supports it (`relayer-abuse.md` open question 1). Status: Open, unverified for target chains.

### 4.2 Logging policy

- PO-LOG-1 (MUST): Relayer log lines MUST contain only fields in the `log.ts` allowlist (`ts, level, event, requestId, route, status, chainId, txHash, errorClass`). Verified in `apps/relayer/src/log.ts`. Status: Met. Test AT-PO-2 must keep passing.
- PO-LOG-2 (MUST): The relayer MUST NOT persist request bodies, owner or destination addresses, IP addresses, signatures, quote tokens or amounts to disk or any external store. Verified against `apps/relayer/PRIVACY.md`. Status: Met (by claim plus code review; add file-system and network-egress test).
- PO-LOG-3 (MUST): The web client MUST NOT write to `console` in production builds any of: invoice envelope, URL fragment, meta-address private material, keys, one-time address private data, RPC URL with credentials. Status: Open. Playbook lines 55, 265-266 require it; test not run.
- PO-LOG-4 (MUST): Log retention for relayer stdout MUST be stated by the operator as a number of days in the operator's own notice. Recommended ceiling: 7 days (proposal, see Q2). Status: runbook says "days, not months"; no number.
- PO-LOG-5 (MUST): Any new log field, metric label or error code that carries user data MUST go through a privacy note and update `log.ts` tests before merge (extends `incident-response.md` IR-EVD-1). Status: Open (process).
- PO-LOG-6 (MUST): Proxy and host access logs that record IP MUST be disclosed in the operator's notice (threat model row 197; `apps/relayer/PRIVACY.md`). Status: documented.
- PO-LOG-7 (SHOULD): Prometheus `/metrics` (when enabled) SHOULD carry no per-user labels. Metric names in runbook section 7 are aggregate; keep it so. Requires bearer token when not loopback (runbook section 7). Status: in progress elsewhere.

### 4.3 Telemetry policy

- PO-TEL-1 (MUST): The web client MUST NOT load any third-party script, font, analytics or error-reporting SDK, session-replay tool, tag manager, or `navigator.sendBeacon` target. Source: `SECURITY.md:16`, `docs/operators/mirror-hosting.md:15`. Status: rule exists; not fully tested.
- PO-TEL-2 (MUST): Egress tests for the web client MUST assert that every network request during parse, review, pay, scan and sweep flows is same-origin or to a configured RPC or relayer origin. Status: Open. `docs/audits/01-completeness-audit.md` S-03 says scan, pay and sweep are not asserted. This is the single most important test gap in this spec.
- PO-TEL-3 (MUST): The bundle scan (`apps/web/scripts/scan-bundle.mjs`) MUST fail the build on known telemetry SDK identifiers (denylist to be written; see Q4). Status: scanner exists, denylist not verified here.
- PO-TEL-4 (MUST): Invoice, checkout and sweep pages MUST send `Referrer-Policy: no-referrer` (or stricter) and MUST NOT put invoice identifiers in query strings. Sources: roadmap line ~189; playbook line 265-266; Referrer-Policy [U]. Status: Open for headers verification.
- PO-TEL-5 (MUST): Any crash reporting, performance tracing or analytics added in future MUST first pass a privacy review recorded in `docs/remote/` with a named owner (playbook line 295 "privacy claim drift"). Status: process, Open.
- PO-TEL-6 (MUST): The relayer MUST make no outbound call except the configured JSON-RPC endpoints and, if configured, the `PolicyGate` hook (`apps/relayer/PRIVACY.md`). Status: Met (claim); add egress test with a denied-all resolver.
- PO-TEL-7 (MUST): Operators MUST NOT put the relayer behind a proxy or CDN feature that injects scripts or beacons (`docs/operators/mirror-hosting.md` line 29 lists Web Analytics beacon, Zaraz, Auto Minify). Status: documented.

### 4.4 Network layer (Tor and I2P)

- PO-NET-1 (MUST): The product, UI, README and user docs MUST NOT say that the app hides the user's IP from the RPC or relayer until a Tor or VPN path has passed AT-PO-8. Current truth: no Tor mode (`docs/operators/local-scanner-and-rpc.md`; threat model row 167). Status: text is honest today; keep it so.
- PO-NET-2 (MUST): An onion or I2P mirror of the SPA MUST NOT be described as verified until: served bytes match clearnet hashes, CSP is identical, and the release manifest is signed (threat model S3-01, S3-04; `onion-i2p-research.md` 2.6(8)). Status: Open.
- PO-NET-3 (MUST): When traffic is routed through Tor, DNS for RPC and relayer hosts MUST be resolved by the proxy (SOCKS5h), never locally. Source: `onion-i2p-research.md` 4.4(4). Status: no code. Research only.
- PO-NET-4 (MUST): When Tor is used, per-address RPC reads and bulk log scans MUST use separate circuits (stream isolation, distinct SOCKS username per purpose). Source: `onion-i2p-research.md` 2.4, 2.6(5). Status: no code.
- PO-NET-5 (MUST): A relayer reachable only over an onion or I2P address MUST NOT key rate limits on client IP alone when the listener sees one peer address (`trustProxyHops=0`). It MUST use owner plus global bucket mode (`relayer-abuse.md` section 5, research P3). Status: Open (`bucketBy` option not verified in code).
- PO-NET-6 (SHOULD): An onion-hosted relayer SHOULD enable Tor PoW and client authorization for its service (`onion-i2p-research.md` 1.2, 1.4). Claims from Tor rend-spec [U]. Status: Open.
- PO-NET-7 (MUST): Any Tor or I2P feature MUST pass AT-PO-7 through AT-PO-9 before release. Status: none built.
- PO-NET-8 (SHOULD): I2P SHOULD be treated as a secondary mirror or relayer transport only, not as an RPC transport, because it has no clearnet exits (`onion-i2p-research.md` 3.5). Status: research recommendation.

### 4.5 Correlation risks

- PO-COR-1 (MUST): The relayer MUST keep per-user state only in process memory, keyed by salted HMAC of IP or owner, and MUST drop it on salt rotation or restart. Salt rotation MUST be at most 24 h (`config.ts:53`; `config.test.ts:106` rejects 25 h; verified). Status: Met.
- PO-COR-2 (MUST): Relayer `requestId` MUST be a fresh random UUID per request and MUST NOT be derived from owner, IP or the sweep tuple. Source: `PRIVACY.md` ("random UUID unrelated to the user"). Status: claimed; add test.
- PO-COR-3 (MUST): Docs and UI MUST state that a quote and a matching sweep share the same tuple and are linkable by content (`onion-i2p-research.md` 2.6(2)). Status: Open.
- PO-COR-4 (MUST): Docs and UI MUST state that the same meta-address across invoices links those invoices (threat model D3 Open; `privacy-limits.md` item 3). The UI MUST NOT show "unlinkable" wording. Status: partially met.
- PO-COR-5 (MUST): Docs MUST state that the relayer hot-key address clusters all sponsored sweeps and that funding of that key by the operator can link it to the operator (`onion-i2p-research.md` 2.6(3)). Status: partly in `relayer-abuse.md`; add to user docs.
- PO-COR-6 (SHOULD): The gas buffer SHOULD stay off by default; when on, the UI MUST say it links payer to one-time address (`privacy-limits.md` item 5). Status: documented as optional.
- PO-COR-7 (SHOULD): The app SHOULD warn when a sweep is started within a configured window of the payment block, because timing links funds (`onion-i2p-research.md` 2.6(4); playbook timing). Default window: Q5. Status: Open.
- PO-COR-8 (MUST): Cross-feature joins are forbidden: the client MUST NOT send the same stable identifier (cookie, device token, account, fingerprint) to RPC, relayer or host. Status: rule implied by no-analytics; test with AT-PO-1.

## 5. Design notes

- One rule set, many enforcers. Prefer build-time checks (bundle scan, CSP `connect-src` generated from configured origins, log allowlist) over reviewer memory. CSP level 3 [U] and the existing mirror CSP are the mechanism.
- Make the honest claim easy: keep one user-facing table of observers (`docs/user/privacy-limits.md`) and tie each row to a test or a stated gap.
- Keep the relayer stateless. Its privacy story rests on memory-only salted buckets. Any future persistence (queue, DB, metrics per owner) reopens PA5 and needs a new spec.
- Tor is a transport, not a privacy guarantee. It hides who connected, not what was posted (`onion-i2p-research.md` 2.6(1)). Documentation must keep that split.
- Defaults matter most. Prefer no default RPC that a stranger operates, or disclose it in the UI on first use (Q1).

## 6. Acceptance tests

Run before any release touching `apps/web`, `apps/relayer`, `packages/chain-adapters`, or user docs. Record date, actor, result.

| ID | Requirement | Test |
|---|---|---|
| AT-PO-1 | PO-RPC-1, PO-TEL-2, PO-COR-8 | Playwright egress test over parse, review, pay, scan, sweep flows with a request-recording proxy. Fails on any origin outside same-origin and configured RPC/relayer. Extends `app.spec.ts:49` and `flows.spec.ts`. |
| AT-PO-2 | PO-LOG-1, PO-LOG-2 | Existing `api.test.ts` log scan, extended to fuzz IP, owner, destination, signature, quote token, amount in all routes including error paths; also assert no file or network write (mock fs and net). |
| AT-PO-3 | PO-LOG-3 | Web e2e capturing `console.*` in production build during full flow; assert no fragment, key, envelope or RPC credential substring. |
| AT-PO-4 | PO-TEL-1, PO-TEL-3 | `scan-bundle.mjs` run with denylist; fails on known SDK identifiers and any `sendBeacon` or non-configured URL literal. |
| AT-PO-5 | PO-RPC-6 | Force RPC error with URL containing `apiKey=`; assert error object, console and logs contain no key. |
| AT-PO-6 | PO-TEL-4, PO-TEL-6 | Response header snapshot test for invoice and sweep routes; relayer run with DNS and outbound TCP denied except configured RPC; assert no other egress. |
| AT-PO-7 | PO-NET-3, PO-NET-4 | When Tor mode exists: fake SOCKS5 server asserts CONNECT carries domain names and distinct usernames per purpose; no local DNS (network namespace with no resolver). Research 4.4(4-5). |
| AT-PO-8 | PO-NET-1, PO-NET-2 | Static check: no UI or doc string claims IP hiding without a passing AT-PO-7; onion mirror bytes hash-equal clearnet build. |
| AT-PO-9 | PO-NET-5 | Relayer behind onion with `trustProxyHops=0`: N distinct owners from one peer address are not throttled as one client when `bucketBy: owner+global` is set. |
| AT-PO-10 | PO-COR-1 | Restart relayer; assert no bucket state survives. Advance clock past `saltRotationHours`; assert bucket keys change. |
| AT-PO-11 | PO-COR-2 | Two requests with identical body: `requestId` values differ and are not equal to any body field. |
| AT-PO-12 | PO-LOG-7 | Scrape `/metrics` after one sweep from two owners; assert no label contains owner, destination, IP or txHash. |

## 7. Open questions

- Q1. Does the web client ship any default RPC or relayer URL? If yes, who operates it and is it shown to users? (Not found by grep in `apps/web` this run; needs a read of settings defaults.)
- Q2. Recommended relayer log retention ceiling: is 7 days acceptable as the published default, or does counsel want less?
- Q3. Ship a Tor mode in the app (ADR-0015 area) or document browser-level Tor only? Research 4.5 phased plan vs threat model "NOT ENABLED".
- Q4. Who writes the telemetry SDK denylist and where does it live (`scan-bundle.mjs` or a new file)?
- Q5. Default sweep timing window for PO-COR-7; needs measurement, not opinion.
- Q6. Is there a web-app privacy notice to write? Only `apps/relayer/PRIVACY.md` exists. Owner decision.
- Q7. Can CSP `connect-src` be generated from the configured RPC and relayer origins at build time? Affects PO-TEL-1 and PO-RPC-1.
- Q8. Private RPC for relayer simulations (`relayer-abuse.md` Q1): provider trust vs front-run exposure. Owner decision.
- Q9. Who is the named owner for the privacy review step in PO-TEL-5 and PO-LOG-5?

## 8. Known unverified items

- Tor PoW and client-auth behaviour (PO-NET-6): from research doc, not tested here.
- I2P sizing ("smaller audience") is unverified in `onion-i2p-research.md` 3.5.
- Any statement in `docs/remote/audits/*` (haiku) is not relied on.

## 9. References

- RFC 2119, Key words for use in RFCs. https://www.rfc-editor.org/rfc/rfc2119 [U, not fetched 2026-10-21]
- RFC 9110, HTTP Semantics. https://www.rfc-editor.org/rfc/rfc9110 [U, not fetched 2026-10-21]
- RFC 7239, Forwarded HTTP Extension. https://www.rfc-editor.org/rfc/rfc7239 [U, not fetched 2026-10-21]
- ERC-5564, Stealth Addresses. https://eips.ethereum.org/EIPS/eip-5564 [U, not fetched 2026-10-21]
- EIP-7702, Set EOA account code. https://eips.ethereum.org/EIPS/eip-7702 [U, not fetched 2026-10-21]
- W3C, Content Security Policy Level 3. https://www.w3.org/TR/CSP3/ [U, not fetched 2026-10-21]
- W3C, Referrer Policy. https://www.w3.org/TR/referrer-policy/ [U, not fetched 2026-10-21]
- Tor Project, Tor rendezvous specification v3. https://spec.torproject.org/rend-spec/ [U, not fetched 2026-10-21]
- Tor Project, Tor Browser manual. https://tb-manual.torproject.org/ [U, not fetched 2026-10-21]
- I2P project documentation. https://geti2p.net/en/docs [U, not fetched 2026-10-21]
- OWASP Logging Cheat Sheet. https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html [U, not fetched 2026-10-21]
- Repo sources: `SECURITY.md`, `apps/relayer/PRIVACY.md`, `apps/relayer/src/log.ts`, `apps/relayer/src/config.ts`, `docs/operators/relayer-runbook.md`, `docs/operators/local-scanner-and-rpc.md`, `docs/user/privacy-limits.md`, `docs/threat-model/THREAT_MODEL.md`, `docs/remote/onion-i2p-research.md`, `docs/remote/modules-needed.md`, `docs/audits/01-completeness-audit.md`, `docs/SECURITY_QA_DEVOPS_PLAYBOOK.md`, `docs/POST_LAUNCH_FEATURES_SECURITY_ROADMAP.md`.
