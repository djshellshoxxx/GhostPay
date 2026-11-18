# Team B registry handoff — 2026-11-16

- Repository: `djshellshoxxx/GhostPay`.
- Branch: `codex/unified-registry`.
- Base: `365a1c38`; implementation: `e2874e5cdce37739c6c154cc099ce7758fd34f6c`.
- Dependencies: integration owner supplies locale/security additions from `192dd05d`. Those files were copied into
  this worktree for testing but deliberately excluded from this branch's commits.

## Implemented

`packages/chain-adapters/src/registryEns.ts` exports `resolveRegistryRegistrant`. Existing addresses retain strict
checksum validation. ENS inputs use the installed viem 2.57.13 normalizer and Universal Resolver. Only the selected,
already-validated Ethereum or Sepolia `RpcClient` supplies calls; no endpoint is inferred from the chain's defaults.
CCIP Read and gateway lists are disabled. Unsupported chains, malformed/oversized names, absent resolver code,
malformed/oversized answers, zero/missing addresses and gateway-dependent results are refused.

`RegistryView.tsx` resolves only after the explicit lookup action, then verifies/queries ERC-6538 for the resolved
address. It shows the normalized name, registrant and identity disclaimer. Edits invalidate displayed results and
increment a request generation so changing away from a name and back does not revive a stale answer. The existing
meta-address validation, write confirmation and backup controls remain in place. Delegated signing/sending is still
excluded from UI v1 by specification 06.

## Verification

- New helper suite before implementation: failed because `registryEns.js` did not exist; no passing baseline claimed.
- Two new UI regressions before UI implementation: 2 failed / 13 filtered. These prove absent ENS success and stale
  resolution handling on the prior view.
- `vitest run src/registryEns.test.ts src/registry.test.ts src/registryDelegation.test.ts src/registry.compat.test.ts
  --maxWorkers=1`: **61 passed**, including 21 new ENS cases. No real network request is used; a fetch spy verifies
  gateway instructions never trigger HTTP.
- Chain-adapters `tsc -p tsconfig.build.json` with a 512 MiB Node heap: passed.
- Initial registry UI run: 19 passed / 2 failed. Both failures were unchanged `ChainAdapterError` display assertions
  in the mixed local/central dependency setup; the two new ENS cases passed. Repeating all three registry view suites
  with one chain-adapters source alias passed **21/21**. The temporary config changes only module resolution and is
  not committed. Consult the coordinator's final combined-tree result before qualification.
- Full package typecheck exited 137. Focused lint exited 134 at a 512 MiB heap, then 137 at 768 MiB under concurrent
  load. These are unverified gates, not passing checks. The coordinator owns the combined-tree rerun.
- `git diff --check`: passed.
- Independent source review by `security_inventory`: no blocking issue found in the helper/view diff. This is
  scoped AI code review, not an external security audit.

## Primary sources consulted

- [ENS resolution](https://docs.ens.domains/resolution/).
- [ENS deployments](https://docs.ens.domains/learn/deployments/): confirms the installed viem Universal Resolver
  proxy on Ethereum and Sepolia. Code presence is not a verified runtime hash or an authenticated RPC.
- [ENSv2 application guidance](https://docs.ens.domains/ensv2/tutorial-app-developers/): reuse the supported library
  resolver rather than an individual name's resolver.
- [viem getEnsAddress](https://viem.sh/docs/ens/actions/getEnsAddress) and
  [public-client CCIP configuration](https://viem.sh/docs/clients/public#ccipread-optional).

## Remaining gates and next action

Rebuild chain-adapters on the unified candidate; run registry UI, package typecheck and focused lint with a single
package instance. Run browser/Anvil registry acceptance on that exact source. Live ENS mainnet/Sepolia acceptance,
independent RPC/deployment provenance and external wallet behavior remain pending. Cross-chain and offchain ENS
resolution are explicitly unsupported to preserve the selected-RPC-only boundary; they are not silently enabled.
