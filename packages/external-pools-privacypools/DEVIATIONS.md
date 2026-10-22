# Deviations and open points (@ghostpay/external-pools-privacypools)

Spec: `external-pools.md` section 6.3. Date 2026-10-21.

## Unverified ([UNVERIFIED] in code comments and docs)

1. **No public Privacy Pools deployment on Sepolia or Base Sepolia.** Searched: contracts README, deploy scripts (`script/Deploy.s.sol` has an `EthereumSepolia` configuration), relayer `config.example.json` (local test addresses only). Entry in `manifest-data.ts` is `unverified`; `health()` returns `unknown`.
2. **ASP endpoint and format** (spec Q3) are not documented in the sources read. `AspSource` is an injected port. The adapter never trusts it: the proof's ASP root must equal `Entrypoint.latestRoot()` and the label must be in the supplied set.
3. **Live relayer.** Parsers follow the upstream relayer source at `main`; the real relayer package was not run. The anvil test uses an in-test stand-in that follows the same API.
4. **Audit scope.** Reports exist upstream (see README); their scope commits are older than the commit built here, findings were not reviewed. `info().auditStatus` therefore links a report but the UI text still says GhostPay has not audited the code (N6).
5. **Transitive licence status.** `maci-crypto@2.5.0` has no `license` field in its package.json (repository licence not checked). `@zk-kit/poseidon-cipher@0.3.2` is MIT (read from package.json).
6. ERC-20 deposit and approval-cleanup are tested with fakes and the viem encoders; the anvil test covers the native pool only (no ERC-20 pool was registered).
7. EP-4337/7702 sponsored deposit (spec Q4): not implemented; only direct deposits from `S1`.

## Differences from the spec

8. No Entrypoint `deposit` retry loop beyond `maxProbes` (default 3, option `startIndex`): the spec's "retry up to 3" is `maxProbes`; callers that already hold notes pass `startIndex`.
9. Partial withdrawals are not exposed (non-goal G1): the proof withdraws the whole note and the change note has value 0.
10. `stateTreeDepth` and `ASPTreeDepth` public signals are the true lean-IMT depth (`ceil(log2 n)`), not the SDK's 32-padded sibling count. The circuit only requires `<= 32` and the contract only checks `<= MAX_TREE_DEPTH`; both versions verified, the real depth is what the signal means.
11. The SDK package pulls its own `viem 2.22.14`, `@noble/*` 1.x, `@scure/*`, `snarkjs 0.7.5` (nested under `node_modules/@0xbow/privacy-pools-core-sdk/node_modules`). Recorded as the allowed duplicate (EP-SUP-2).
12. **GPL-3.0 in the closure: `snarkjs` 0.7.5 and seven iden3 packages.** The repository is `UNLICENSED`. OWNER DECISION, not resolved here (same open item as the pool packages). This package imports the SDK only dynamically so it stays out of the default web chunk; a bundle test needs `apps/web` and is not written.
13. `@scure/bip39` 1.6.0 and `@zk-kit/poseidon-cipher` 0.3.2 are declared direct dependencies because the glue imports them (they were already hoisted transitive dependencies of `viem` and `maci-crypto`).
14. Install used `npm install --ignore-scripts`; the SDK tarball declares no install scripts that matter here (its scripts are build and test only).
15. EP-PP-2 specifies `Entrypoint.usedPrecommitments`; implemented as such.
16. Coverage: no file excluded; thresholds unchanged. The tests that need 20 MB of circuit artifacts or the upstream contract build skip with a reason unless the environment variables in the README are set; a mocked-SDK test (`sdk-crypto.mock.test.ts`) covers the glue's argument mapping without them.
