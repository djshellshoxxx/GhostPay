# GhostPay relayer: privacy notice (what is retained, exactly)

This describes the software in this directory as shipped. An operator who modifies it, or who runs a
reverse proxy, CDN, load balancer or RPC provider in front of or behind it, must describe those too.

## What the relayer necessarily sees (in memory, for the duration of a request)

- The client IP address of the TCP connection (or the `X-Forwarded-For` entry selected by `trustProxyHops`).
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
| Per-chain daily gas spend counter and circuit-breaker outcome window | process memory only | UTC day / sliding window; contain no user data |
| Structured log lines | stdout (operator decides where it goes) | operator-controlled; see below |

The salt is generated from the OS CSPRNG at start and at every rotation and is never written anywhere. The raw IP
address is used only inside the request handler to compute the hash and is not stored, logged, or put in
any data structure that outlives the request. Hashes from different salt periods cannot be linked.

## What is logged (and what is not)

Every log line is JSON with only these fields: `ts`, `level`, `event`, `requestId`, `route`, `status`,
`chainId`, `txHash`, `errorClass`. The logger has no free-text or arbitrary-object parameter, and each value is
re-validated against a strict format, so request bodies, destination and owner addresses, signatures, quote
tokens, amounts and IP addresses cannot appear in logs. `requestId` is a random UUID unrelated to the user.
`txHash` appears only after a transaction is broadcast and is already public on-chain.
A test in `src/api.test.ts` scans the log output for these values.

## What is NOT retained

No database, no files, no cookies, no analytics, no third-party calls other than the configured JSON-RPC
endpoints. Request bodies are discarded after the response. The quote token is stateless (an HMAC), so quotes
are not stored.

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
