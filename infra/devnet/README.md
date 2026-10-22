# Containerised devnet (UNTESTED)

The sandbox that authored this has no Docker daemon, so `docker-compose.yml` and the Dockerfiles here were
**never built or run**. The supported, tested path is `scripts/devnet/up.sh` + `scripts/devnet/e2e.mjs`
(see `docs/operators/testnet-runbook.md`). Treat these files as a starting point and report fixes.

Build context is the repository root:

```sh
docker compose -f infra/devnet/docker-compose.yml up --build
```

Services: `anvil` (chain id 31337, public dev mnemonic, bound to the compose network and to 127.0.0.1:8545 only),
`deploy` (one-shot: forge deploys the stack and writes `deployments/31337.json` into a shared volume),
`relayer` (apps/relayer against the devnet; keys are the public anvil dev keys, never use them elsewhere),
`web` (vite preview of apps/web; reads the manifest from the shared volume).
