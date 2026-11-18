# deploy/config

Copy `relayer.config.example.json` (this directory: the relayer configuration for this compose recipe) to
`deploy/config/relayer.config.json` (gitignored) and edit `allowedOrigins` (your `GHOSTPAY_PUBLIC_ORIGIN`), your chains,
budgets and `feeTo`. Its numbers are placeholders, not measurements. Mainnet is off unless you consciously set
`ALLOW_MAINNET=1` (not set by this recipe).

Two settings differ from `apps/relayer/relayer.config.example.json` (a relayer behind a proxy on its own host). If you
start from that file, change both:

- `listen.host`: `0.0.0.0`. Inside the container the api must accept nginx's connections from the backend network; the
  port is not published.
- `trustedProxies`: `["172.30.10.0/24"]`, the backend subnet pinned in `docker-compose.yml`, which nginx connects from.
  The relayer believes `X-Forwarded-For` only from a listed peer and keys its rate limits and loss budget on the
  address found there. nginx sets that header to the client address it took from your TLS terminator's
  `X-Forwarded-For`, believed only from the compose network gateways (`set_real_ip_from` in `nginx/nginx.conf`).
  With an empty or loopback-only list, or one that does not cover the backend subnet, every client shares nginx's one
  bucket (30 requests a minute in total by default), and `selfhost.sh` warns (it reads the subnet from
  `docker-compose.yml`, and says so when it cannot and checks against 172.30.10.0/24 instead). List the whole subnet:
  Docker assigns nginx's address in it, so a single address or a smaller block can miss it, and `selfhost.sh` warns
  about such a partial entry too. The old `trustProxyHops` key was replaced by this list; a config that still has it
  is refused at startup with an error naming it.

Your TLS terminator must set `X-Forwarded-For` to the client address it sees (overwrite it, or append to it; nginx
takes the rightmost address that is not a compose gateway). If it sets nothing, every client again shares one bucket.
A terminator running as a container on these compose networks connects from its own address, not a gateway: add that
address to `set_real_ip_from`. If 172.30.10.0/24 or 172.30.11.0/24 collides with a network on your host, change the subnet in `docker-compose.yml`,
`set_real_ip_from` in `nginx/nginx.conf` and `trustedProxies` here together.

Metrics: only `/api/healthz`, `/api/v1/info`, `/api/v1/quote` and `/api/v1/sweep` are routed; `/api/metrics` and any
other `/api/` path are 404. To scrape `/metrics`, set `metricsTokenEnv` (for example `"RELAYER_METRICS_TOKEN"`, with
the token in `secrets/rpc.env`) and read it from inside the backend network, for example
`docker compose exec web wget -qO- --header "Authorization: Bearer <token>" http://api:8787/metrics`, or attach your
Prometheus container to the `ghostpay_backend` network.

Validation status: no Docker daemon or nginx was available. `docker compose config` accepts the compose file, and
`apps/relayer/src/config.test.ts` ("deploy recipe wiring") checks that the pinned subnets, the nginx trust and route
rules and this example agree and that the example parses. Client-address handling through a real TLS terminator, nginx and the relayer
container was not run.
