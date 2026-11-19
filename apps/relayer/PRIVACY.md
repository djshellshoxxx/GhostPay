# GhostPay relayer: privacy notice (what is retained, exactly)

This describes the software in this directory as shipped. An operator who modifies it, or who runs a
reverse proxy, CDN, load balancer or RPC provider in front of or behind it, must describe those too.

## What the relayer necessarily sees (in memory, for the duration of a request)

- The client IP address of the TCP connection (or the rightmost untrusted `X-Forwarded-For` entry when the
  TCP peer belongs to a `trustedProxies` CIDR).
- For `/v1/quote`: chain, token, owner (stealth) address, destination address, amount.
- For `/v1/sweep`: the signed sweep order (token, owner, destination, fee recipient, amount, fee, deadline,
  nonce), the EIP-712 signature, the optional ERC-2612 permit, and the quote token.
- Timing of each request.

Once a sweep is broadcast, the transaction is public on-chain, including owner, destination, token, amount,
fee, and the relayer's hot-key address. That is inherent to the product.

## What is retained, and for how long

| Data | Where | Retention |
|---|---|---|
| Rate-limit bucket keyed by `HMAC-SHA256(random salt, IP)` truncated to 128 bits (for `/v1/quote` also one keyed by the same HMAC of the IPv4 /24 or IPv6 /48 network), with a token counter and a timestamp | process memory only | until the salt rotates (config `saltRotationHours`, maximum 24 h; all buckets are dropped at rotation), until LRU eviction (bounded by `rateLimit.maxKeys`), or process exit |
| Rate-limit bucket keyed by `HMAC-SHA256(same salt, lowercase owner address)`, truncated | process memory only | same as above |
| Per-chain daily gas spend counter, circuit-breaker outcome window and recent mined-sweep outcomes (time and reverted or not) | process memory only | UTC day / sliding window (mined outcomes: `breaker.windowSize` entries within `lossBudget.windowSeconds`); contain no user data |
| Loss-budget entries keyed by `HMAC-SHA256(same salt, destination)` and by the hashed client network bucket and its /24 or /48 group, with amounts | process memory only | evicted for a newer entry once their `lossBudget.windowSeconds` window is over (tables bounded by `lossBudget.maxKeys`), or process exit; hashes from earlier salt periods cannot be linked |
| A broadcast sweep whose receipt wait timed out: its order as broadcast (public on-chain with its `txHash`) and the amounts reserved for it | process memory only | until a later receipt lookup finds it, at most 8 per chain and 24 h, or process exit |
| State journal (`state.file`): per chain the UTC day index and wei reserved that day; per transaction that may still spend gas: hot-key nonce, transaction hash (public on-chain once broadcast), reserved wei, gas price, status, creation time. No owner, destination, token, amount, fee, signature, IP or request id | the configured file, mode 0600, plus `<file>.lock` (pid, hostname, heartbeat time) | budget: overwritten each UTC day; a transaction record is deleted when its receipt settles it, when reconciliation shows it was never broadcast, or after 24 h unfound |
| Open-connection counter per peer (`server.maxConnectionsPerIp`), keyed by `HMAC-SHA256(random per-process key, IPv4 address or IPv6 /64)` truncated to 128 bits | process memory only | removed when that peer's last open connection closes (at most 1024 entries, the server-wide connection cap), or process exit |
| Lane tickets per client (`queue.maxPerClient`): a count keyed by `HMAC-SHA256(same salt, client network bucket)`, truncated | process memory only | removed when the client's last sweep in admission or in the lane settles; at most one entry per sweep request in flight (bounded by the connection cap and `queue.maxPending`), or process exit |
| Prometheus request, sweep and breaker counters | process memory only | process lifetime; labels are bounded and contain no user addresses or IPs |
| Structured log lines | stdout (operator decides where it goes) | operator-controlled; see below |

The salt is generated from the OS CSPRNG at start and at every rotation and is never written anywhere. A timer checks
for rotation once per minute at most, so a quiet process drops expired buckets without waiting for another request. The
raw IP address is used only inside the request handler to compute the hash and is not stored, logged, or put in any data
structure that outlives the request. Hashes from different salt periods cannot be linked.

## What is logged (and what is not)

Every log line is JSON with only these fields: `ts`, `level`, `event`, `requestId`, `route`, `status`,
`chainId`, `errorClass`. The logger has no free-text or arbitrary-object parameter, and each value is
re-validated against a strict format, so request bodies, destination and owner addresses, signatures, quote
tokens, amounts and IP addresses cannot appear in logs. `requestId` is a random UUID unrelated to the user.
Transaction hashes are also excluded from logs. Recovery uses only the protected state journal described above.
A test in `src/api.test.ts` scans the log output for these values.

### Zero-log mode (`"privacy": { "zeroLog": true }`, default off)

IP addresses, owners and destinations are never logged in either mode (see above). Zero-log mode also removes the
remaining per-request trail: the `request` access line (route, status, error class, request id) is not emitted, and
`requestId` is stripped from every other line (for example `sweep_sent`). What remains are operational events with
chain id and error class only (startup, shutdown, breaker, state journal, sweep submission, receipt outcomes). These
events still carry timestamps: a sparse event stream can correlate with on-chain activity or other observers' logs.
The switch is access-log suppression, not a claim of no records or timing anonymity. Tested in
`src/privacy.test.ts`. It does not change what any proxy, CDN or RPC provider in front of or behind the relayer logs:
configure those separately (for nginx, `access_log off;`).

## Request body padding (MH-REL-3) and the transition

Clients may add a `pad` member of random lowercase hex so a request body has a fixed size (the web client pads to 1, 2
or 4 KiB). The relayer checks it is bounded hex, discards it unread before validation, and refuses a malformed one with
`400 invalid_pad`. **Transition:** unpadded bodies stay accepted (`"privacy": { "bodyPadding": "optional" }`, the
default). An operator may set `"required"` once all clients pad; unpadded bodies then get `400 invalid_pad`. A relayer
older than this change refuses `pad` with `400 invalid_request`; the web client then resends the same request once
unpadded. Padding hides only the body length; responses are not padded, and IP, timing and content still reach the
relayer.

The browser keeps the documented unpadded fallback for bodies larger than its largest bucket, and callers can
explicitly select `pad:false`. Other padding failures, including unavailable or failed secure randomness, stop
before dispatch with a fixed diagnostic; they do not silently drop padding or display the underlying exception.

## Quote and sweep: the tuple is sent twice (assessed, not changed)

`/v1/quote` carries chain, token, owner, destination and amount; `/v1/sweep` carries them again with the signature.
Folding the quote into the sweep is not safe: the fee is part of the EIP-712 order the owner signs, so it must be known
before the sweep exists. Dropping owner or destination from the quote would unbind the quote token (an HMAC over the
whole tuple, fee and expiry) and would gain nothing against this relayer, which receives the same fields seconds later in
the sweep. Quote reuse is already short: `quoteTtlSeconds` is capped at 60 s (10..60), the token is bound to one exact
order, and replay is stopped by the on-chain nonce. What remains is that a quote without a later sweep still tells the
relayer about an intended sweep.

## Ingress: direct, trusted proxy or onion (`"privacy": { "ingress": ... }`)

- `direct`: clients connect to the listener; `trustedProxies` must be empty.
- `trusted-proxy`: a reverse proxy listed in `trustedProxies` sets `X-Forwarded-For` (the default when the list is not
  empty, so existing configs keep their meaning). The proxy sees and may log everything; its own policy applies.
- `onion`: a local Tor onion service forwards to a loopback listener (`listen.host` must be `127.0.0.1`, `::1` or
  `localhost`). `trustedProxies` must be empty, because a Tor client controls every header it sends. All onion clients
  arrive from loopback, so the per-IP and per-network limits become one shared onion budget; the global quote budget
  still applies. The relayer learns no client IP in this mode; the Tor process is a trust point. **Not tested against
  a real Tor network** (see `deploy/TOR.md`).

Omitting an ingress or padding setting selects the documented default. Explicit `null`, unknown values and
contradictory settings are rejected at configuration parsing. The `pad` field accepts 0–16384 lowercase hex digits;
the independent 16 KiB limit covers the entire JSON body, including its other fields and syntax. An empty pad is
valid at an exact size bucket; it is not proof that a request has useful length cover. These rules are exercised by
the local HTTP and parser tests, not by a real Tor service.

## What is NOT retained

No database, no files other than the state journal above, no cookies, no analytics, and no third-party calls other than the configured JSON-RPC endpoints
and the optional operator-configured HTTPS alert webhook. Request bodies are discarded after the response. The quote
token is stateless (an HMAC), so quotes are not stored.

The webhook sends only a fixed alert kind, chain id, and timestamp; it carries no address, amount, URL, or request data.
The endpoint must be HTTPS on a public host. DNS answers are rechecked at connection time and any private or non-public
address causes delivery to fail. Redirects are not followed. `/metrics` exposes aggregate route/status/error counts,
sweep outcomes by chain, and breaker/budget gauges; it has no labels derived from users.

## What other parties see

- The RPC provider you configure sees the relayer's outgoing calls: the hot-key address, simulation
  `eth_call`s that contain the full sweep (owner, destination, amounts, signature), gas price queries, and the signed
  transactions. Choose a provider accordingly.
- Any proxy in front of the relayer (TLS termination, CDN, WAF) sees everything above and its own logs apply.
- The optional `PolicyGate` hook is operator code; if it calls a screening service, that service receives
  chain, token, owner, destination and amount. Document it in your own notice.

## Operator obligations

Rotate and protect the hot key and quote secret, keep server logs short-lived, and publish a privacy notice
for your deployment that adds anything above that you changed. This file is not legal advice.
