# What this relayer sees and keeps (SP-REL-4)

Sees, per request: recipient, withdrawn value, relayer fee, fee recipient, deadline, ASP publisher (if any), the announcement bytes
(SP-PAY: seller's one-time address key and metadata), the full proof and public signals (state root, nullifier hash, change
commitment), the client network address (or the last untrusted `X-Forwarded-For` hop if a trusted proxy is configured), and timing.

Keeps: in memory only, the rate-limit and loss-budget counters keyed by a masked network bucket, and a per-pool scope cache. Nothing is
written to disk by this process. Logs contain only `ts, level, event, requestId, route, status, chainId, txHash, errorClass`
(allowlist enforced in code; no field exists for recipient, value, proof or address). An operator who adds a reverse proxy, access log
or packet capture changes this; that is outside this package.

A public relayer can still refuse service, delay, or correlate your IP with the withdrawal on its own network. Self-submit avoids
the relayer but then the submitting address needs gas and links to the withdrawal. This is a test pool: the crowd is only other
testnet users.
