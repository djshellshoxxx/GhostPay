# GhostPay

GhostPay is an open-source project for client-side invoice creation and stealth-address payments on EVM networks. A seller publishes one stealth meta-address; every payment goes to a fresh one-time address that only the seller can find and spend from.

The goal is to reduce address reuse and limit routine exposure of invoice details. Blockchain transactions and much of their metadata remain public, so GhostPay does **not** claim anonymity or unlinkability. See [what it does not hide](docs/user/privacy-limits.md).

## Status (read this first)

| Question | Honest answer |
|---|---|
| Is it audited? | **No.** Only self-run and AI-assisted reviews exist ([`docs/audits/`](docs/audits/)). There is no independent third-party audit. |
| Is anything deployed? | **No.** No contract is deployed on any chain; [`deployments/`](deployments/) holds only a schema and a README. Without a manifest the web app disables payment. |
| Which chains are enabled in code? | Ethereum Sepolia and Base Sepolia (testnets). Mainnets are listed in `packages/chain-adapters/src/config/chains.ts` with `enabled: false`. |
| Has it run against a real wallet, RPC provider or chain? | **No.** The wallet, RPC and relayer interactions in the test suites are mocks (the relayer additionally has a local anvil end-to-end test). |
| Is anyone hosting it? | **No.** Hosting is intentionally not configured; see [Hosting](#hosting). |
| Can I use it with real money? | **No.** Do not. Contracts are immutable once deployed and the audit round has open findings. |

Open work is tracked in the audits: [completeness audit](docs/audits/01-completeness-audit.md) (gap list G-01..G-33), [contracts review](docs/audits/02-security-review-contracts.md), [client and relayer review](docs/audits/03-security-review-client-relayer.md) and [design analysis](docs/audits/04-independent-design-analysis.md). Several fixes are being applied by other contributors while this README is written; where a document describes a change that may not have landed yet it says so.

## Package map

| Path | What it is |
|---|---|
| `packages/contracts` | Foundry project: `GhostPayRouter` (checkout, 25 bps fee, ERC-5564 announcement), `GhostPaySweepRelayer` (gas-sponsored sweep via EIP-712 + ERC-2612 permit), `PolicyAccount` and `PolicyAccountFactory` (experimental, contracts only; see [ADR-0014](docs/adr/ADR-LOG.md)). No owner, proxy, pause or admin. |
| `packages/core-crypto` | Scheme-1 stealth key derivation, view-tag check, metadata builders, non-serialisable secrets. |
| `packages/invoice-schema` | Invoice schema, strict parser, signing, AES-GCM envelope, `#gpi=v1.` link format. |
| `packages/chain-adapters` | Chain and token allowlists, fee maths, deployment-manifest validation, RPC, log scanning, router and sweep builders, quote reading. |
| `packages/btc-silent-payments` | BIP-352 Silent Payments library (official vectors pass). Not wired into the web app or relayer. |
| `apps/web` | React 19 + Vite static app: seller keys, invoice creation, pay, scan, sweep, settings. |
| `apps/relayer` | Node gas-sponsorship relay service for sweeps (stateless quotes, simulation, budgets, circuit breaker). |
| `deployments/` | Manifest schema and format notes. No real manifests yet. See [`docs/DEPLOYMENT_MANIFEST.md`](docs/DEPLOYMENT_MANIFEST.md). |
| `test-vectors/` | Pinned scheme-1 vectors and their provenance. |
| `scripts/`, `.github/workflows/` | Release build, verification and CI scripts (being added; see [`docs/operators/release-and-verify.md`](docs/operators/release-and-verify.md)). |
| `docs/` | Specifications, ADRs, threat model, audits, user guides, operator runbooks, feature reviews. |

Each package has its own README and a `DEVIATIONS.md` listing where the code differs from the specs. Where a README and the code disagree, the code wins and the discrepancy is a bug in the README.

## Build and test

Requirements: Node >= 22 (`engines` in `package.json`; CI uses 22), Foundry 1.8.5 for the contracts.

```bash
npm ci --ignore-scripts      # install exactly what package-lock.json says, run no install scripts
npm run build:libs           # REQUIRED before typecheck/test/build: workspaces resolve each other through dist/
npm run typecheck
npm run lint
npm test                     # vitest with coverage thresholds in every workspace
npm run build --workspace @ghostpay/web    # also runs the bundle scan (scripts/scan-bundle.mjs)
npm run test:e2e --workspace @ghostpay/web # Playwright; needs a Chromium build (not run by `npm test`)
```

Verified on a clean checkout of `HEAD` on 2026-10-21 (Node 22.22.0, npm 10.9.4): `npm ci --ignore-scripts`, `npm run build:libs` and `npm test` succeed. Test counts at that time: btc-silent-payments 286, chain-adapters 216, core-crypto 54, invoice-schema 174, relayer 192 passed + 1 skipped, web 320. The skipped relayer test is the anvil end-to-end test; it skips when `anvil` or `packages/contracts/out` is missing (set `ANVIL_BIN`, run `forge build` first). Counts change as work lands; treat them as a snapshot, not a guarantee.

Contracts (from `packages/contracts`):

```bash
forge build
forge fmt --check
forge test                                  # default profile: 10 000 fuzz runs, invariants 256 x 50
FOUNDRY_PROFILE=dev forge test              # quick loop
bash scripts/check-natspec.sh
```

> **`foundry.toml` contains a sandbox-specific line:** `solc = "/home/user/tools/solc"`. On any other machine replace it with `solc_version = "0.8.28"` locally (CI does this with `sed -i 's|^solc = .*|solc_version = "0.8.28"|' foundry.toml`). Do not commit that change without deciding how to make the file portable. Tests under `test/audit/` are adversarial proofs of concept from the contracts review (they assert that weaknesses are real); a baseline run without them is `forge test --no-match-path 'test/audit/*'`.

Forge result when this README was written: 231 tests passed without `test/audit/`, plus 43 audit PoC tests passing. The tree was still changing, so re-run before relying on the number. Coverage (`forge coverage`) and gas-snapshot checks were not re-run for this README.

Not run anywhere yet: Echidna, Mythril, mutation testing, mainnet-fork tests, Firefox/Safari end-to-end, any real wallet.

## Documentation

Start with these, in order:

1. [Spec review and corrections](docs/SPEC_REVIEW.md) (resolves conflicts between the older documents; read first)
2. [Fee schedule and revenue architecture](docs/FEE_SCHEDULE.md)
3. [Contracts specification](docs/CONTRACTS_SPEC.md), [Web app and relayer specification](docs/APP_AND_RELAYER_SPEC.md), [Multi-chain specification](docs/MULTICHAIN_SPEC.md)
4. [Architecture decision records](docs/adr/ADR-LOG.md) (ADR-0011..0015 cover chains/tokens, quotes, fees, policy accounts, hosting)
5. [Threat model](docs/threat-model/THREAT_MODEL.md) and [Security policy](SECURITY.md)
6. [Deployment manifest](docs/DEPLOYMENT_MANIFEST.md) and [third-party register](THIRD_PARTY.md)

For users (plain language): [docs/user/](docs/user/README.md). For operators: [docs/operators/](docs/operators/) (relayer runbook, deployment runbook, mirror hosting, local scanner and RPC, chain-enablement checklist, release and verification). Per-feature security reviews: [docs/reviews/](docs/reviews/).

Older, broader planning documents (partly superseded; stale parts are annotated in place):

- [Post-Launch Feature Expansion and Advanced Security Roadmap](docs/POST_LAUNCH_FEATURES_SECURITY_ROADMAP.md)
- [Security, QA, DevOps, and Feature Expansion Playbook](docs/SECURITY_QA_DEVOPS_PLAYBOOK.md)
- [Developer Specification and Execution Blueprint](docs/DEVELOPER_SPECIFICATION.md)
- [Master Blueprint](docs/MASTER_BLUEPRINT.md)

Standards:

- [EIP-5564: Stealth Addresses](https://eips.ethereum.org/EIPS/eip-5564)
- [EIP-6538: Stealth Meta-Address Registry](https://eips.ethereum.org/EIPS/eip-6538)
- [ERC-4337: Account Abstraction](https://eips.ethereum.org/EIPS/eip-4337)

## Fees (summary)

Full text: [docs/FEE_SCHEDULE.md](docs/FEE_SCHEDULE.md) and the user-facing [fees guide](docs/user/fees.md).

- **Checkout fee: 0.25 % (25 bps), rounded down**, charged by `GhostPayRouter` on payments routed through it. Payments below 400 base units pay no fee. The fee recipient and rate are immutable per deployment and are shown in the app from the deployment manifest.
- **Paying the stealth address directly costs no GhostPay fee.** The fee is only enforceable where funds pass through GhostPay's contract; a payer can bypass it and forks of the client can remove it. This is by design and disclosed.
- **Gas-sponsored sweep:** a relayer fee of `max(gas cost x 1.10, 50 bps)`, capped at 300 bps, taken from the swept token amount and fixed inside the seller's signature. Policy-account creation has a flat fee (contracts only; no UI).
- The owner's wallet is never hard-coded in source. The fee recipient address is a deployment-time value that the owner still has to decide (SPEC_REVIEW section D).

## Security limitations (summary)

Full text: [privacy limits](docs/user/privacy-limits.md) and the [threat model](docs/threat-model/THREAT_MODEL.md).

- Pre-audit software. Nothing here is a guarantee.
- Payer, amount, token, timing and the use of the GhostPay router are public on-chain.
- **A sweep can undo the privacy:** the payer knows the stealth address, so the payer (and anyone) can follow the funds to your destination wallet. Use a fresh destination. A relayer sees owner, destination, amount and timing. Gasless is not unlinkable (audit D1, D8).
- An invoice link is a bearer secret: anyone with it can read the invoice. Browsers may keep the link in their history database even though the app clears the address bar (audit S3-03).
- A compromised frontend can steal keys. The deployment manifest, which decides the router and fee-recipient addresses, is **not yet authenticated**: its signature is not verified and nothing is read back from the chain (audit S3-01, in progress). The in-app release-hash widget cannot detect a tampered host (S3-04).
- The seller's scanner can display unverified, payer-supplied amounts for announcements that did not go through the router (S3-02, in progress).
- The fee recipient is immutable: if it is blacklisted by a token issuer or cannot receive ETH, checkout for that asset stops until a new router is deployed (audit D5 / contracts M-01).
- Fiat-priced invoices are disabled in practice: no oracle feed addresses are configured (ADR-0012).
- Policy accounts (scheme `0x47500002`) are contracts only: no client support, no recovery path. Do not use them.

## Hosting

**Hosting is intentionally not configured yet.** There is no deployment target, domain, `ghostpay.eth` record, IPFS pin, Tor mirror or Pages setup, and the release workflow deliberately stops at a draft release. See [ADR-0015](docs/adr/ADR-LOG.md) for the gating decision.

What must happen first:

1. **Deployment manifests exist and are verified:** contracts deployed on a testnet with a throw-away recipient, then a reviewed manifest, bytecode hashes read back from the chain, and the manifest compiled into the hashed bundle (see [DEPLOYMENT_MANIFEST.md](docs/DEPLOYMENT_MANIFEST.md); implementation in progress).
2. **Fee recipient decided by the owner:** a hardware wallet or multisig that accepts ETH and is unlikely to be blacklisted ([deployment runbook](docs/operators/deployment-runbook.md)).
3. **Signed releases:** signed tag, `SHA256SUMS`, SBOM, reproducible build, and a verification procedure users can follow from a separate machine ([release and verify](docs/operators/release-and-verify.md)). The fingerprint of the signing key has not been published.
4. **Legal review and terms:** the fee model, sanctions and compliance position (ADR-0006), a terms page and a privacy notice for any hosted frontend or relayer. This is an owner action and has not happened.
5. **A host with header control** (Cloudflare Pages `_headers`) as the primary target; GitHub Pages only as a degraded mirror ([mirror hosting](docs/operators/mirror-hosting.md)).

## Licence

No licence has been chosen. All packages are marked `UNLICENSED`; this is an open owner decision (SPEC_REVIEW section D). Third-party licences are listed in [THIRD_PARTY.md](THIRD_PARTY.md).
