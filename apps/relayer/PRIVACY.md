# GhostPay relayer: privacy notice (what is retained, exactly)

This describes the software in this directory as shipped. An operator who modifies it, or who runs a
reverse proxy, CDN, load balancer or RPC provider in front of or behind it, must describe those too.

## What the relayer necessarily sees (in memory, for the duration of a request)

- The client IP address of the TCP connection. `X-Forwarded-For` is read only when the TCP peer is inside the
  operator-configured `trustProxy` CIDR list (otherwise the header is ignored); the client is then the rightmost entry
  that is not itself a trusted proxy. IPv6 clients are bucketed by their /64 prefix.
- For `/v1/quote`: chain, token, owner (stealth) address, destination address, amount.
- For `/v1/sweep`: the signed sweep order (token, owner, destination, fee recipient, amount, fee, deadline,
  nonce), the EIP-712 signature, the optional ERC-2612 permit, and the quote token.
- Timing of each request.

Once a sweep is broadcast, the transaction is public on-chain, including owner, destination, token, amount,
fee, and the relayer's hot-key address. That is inherent to the product.

## What is retained, and for how long

| Data | Where | Retention |
|---|---|---|
| Rate-limit bucket keyed by `HMAC-SHA256(random salt, IP)` truncated to 128 bits, with a token counter and a timestamp | process memory only | until the salt rotates (config `saltRotationHours`, maximum 24 h; all buckets are dropped at rotation), until LRU eviction (bounded by `rateLimit.maxKeys`), or process exit |
| Rate-limit bucket keyed by `HMAC-SHA256(same salt, lowercase owner address)`, truncated | process memory only | same as above |
| Failure budgets: timestamps of costly failures keyed by `HMAC-SHA256(same salt, "o:"+owner)` and `HMAC-SHA256(same salt, "d:"+destination)`, truncated | process memory only | `abuse.windowSeconds` (default 1 h) or salt rotation, whichever is first; bounded by LRU |
| Open-connection counter per peer address (IPv4 address or IPv6 /64, **unhashed**, used for the per-peer connection cap) | process memory only | only while that peer has at least one open TCP connection; removed when the last one closes |
| Per-chain daily gas spend counter, circuit-breaker outcome window, Prometheus counters (route, status, error class, chain id) | process memory only | UTC day / sliding window / process lifetime; contain no user data and no labels derived from users |
| Structured log lines | stdout (operator decides where it goes) | operator-controlled; see below |

The salt is generated from the OS CSPRNG at start and at every rotation and is never written anywhere. Rotation is
driven by a timer (checked every minute at most), so a relayer that receives no traffic still drops its buckets at the
configured time instead of holding them until the next request arrives. The raw IP address is used inside the request
handler to compute the hash and is not stored, logged, or put in any request-scoped or long-lived structure, with one
exception: the connection counter above holds the peer's address while its connections are open. Hashes from different
salt periods cannot be linked.

### Precision about "IP (hashed)"

"IP (hashed)" describes what the relayer **process** keeps. It does not describe what other parties see. The kernel and
the TCP peer necessarily know the raw address; a reverse proxy, CDN, WAF or load balancer in front of the relayer sees
raw client addresses, terminates TLS, and sees every request body; your hosting provider's network logs, and the
operator of the RPC endpoint (which sees the relayer's address, not the client's), are separate parties. An operator
who needs "no raw IPs anywhere" must configure those components accordingly (for example no access logs on the
proxy) and say so in their own notice.

## What is logged (and what is not)

Every log line is JSON with only these fields: `ts`, `level`, `event`, `requestId`, `route`, `status`,
`chainId`, `txHash`, `errorClass`. The logger has no free-text or arbitrary-object parameter, and each value is
re-validated against a strict format, so request bodies, destination and owner addresses, signatures, quote
tokens, amounts and IP addresses cannot appear in logs. `requestId` is a random UUID unrelated to the user.
`txHash` appears only after a transaction is broadcast and is already public on-chain.
A test in `src/api.test.ts` scans the log output for these values.

## What is NOT retained

No database, no files, no cookies, no analytics, no third-party calls other than the configured JSON-RPC
endpoints and, only if the operator configures `alerts.webhookUrl`, one https POST per alert (see below). Request bodies are discarded after the response. The quote token is stateless (an HMAC), so quotes
are not stored.

## Metrics and alerts

`GET /metrics` (off by default; optional bearer token) exposes aggregate counters and gauges only: request counts by
route and status, error class counts, sweep outcome counts per chain id, breaker state, hot-key balance (the relayer's
own balance), daily gas budget used, queue length. There are no address, IP, hash or amount labels, and label values are
re-validated against a short character set. Alert webhooks carry `{source, kind, severity, chainId, at}` and nothing else:
no key, address, URL, amount or user data. The webhook URL must be https and resolve to a public address (checked at
startup and again at connection time).

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
