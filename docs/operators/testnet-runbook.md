# Testnet runbook (local devnet and public testnets)

Audience: the human who will run GhostPay on a testnet. Everything up to "you need a funded key" has been built and
exercised locally (see [`devnet-e2e-log.md`](devnet-e2e-log.md)). The public-testnet steps in section 3 have **not** been
run: no funded key exists in the authoring environment, and nothing was broadcast to any public chain.
Complements [`deployment-runbook.md`](deployment-runbook.md) (fee-recipient rules, immutability) and
[`relayer-runbook.md`](relayer-runbook.md). Audit gaps: G-01 (no deployment/manifest), G-02 (no end-to-end evidence).

## 0. Prerequisites

- Node 22, `npm ci`, `npm run build:libs`.
- Foundry 1.8.5 (`forge`, `cast`, `anvil`); `export PATH="$PATH:$HOME/.foundry/bin"`.
  `packages/contracts/foundry.toml` pins `solc_version = "0.8.28"`.
- `cd packages/contracts && forge build` once (the anvil tests and the rehearsal read `out/` artifacts).

## 1. Local devnet (no wallet, no coins, no network)

```sh
bash scripts/devnet/up.sh        # anvil :8545 chain 31337 + announcer, router, sweep relayer, USDC/DAI (permit) and USDT (plain) mocks
node scripts/devnet/e2e.mjs      # add --write-log to rewrite docs/operators/devnet-e2e-log.md
bash scripts/devnet/down.sh      # stop anvil, delete generated manifest/state
```

`up.sh` is idempotent: it reuses a live anvil and an existing deployment, and redeploys when the manifest points at code
that is gone. It writes `deployments/31337.json` (validated against `deployments/schema.json` and by the chain-adapters
validator), and writes `scripts/devnet/.state/devnet.json` (git-ignored). It does not copy an unsigned manifest into
the web application; any legacy public copy is removed during a fresh setup. Chain 31337 is intentionally absent
from the bundled web deployment registry. The separate browser/devnet test harness supplies its own authored fixture.

Expected e2e tail: `E2E OK: 12 steps, 14 transactions`. The script uses only the public anvil mnemonic accounts, starts the
real `apps/relayer` (`dist/main.js`) as a child process, and checks balances after every step: payer pays ETH, ERC-20 with
permit (USDC), ERC-20 with approve (USDT, DAI); scanner finds all four; ETH and USDT are swept directly (USDT after a gas
top-up); USDC and DAI are swept by the relayer with permit (stealth address never holds ETH) and a replay is refused with
`409 nonce_used`.

Fee differential vs the compiled router: `REQUIRE_ANVIL=1 npm test -w @ghostpay/chain-adapters -- src/router.anvil.test.ts`
(skips without anvil unless `REQUIRE_ANVIL=1`, which CI should set).
Manifest tooling test: `node --test scripts/testnet/make-manifest.test.mjs`.

## 2. Rehearse a public-testnet deployment locally (still no wallet)

```sh
FEE_RECIPIENT=0x<any-address> bash scripts/testnet/deploy.sh base-sepolia rehearse
```

Starts a throw-away anvil reporting the target chain id, etches the reference announcer at the canonical ERC-5564 address,
runs the real `Deploy.s.sol` with the public anvil dev key, builds and validates a manifest in a temp dir, runs
`SmokeSepolia.s.sol`, and deletes everything. Expected last line: `REHEARSAL OK for base-sepolia (84532) ...`.
Networks: `sepolia` 11155111, `base-sepolia` 84532, `op-sepolia` 11155420, `arbitrum-sepolia` 421614, `polygon-amoy` 80002,
`hoodi` 560048 (the built-in allowlist of `DeployBase.s.sol`).

This driver list and the client registry have different scopes:

| Surface | Current scope |
| --- | --- |
| Deployment driver and built-in contract-script allowlist | The six networks listed above |
| Enabled client testnets | Sepolia, Base Sepolia, OP Sepolia, Arbitrum Sepolia, Polygon Amoy, BNB Smart Chain Testnet (97), Avalanche Fuji (43113) |
| Client mainnets | Configured but disabled |

Hoodi is a built-in deployment-script network but is absent from the client registry. BNB Testnet and Fuji are
client-configured but have no aliases in this driver and are not built into `DeployBase.s.sol`'s allowlist.
For those additional public testnets, the contract script requires an explicit `ALLOWED_CHAIN_IDS` configuration;
local chain 31337 separately requires `ALLOW_LOCAL=1` unless explicitly allowlisted. The client registry does not
grant either authorization. This runbook does not expand either allowlist.

## 3. Public testnet (REQUIRES a funded testnet key supplied by you)

The seven enabled client testnets are listed above and in `packages/chain-adapters/src/config/chains.ts`.
Their presence in that table does not demonstrate a live deployment. Review the required chain, token, feed and
deployment evidence in [the matrix guide](chain-matrix.md); payment and manifest verification gates still apply.

1. **Get a testnet key and funds.** Create a fresh throw-away key (`cast wallet new`, or import into a keystore:
   `cast wallet import ghostpay-testnet --interactive`). Never reuse a mainnet key. Fund its public address with testnet ETH
   (about 0.02 ETH is ample; the local estimate for the whole deploy is under 0.013 ETH at 2 gwei). Faucets, **all UNVERIFIED
   in this session (the sandbox could not reach them); check each is live and read its terms**: Google Cloud Web3 Sepolia
   faucet; Alchemy Sepolia faucet; Chainlink faucets (faucets.chain.link, multi-chain); Superchain faucet (OP Sepolia, Base
   Sepolia); Base docs faucet list; Arbitrum docs faucet list; Polygon Amoy faucet (faucet.polygon.technology); Circle testnet
   USDC faucet (faucet.circle.com). Test stablecoin addresses per chain are in the issuer's docs: do not copy addresses from
   this repo or from memory.
2. **Pick a fee recipient** (a second throw-away address you control, not the deployer; EOA is simplest). See the fee-recipient
   table in `deployment-runbook.md`.
3. **Confirm the announcer exists:** `cast code 0x55649E01B5Df198D18D95b5cc5051630cfD45564 --rpc-url $RPC_URL` must be non-empty.
   If empty, either use another announcer with `ANNOUNCER=0x... ALLOW_CUSTOM_ANNOUNCER=1` (testnets only) or deploy the CC0
   reference announcer first and use that.
   The client `verifyDeployment` check requires the canonical announcer on configured chains. A custom-announcer
   script deployment does not satisfy that browser/CLI acceptance gate.
4. **Simulate (sends nothing):**
   ```sh
   export RPC_URL=https://...  FEE_RECIPIENT=0x...  DEPLOYER_ADDRESS=0x<public address of your funded key>
   bash scripts/testnet/deploy.sh sepolia            # = simulate; runs pre-deploy-check.sh then forge script without --broadcast
   ```
   Expected: `RESULT: all checks passed (nothing was broadcast)` and `SIMULATION ONLY: nothing was broadcast.`
5. **Broadcast** (refuses unless `CONFIRM_BROADCAST=1`, a signer, a matching chain id, and no earlier `run-latest.json`):
   ```sh
   CONFIRM_BROADCAST=1 KEYSTORE_ACCOUNT=ghostpay-testnet bash scripts/testnet/deploy.sh sepolia broadcast
   ```
   (`PRIVATE_KEY=...` also works but is visible in `ps`; prefer the keystore.) Expected: forge prints `ONCHAIN EXECUTION COMPLETE
   & SUCCESSFUL`, `make-manifest.mjs` writes `deployments/11155111.json`,
   `SmokeSepolia.s.sol` ends with `SMOKE OK`, then `DEPLOYED sepolia (11155111)`.
   There is no automatic copy into the web application.
6. **Verify sources** (needs an explorer API key; prints commands only until `CONFIRM_VERIFY=1`):
   `ETHERSCAN_API_KEY=... CONFIRM_VERIFY=1 bash scripts/testnet/verify-sources.sh sepolia`. Whether one Etherscan key covers each
   chain is UNVERIFIED; use `VERIFIER_URL` for Blockscout-style explorers.
7. **Review and sign the manifest.** Check `git diff deployments/`, confirm `commit` equals the commit you built,
   and complete the independent readback. Sign the manifest offline through the approved release process, then
   explicitly copy the signed file to `apps/web/deployments/<chainId>.json` and validate it against the pinned release
   keys (`npm run validate:deployments -w @ghostpay/web`). Review those exact files through a PR. The manifest builder
   refuses the removed `--copy-web` option; generating an unsigned manifest does not enable payments.
8. **Relayer on testnet:** copy `apps/relayer/relayer.config.example.json` to `relayer.config.json`, set `chains[].chainId`,
   `rpcUrlEnv`, `feeTo`, the token list (addresses from the issuer's docs, with `permit` set only if the token implements ERC-2612
   with the domain you verified), then `RELAYER_KEY_FILE` / `QUOTE_SECRET_FILE` (chmod 600) and `node apps/relayer/dist/main.js`.
   The relayer hot key needs a little testnet ETH. `GET /healthz` and `GET /v1/info` must show your `sweepRelayer`.
9. **Manual end-to-end with a real wallet (the part that needs coins):** create an invoice in the web app on the chain, pay it
   from a wallet holding testnet ETH or the test stablecoin, scan, sweep directly and through the relayer, and append the tx hashes
   to a new dated log next to `devnet-e2e-log.md` (audit G-02).

## 4. Rollback

Contracts are immutable and hold no funds beyond a single transaction; "rollback" means ceasing to use them:

1. Remove the affected `deployments/<chainId>.json` and bundled `apps/web/deployments/<chainId>.json` through a reviewed
   change, then rebuild and publish through the authorized release process. Editing the repository does not alter an
   already served bundle. The rebuilt app refuses a missing manifest; remove the chain from the running relayer's
   configuration as part of the same operator response.
2. Stop the relayer or remove the chain from its config; drain the hot key's remaining testnet ETH.
3. Redeploy with corrected inputs: archive the old record first (`mv packages/contracts/broadcast/Deploy.s.sol/<id> ...`), because
   `deploy.sh` refuses to run over an existing `run-latest.json`. A half-finished broadcast can be continued with
   `forge script ... --resume` (manual).
4. Anything wrong in the manifest alone (not the contracts): regenerate with `node scripts/testnet/make-manifest.mjs --rpc $RPC_URL`.

## 5. Files

| Path | Purpose |
|---|---|
| `scripts/devnet/{up,down}.sh`, `lib.sh`, `write-state.mjs` | local anvil + deploy + manifest |
| `scripts/devnet/e2e.mjs` | scripted end-to-end on the devnet |
| `scripts/testnet/deploy.sh` | simulate / rehearse / broadcast driver (guards above) |
| `scripts/testnet/make-manifest.mjs` (+ `.test.mjs`) | broadcast json + chain reads -> validated `deployments/<chainId>.json` |
| `scripts/testnet/verify-sources.sh` | `forge verify-contract` wrapper |
| `packages/contracts/script/devnet/` | `DeployDevnet.s.sol`, devnet-only mock stablecoins |
| `packages/contracts/script/SmokeSepolia.s.sol` | read-only post-deploy check for any allowed chain |
| `infra/devnet/` | docker-compose + Dockerfiles, UNTESTED (no Docker daemon available) |
