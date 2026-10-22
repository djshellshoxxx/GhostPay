# deploy/secrets (contents are gitignored)

Create these files yourself; never commit them, never paste them into chat or CI logs.

| File | Content | Mode / owner |
|---|---|---|
| `relayer_key` | 32-byte hot key, hex | `600`, owned by uid 65532 |
| `quote_secret` | 32-128 byte HMAC secret, hex | `600`, owned by uid 65532 |
| `rpc.env` (optional) | `RPC_URL_<chainId>=https://...` lines | `600` |

```sh
umask 077
openssl rand -hex 32 > relayer_key      # hot key: use a dedicated, low-balance key, not a treasury key
openssl rand -hex 48 > quote_secret
sudo chown 65532:65532 relayer_key quote_secret
```
The relayer refuses to start if a secret file has group/world permission bits. See `apps/relayer/README.md`.
