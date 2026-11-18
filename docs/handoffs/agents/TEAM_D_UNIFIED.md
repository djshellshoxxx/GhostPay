# Team D unified handoff — 2026-11-16

- Repository: `djshellshoxxx/GhostPay`.
- Worktree branch: `codex/unified-matrix`.
- Base: `365a1c38` (the exact merchant-disclosure ancestry consolidation baseline).
- Matrix source: `aa1d51533cc7eec85e03bd2dea021ff0424d18b2`.
- Matrix plus quote correction source: `39f79175e249ecd35f6bff1abbb8750d9ade814b`.
- Workflow: Caveman investigation, test-first implementation, targeted checks and source-pinned handoff.
- Integration owner: root coordinator. No remote branch, deployment, release or signing action was performed.

## Completed implementation

1. A strict evidence matrix inventories all 14 configured chains, nine tokens and four configured feeds. Schema and
   provenance validation rejects missing/extra/duplicate rows, configuration drift, invalid dates/sources, malformed
   contract pins and unsupported capability claims. Every enabled release chain requires verified cells, including
   contract runtime hashes, signed deployment file pins, token capability acceptance and live feed acceptance.
2. CI checks the inventory against freshly built runtime configuration. Release builds check the stricter gate both
   under `GP_REQUIRE_RELEASE=1` and for a locally derived `release` channel. Ordinary development application builds
   remain available. The current strict gate correctly rejects 73 unverified required cells.
3. Deployment evidence binds the exact checked-in manifest path, chain id and SHA-256. The checker validates that file
   with the existing manifest loader and requires a signature to be present. This does not replace signature
   authentication, runtime readback or review of the claimed evidence.
4. Spec 03 feed readback now accepts optional `PriceOptions.expectedDecimals`, validates it before any RPC reads, and
   rejects metadata disagreement. The payer's sole production `readPrice` call supplies its configured feed decimals.
   Generic standalone readers retain optional metadata behavior. A regression uses the actual Base Sepolia USDC/USD
   registry entry: 18 returned decimals fail; the recorded 8 decimals pass.

## Files

- `packages/chain-adapters/config/matrix.json`.
- `scripts/lib/chain-matrix.mjs`, `scripts/check-chain-matrix.mjs`, two companion script tests.
- `.github/workflows/ci.yml`, `scripts/release-build.sh`.
- `packages/chain-adapters/src/quote.ts` and `quote.test.ts`.
- `apps/web/src/lib/pay.ts` and `pay.test.ts`.
- Operator matrix documentation, spec-09 status, active-work claim and this handoff.

## Verification

| Source | Command/check | Actual result |
| --- | --- | --- |
| Matrix test-first state | `node --test scripts/tests/chain-matrix.test.mjs` before validator implementation | Failed because the new validator module was absent; no pre-existing behavioral regression is claimed. |
| `aa1d5153` | `node --test scripts/tests/chain-matrix.test.mjs scripts/tests/chain-matrix-cli.test.mjs` | 16/16 passed. |
| `aa1d5153` | Same tests plus `scripts/tests/workflow-files.test.mjs scripts/tests/workflows.test.mjs` | 21/21 passed; totals overlap. |
| `aa1d5153` | `npm run build -w @ghostpay/chain-adapters` | Passed, including core/invoice prerequisites. |
| `aa1d5153` | `node scripts/check-chain-matrix.mjs` | Passed: 14 chains, 9 tokens, 4 feeds. |
| `aa1d5153` | `node scripts/check-chain-matrix.mjs --release` | Exit 1 as expected: 73 unverified enabled-chain cells. This is not release qualification. |
| `aa1d5153` | Node syntax checks; `bash -n scripts/release-build.sh`; `git diff --check` | Passed. |
| Quote test-first state before `39f79175` source fix | Adapter `src/quote.test.ts`; web `src/lib/pay.test.ts`, one worker, no coverage | Adapter: 2 failed/20 passed. Payer: 1 failed/54 passed. All three new regression groups reproduced missing checks. |
| `39f79175` source | Adapter quote suite, one worker, no coverage | 22/22 passed. |
| `39f79175` source | Web payer suite with this worktree's chain-adapters source alias, one worker, no coverage | 55/55 passed. A temporary untracked Vitest config was removed after execution. |
| `39f79175` source | Chain-adapters build and typecheck; focused adapter and web ESLint | Passed. |
| `39f79175` source | Web full typecheck | Exit 137, killed. No web typecheck pass is claimed. |

The worktree initially reused the coordinator's shared dependency directory. After isolating the chain-adapters
workspace link, the normal payer invocation reported an unrelated OP Stack error-class identity failure (54/55
passed); a temporary source alias removed the mixed-workspace module boundary and all 55 tests passed. Rerun the
standard payer suite and web typecheck on the coordinator's final integrated checkout. No production code or test
assertion was changed to bypass that environment issue.

## Remaining requirements and decisions

- Source URL/date validation is syntactic. It cannot prove publisher authenticity, source correctness or independent
  human review. The existing saved issuer and Chainlink evidence is reused with original dates, not re-fetched here.
- Runtime announcer/registry hashes, approved signed manifests, independent-provider/public-testnet readback,
  operational finality/range validation, token capability fork tests and live feed/L2 sequencer acceptance remain
  external gates. No deployment address or runtime hash was invented.
- Nightly RPC pin refresh and production pin enforcement need verified pins and an approved operator/provider
  configuration. The matrix and strict release gate do not implement a scheduled service.
- Expected feed-decimal agreement is implemented. It does not complete the independent L2 sequencer, secondary-price
  deviation, depeg or relayer feed-pricing requirements in spec 03.
- ENS/registry UI work belongs to the separate registry worker; no registry or package index files were edited here.

## Next actions

1. Independently review `aa1d5153` and `39f79175`; integrate after review.
2. Resolve only the active-work documentation conflict; source ownership is otherwise disjoint.
3. Build libraries on the integration checkout, run the standard payer suite and web typecheck, then the inventory/CI
   checks. Keep the strict release check red until real verification evidence supplies its missing cells.
4. Record final candidate SHA and CI evidence in the authoritative master completion ledger.
