# GhostPay developer documentation

Audience: engineers who build, review, extend or operate the GhostPay code base. This tree is a map of the code
as it exists in the repository today. It does not replace the normative specifications; where a document here and
the source disagree, **the source wins** and the document is a bug (README "Package map" states the same rule).

Status of the project (read first): pre-audit software, nothing deployed, testnets only, no independent audit. See the
root [README](../../README.md#status-read-this-first). Nothing in this tree changes that.

How these pages were checked: every TypeScript signature was read from `src/`, every code sample was executed against
the built libraries (see [verification notes](#verification-notes)), every Solidity name was read from `src/*.sol`
and `src/interfaces/*.sol`. Items that could not be run here are marked **not executed**.

## Reading order

| # | Page | Read it when you want to... |
|---|---|---|
| 1 | [architecture.md](architecture.md) | understand the modules, the dependency graph, the data flows and the trust boundaries (Mermaid diagrams) |
| 2 | [local-setup.md](local-setup.md) | get a working checkout: Node, npm workspaces, Foundry, solc, anvil, Playwright, `REQUIRE_ANVIL` |
| 3 | [testing.md](testing.md) | run or write tests: unit, property, fuzz, invariant, Echidna, anvil e2e, Playwright, vectors |
| 4 | [api/README.md](api/README.md) | call a package: exports, signatures, verified examples |
| 5 | [contracts-reference.md](contracts-reference.md) | read the Solidity surface: functions, events, errors, invariants, EIP-712 types, gas notes |
| 6 | [byte-layouts.md](byte-layouts.md) | parse or build metadata, calldata, events, fragments, meta-addresses by hand |
| 7 | [security-model.md](security-model.md) | know what must never happen and the rules contributors are held to |
| 8 | [release-and-repro.md](release-and-repro.md) | cut or verify a release; reproduce the build; deploy contracts |
| 9 | [extending.md](extending.md) | add a chain adapter or a new stealth scheme without breaking the invariants |
| 10 | [adr-guide.md](adr-guide.md) | read the ADR log, the specs, the audits and the DEVIATIONS files in the right order |

API pages (one per package): [core-crypto](api/core-crypto.md), [invoice-schema](api/invoice-schema.md),
[chain-adapters](api/chain-adapters.md), [policy-scheme](api/policy-scheme.md),
[btc-silent-payments](api/btc-silent-payments.md), [relayer and web app](api/apps.md).

## Repository at a glance

| Path | Kind | Name | Notes |
|---|---|---|---|
| `packages/core-crypto` | TS library | `@ghostpay/core-crypto` | scheme-1 stealth maths, secrets, 57-byte metadata |
| `packages/invoice-schema` | TS library | `@ghostpay/invoice-schema` | invoice object, canonical JSON, signing, `#gpi=v1.` envelope |
| `packages/chain-adapters` | TS library | `@ghostpay/chain-adapters` | EVM: chains, tokens, fees, manifest, RPC, logs, router/sweep builders, quotes |
| `packages/policy-scheme` | TS library | `@ghostpay/policy-scheme` | scheme `0x47500002` client side (experimental, ADR-0014) |
| `packages/btc-silent-payments` | TS library | `@ghostpay/btc-silent-payments` | BIP-352; standalone, not wired into the app |
| `packages/contracts` | Foundry project | (no `package.json`) | `GhostPayRouter`, `GhostPaySweepRelayer`, `PolicyAccount`, `PolicyAccountFactory`, `GhostPayPolicyRouter` |
| `apps/web` | React 19 + Vite static app | `@ghostpay/web` | seller keys, invoices, pay, scan, sweep |
| `apps/relayer` | Node service | `@ghostpay/relayer` | gas-sponsorship relay for sweeps |
| `deployments/` | data | | manifest schema and format notes; no real manifests |
| `test-vectors/` | data | | pinned scheme-1 and scheme-2 vectors and their generators |
| `scripts/`, `.github/workflows/` | tooling | | release build, verification, CI |
| `docs/` | docs | | specs, ADRs, audits, threat model, operator runbooks, this tree |

## Conventions used in these pages

- "Source" means the file path given in backticks, relative to the repository root.
- Amounts are `bigint` in TypeScript and `uint256` in Solidity. "Gross" is what the payer spends; "net" is what the
  stealth address receives; "fee" is `gross - net`.
- `0x`-prefixed hex strings are the interchange format between packages. Core-crypto and chain-adapters return
  EIP-55 checksummed addresses; invoice-schema requires lowercase.
- Error codes are stable strings on typed error classes (`GhostPayCryptoError`, `InvoiceError`, `ChainAdapterError`,
  `PolicySchemeError`, `SilentPaymentError`, `RelayerError`). Messages never contain keys or user input.

## Verification notes

Baseline: the committed tree at `7aee906` (HEAD when these pages were finished). The repository was changing while these
pages were written (other contributors committed library, contract and app changes in the same session; this tree's
`docs/developer/` was the only path edited here). Re-check against `git log` if more than a few commits have landed since.

The samples in `api/*.md` were executed with Node 22.22.0 against `packages/{core-crypto,invoice-schema}/dist` (already built in
the checkout; their sources did not change in the session) and against a throw-away `tsc` build of `chain-adapters`,
`policy-scheme` and `btc-silent-payments` at `ab09bad`, written outside the repository. No network, no wallet and no chain were used. The offline RPC in the chain-adapters samples answers
`eth_chainId`, `eth_getCode` and three router getters only; payments were built and decoded, never sent. Selectors, topics,
typehashes and calldata sizes in [byte-layouts.md](byte-layouts.md) were computed with viem from the generated ABIs and
every hex constant in that page was checked against the computed set. The non-EVM adapter skeleton in
[extending.md](extending.md) was compiled with `tsc --noEmit` under the repository's strict `tsconfig.base.json`.

What was **not** run for this documentation: `forge build`/`forge test` (the shared tree was being edited by other
contributors; Foundry output directories were not touched), Echidna, anvil-based tests, Playwright, the relayer server, the
release scripts, the Mermaid renderer (diagrams are plain flowchart/sequence syntax but were not rendered). Statements about
those come from the source, the scripts and the existing READMEs and are labelled. Gas figures are structural or taken from
`.gas-snapshot`; nothing was measured.

Known documentation bugs found while writing (not fixed here, outside `docs/developer/`):

- `encodeMetaAddress` JSDoc in `packages/core-crypto/src/keys.ts` says "140-character"; the real length is 141
  (`st:eth:0x` is 9 characters plus 132 hex digits).
- ADR-0014 says `flatSecurity` reports `available`; `FeeStatus` has no such member (`createEvmAdapter` derives
  `not_deployed` / `enforced` / `not_enforceable` from `manifest.policy`). Its context ("router hard-codes scheme id 1",
  "no TypeScript derivation") predates `GhostPayPolicyRouter` and `@ghostpay/policy-scheme`.
- `.github/workflows/nightly.yml` header says no Echidna harness exists; harnesses exist in `packages/contracts/test/echidna/`
  (they are simply not wired into CI). `packages/contracts/README.md` still says Echidna was not run.
- The root README package map does not list `packages/policy-scheme`, and `npm run build:libs` does not build it.
- `.env.example` omits `POLICY_FACTORY` and `EXPECTED_POLICY_FACTORY_CODEHASH` (read by `DeployPolicyRouter.s.sol`);
  `scripts/pre-deploy-check.sh` has no mode for the policy router; `scripts/check-natspec.sh` does not list
  `GhostPayPolicyRouter`.
- `REQUIRE_ANVIL=1` is honoured only by `packages/policy-scheme/src/anvil.test.ts`; CI and the release workflow set it for the
  whole test run, but `apps/relayer/src/e2e.anvil.test.ts` ignores it and silently skips without anvil.
