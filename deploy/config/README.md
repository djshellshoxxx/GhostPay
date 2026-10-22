# deploy/config

Copy `apps/relayer/relayer.config.example.json` to `deploy/config/relayer.config.json` (gitignored) and edit: set
`allowedOrigins` to your `GHOSTPAY_PUBLIC_ORIGIN`, keep `listen.host` at `0.0.0.0` inside the container (the example uses
127.0.0.1, which the proxy cannot reach), `trustProxyHops` at 1 (nginx), your chains, budgets and `feeTo`. Mainnet is off
unless you consciously set `ALLOW_MAINNET=1` (not set by this recipe).
