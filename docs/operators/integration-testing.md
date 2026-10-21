# Full-stack integration testing (Docker, Codespaces, GitHub Actions)

One command runs GhostPay's EVM, Bitcoin and Solana end-to-end suites against real local chains in Docker. **Dev/test only**: anvil's public dev keys, Bitcoin regtest, a local Solana validator. No mainnet, no real keys, no secrets.

| Suite | Chain (container) | What it does |
|---|---|---|
| `evm` | `anvil` (Foundry v1.8.5, chain 31337) | `scripts/devnet/up.sh` deploys the stack to the compose anvil, `scripts/devnet/e2e.mjs` runs invoices, ETH/ERC-20/permit payments, scan, direct and relayer-sponsored sweeps; then the `apps/relayer` anvil e2e (vitest, spawns its own anvil). |
| `btc` | `bitcoind` regtest | `scripts/integration/btc-regtest.e2e.mjs`: fund a throwaway sender, pay a fresh `tsp1` silent payment address, scan the chain from bitcoind with `scanBlocks`, sweep with `buildSpendTransaction`, `testmempoolaccept`, broadcast, mine, assert confirmation and the exact amount. |
| `solana` | `solana-test-validator` (Agave v3.1.14) | `scripts/integration/solana-local.e2e.mjs`: airdrop to a fee payer, create an SPL mint, send SOL and the token to two stealth addresses, scan announcements with the view key, sweep both (sponsored fee, ATA closed), assert balances on chain. |

Not included: the Playwright browser suite (`apps/web/e2e`); CI already runs it in `ci.yml`.

## Run it in a GitHub Codespace

1. On GitHub: **Code > Codespaces > Create codespace on `<branch>`**. Pick a **4-core / 16 GB** machine type if offered (the repo asks for at least 4 cores, 8 GB, 32 GB disk).
2. Wait for the build. The `.devcontainer` builds Node 22 + Foundry 1.8.5 and adds Docker-in-Docker; `postCreateCommand` runs `npm ci --ignore-scripts && npm run build:libs`.
3. In the terminal:
   ```sh
   docker info | head -3          # the in-container daemon must answer
   bash scripts/integration/run-all.sh
   ```
   The first run pulls three images and builds two (about 10 minutes, mostly the 215 MB Agave download and Foundry/solc fetches). Later runs reuse the cache in `~/.cache/ghostpay-integration`.

Commands: `run-all.sh [all|up|test|logs|down] [--suites evm,btc,solana] [--keep]`. `up` then `test` repeatedly is the fast loop; `down` cleans up. Ports are published on `127.0.0.1` only (Codespaces forwards 8545, 18443, 8899 privately): anvil `http://127.0.0.1:8545`, bitcoind RPC `18443`, Solana RPC `http://127.0.0.1:8899`.

Outside a Codespace the same script works on any Linux/macOS host with Docker Engine 24+, Compose v2 and `openssl` (amd64 images; Apple silicon needs emulation).

## Run it in GitHub Actions

`.github/workflows/integration.yml` (`workflow_dispatch` with a `suites` input, nightly at 04:41 UTC, and pull requests that touch these packages or this infra). Steps: `compose-up` -> `run-all` -> collect logs -> upload artifact `integration-logs` (always) -> `compose-down` (always). Permissions are `contents: read`; actions are pinned to full SHAs (`bash scripts/check-actions-pinned.sh` passes); 45 minute timeout; one run per ref.

## Expected output

```
[..] anvil (127.0.0.1:8545, chain 31337) ready
...
[..] === suite: evm ===
PASS preflight | router=0x... ...            (scripts/devnet/e2e.mjs lines)
 Test Files  1 passed (1)                      (relayer anvil e2e)
[..] === suite: btc ===
PASS bitcoind reachable and on regtest | height 0
...
PASS sweep is confirmed and the destination received the exact amount | 49999802 sats received
RESULT btc: PASS (8 steps)
[..] === suite: solana ===
PASS validator reachable and healthy | solana-core 3.1.14
...
RESULT solana: PASS (10 steps)
================ integration summary ================
PASS  evm  (..s)
PASS  btc  (..s)
PASS  solana  (..s)
[..] ALL INTEGRATION SUITES PASSED
```
Any failing step prints `FAIL <step>: <reason>`, that suite exits non-zero, the remaining suites still run, and the whole command exits non-zero. Logs land in `infra/integration/.state/logs/` (`anvil.log`, `bitcoind.log`, `solana.log`, `runner.log`, `ps.txt`).

## How it is wired (and why)

- **Runner shares anvil's network namespace** (`network_mode: service:anvil`). `scripts/devnet/*` hard-code `127.0.0.1:8545`, so inside the runner that address is the compose anvil. `bitcoind` and `solana` are reached by service name. No `network_mode: host`; all published ports are `127.0.0.1:` only.
- **Hardening**: `cap_drop: ALL` on every service (bitcoind gets back `CHOWN, SETUID, SETGID` for its entrypoint), `no-new-privileges`, read-only root filesystems, tmpfs for state (chains and ledger are ephemeral). The runner mounts the checkout read-write and a cache dir, runs as your uid. Containers do have outbound internet (npm, solc download).
- **Credentials**: `run-all.sh up` generates a random bitcoind user/password per run, hands bitcoind only a salted `-rpcauth` hash, and keeps the plaintext in `infra/integration/.state/env` (mode 600, git-ignored, removed by `down`). Nothing secret is committed; the only keys in play are anvil's public dev keys and throwaway ones the tests generate.
- **Pinned artifacts**
  - Node: `node:22.23.4-bookworm-slim@sha256:de170b39...` (digest read from Docker Hub, 2026-10-21).
  - Foundry runner: release tarball v1.8.5, SHA-256 `6c66ffcc...` checked in the Dockerfile. anvil service: `ghcr.io/foundry-rs/foundry:v1.8.5@sha256:32c8ea9e...` (publisher: foundry-rs).
  - Solana: Agave `v3.1.14` release tarball, SHA-256 `06f97c06...` checked in `Dockerfile.solana`. The official Docker Hub `anzaxyz/agave` repo is marked sunsetting, so the GitHub release asset is used.
  - bitcoind: `bitcoin/bitcoin:31.1@sha256:da25cedc...`. **This image is not published by the Bitcoin Core project** (its README says unofficial; built by a contributor from bitcoincore.org release binaries after signature verification). Bitcoin Core publishes no image, and bitcoincore.org could not be reached when this was written, so a self-built image with a verified tarball hash was not possible. To remove that trust, build `scripts/regtest/Dockerfile.bitcoind` with a `BITCOIN_SHA256` you verified from the signed `SHA256SUMS`, and point the `bitcoind` service at it.
  - Tarball hashes were computed by downloading over TLS (trust on first use). Re-verify them against the release pages before treating them as audited, and recompute on every version bump.

## Troubleshooting

| Symptom | Likely cause / fix |
|---|---|
| `cannot reach the Docker daemon` | Codespace: rebuild the container (**Codespaces: Rebuild Container**) so docker-in-docker starts; check `docker info`. |
| `toomanyrequests` / `429` pulling `bitcoin/bitcoin` or `node` | Docker Hub anonymous rate limit (shared runner IPs). `run-all.sh` retries; otherwise `docker login` or re-run later. |
| `Pool overlaps with other one on this address space` | Another network uses `10.241.77.0/24`. Change the subnet in `docker-compose.yml` **and** the `-rpcallowip` of `bitcoind`. |
| bitcoind never healthy; `bitcoind.log` shows `Error: ...` or entrypoint/permission errors | The image's entrypoint behaviour was not run here. Check `docker compose -f infra/integration/docker-compose.yml logs bitcoind`; if it needs more capabilities, add them to `cap_add` for that service only. |
| solana never healthy / `OOM` | The validator wants 2-4 GB RAM. Use a bigger machine; check `solana.log`. `--bind-address 0.0.0.0` is rejected by the validator, which is why `solana-entrypoint.sh` passes the container IP. |
| `solana` steps `timeout waiting for finalized` | Finalization takes ~13 s per payment on a healthy validator; a starved machine is slower. |
| `forge`/`solc` download errors in the evm suite | The runner needs internet for the Solidity compiler; behind a proxy set it in the runner environment. The cache is `~/.cache/ghostpay-integration`. |
| `EACCES` writing into the checkout | The runner runs as your uid (`RUNNER_UID`/`RUNNER_GID`, set automatically). If you built the image under a different uid, rebuild: `docker compose -f infra/integration/docker-compose.yml build runner`. |
| Stale state after a crash | `bash scripts/integration/run-all.sh down` (removes containers, networks, tmpfs state, and the credential file). |

## What was and was not verified

Written in a sandbox with no Docker daemon, no Codespaces and no bitcoind. Verified there:

- `docker compose config` parses `infra/integration/docker-compose.yml`; YAML parse; `actionlint` v1.7.7 passes on the workflow (with shellcheck); `bash scripts/check-actions-pinned.sh` passes; `shellcheck -S warning` and `node --check` pass; `devcontainer.json` parses as JSONC.
- The Solana suite was **executed in full against a real `solana-test-validator` v3.1.14** (the same binary the Dockerfile fetches, started directly on the host, not in a container): 10/10 steps passed. The same run showed `--bind-address 0.0.0.0` panics and a concrete address works, which `solana-entrypoint.sh` implements.
- The EVM suite (`run-in-runner.sh`, `INTEGRATION_SUITES=evm`: devnet up + e2e + relayer anvil e2e) was **executed against a locally started anvil v1.8.5** (not the compose container) and passed; the tracked `deployments/31337.json` was restored afterwards.
- The Bitcoin suite was executed only against a **throwaway in-memory JSON-RPC mock** (8/8 steps), which exercises the sender transaction, the scanner and the spend path but **not** Bitcoin Core's validation.

**Never executed**: any Docker build or container (`docker compose build/up/run`), the Codespace/devcontainer build and the docker-in-docker feature, the GitHub Actions workflow, `run-all.sh` end to end, the bitcoind image's entrypoint/capabilities/healthcheck and `-rpcauth` handling, the real-bitcoind run of `btc-regtest.e2e.mjs` (script, fee/relay policy, wallet RPCs), the anvil image's `cast` healthcheck and entrypoint override, the shared network namespace DNS (`runner` resolving `bitcoind`/`solana`), read-only rootfs/tmpfs sizes under real workloads, and the Docker Hub/ghcr digests resolving at pull time. Expect to fix small things on the first real run.
