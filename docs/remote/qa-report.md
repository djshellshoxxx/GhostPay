# QA report (swarm 3, branch claude/remote-extensions-3, head 2789f78)

Run 2026-10-21 in the cloud sandbox: Node 22.22.0, forge 1.8.5, solc 0.8.28 (local static binary), anvil 1.8.5 (from the Foundry tarball), Chromium from /opt/pw-browsers. Every number below is from a command run on the final tree; nothing is carried over from earlier branches.

## Static checks
| Check | Result |
|---|---|
| `npm run build:libs` | pass |
| `npm run typecheck` (all workspaces) | pass |
| `npm run lint` (all workspaces) | pass |
| `forge fmt --check` | pass |
| `bash scripts/scan-secrets.sh` | OK, no key material |

## Unit/property tests with coverage (`REQUIRE_ANVIL=1 npm test`, anvil present)
| Package | Files | Tests | Stmts / Branch / Funcs / Lines |
|---|---|---|---|
| btc-silent-payments | 18 | 311 | 97.61 / 95.4 / 97.16 / 99.46 |
| chain-adapters | 14 | 277 | 98.72 / 97.47 / 97.2 / 100 |
| core-crypto | 7 | 54 | 98.95 / 98.01 / 100 / 98.75 |
| invoice-schema | 7 | 174 | 99.36 / 99.27 / 100 / 99.48 |
| policy-scheme | 5 | 61 (incl. 7 anvil cross-checks vs real PolicyAccount/Factory/Router) | 98.07 / 95.97 / 100 / 99.67 |
| apps/relayer | 5 (+1 skipped) | 208 (+1 skipped anvil test) | 97.5 / 93.1 / 98.73 / 98.35 |
| apps/web | 30 | 355 | 95.45 / 91.24 / 92.33 / 97.31 |

Coverage thresholds were not changed by this branch. Baseline at the start of the session: btc 299, chain-adapters 216, relayer 192 tests.

## Contracts (Foundry)
- `forge test` default profile (fuzz 10 000 runs, invariant 256x50): 374 passed, 0 failed, 18 suites, 31 s.
- High-run: `FOUNDRY_FUZZ_RUNS=100000 FOUNDRY_INVARIANT_RUNS=1024 forge test`: 374 passed, 0 failed, 222 s.
- `forge coverage --ir-minimum` (needed because of stack-too-deep without it; ir-minimum coverage is approximate): GhostPayRouter 98.6% lines, GhostPayPolicyRouter 98.8%, GhostPaySweepRelayer 100%, PolicyAccount 99.2%, PolicyAccountFactory 100%. The "Total" row (73%) includes test and script files and is not meaningful.
- Echidna: not re-run by this swarm. Results in docs/remote/contracts-assurance.md predate the PolicyRouter salt change (50881e4) and the factory FeeWaived change, so they do NOT cover the final contracts.
- `forge snapshot --check` exits 1 because fuzz/invariant tests have no snapshot entries (same as before this branch).

## Browser e2e
`apps/web npm run test:e2e` (Playwright, Chromium): 16 passed, 0 failed, 22.6 s. Covers scan in a real Web Worker under CSP, mock wallet mutation refusal, fail-closed manifest mismatch, embed popup.

## Cross-package integration
- policy-scheme <-> contracts: the 7 anvil tests deploy the real compiled contracts and compare calldata/hashes; pass.
- chain-adapters <-> contracts and btc-silent-payments <-> chain-adapters: only mocked-RPC unit tests. No anvil differential test of fees.ts against the compiled router, and no live-chain or live-oracle test. Listed as NOT verified.

## Not run / not verified
- Relayer anvil test is skipped (needs a built relayer artifact path); relayer manifest read-back is mock-tested only.
- Slither, Mythril, mutation testing (swarm 2), Echidna on final contracts, long fuzz campaigns beyond the above.
- Nothing was run against a public testnet or mainnet, real price feeds, real BlindBit oracle or real Tor/proxy.
- Mermaid diagrams and SVG animations were render-checked in Chromium only for SVGs; Mermaid rendering not checked.
