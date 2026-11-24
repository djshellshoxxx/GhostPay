# Registry bundle correction — 2026-11-16

- Branch: `codex/fix-registry-bundle-egress`.
- Base: `53d2163be5f7eaa8592750649d54df06b133b80c`.
- Production correction: `ef3c1cfe8d67ee66dafc044dfc6cab4a7ee00200`.
- Test-fixture lint correction: `f7f69be7e9b75f126e3b3434c2de4fa464f67dd9`.

## Cause and correction

The earlier ENS helper's viem PublicClient and chain-definition imports made otherwise unused provider defaults,
CCIP/avatar hosts and random-ID code reachable in both full and lean application artifacts. The unchanged bundle
guards correctly rejected the artifacts. The coordinator inspected the failing hosted
[full build job](https://github.com/djshellshoxxx/GhostPay/actions/runs/43958733800/job/133620121726) and
[Pages job](https://github.com/djshellshoxxx/GhostPay/actions/runs/43958733880/job/133620120669).
This is a build-boundary failure; the review did not observe runtime requests to those endpoints.

The helper now encodes `resolveWithGateways(bytes,bytes,string[])` directly through the existing bounded, selected
`RpcClient`. It uses the canonical ENS proxy on Ethereum or Sepolia, a normalized DNS packet and `addr(namehash)`,
an empty gateway array and pure viem name/ABI utilities. No provider, HTTP transport, PublicClient, chain default or
OffchainLookup interpreter is constructed. Errors remain sanitized and all existing size/chain/input checks remain.
The returned address is validated before ERC-6538 use. No bundle rule or host allowlist changed.

Primary references: [ENS Universal Resolver](https://docs.ens.domains/resolvers/universal/),
[ENSIP-23](https://docs.ens.domains/ensip/23/) and the
[ENSIP-1/EIP-137 namehash vectors](https://eips.ethereum.org/EIPS/eip-137). A new test checks the exact published
`foo.eth` namehash and DNS packet without using the implementation's namehash helper as its oracle.

## Executed evidence

All corrected checks below use the production file at `ef3c1cfe`. The later fixture-only commit leaves that file
unchanged. The coordinator must still qualify the final combined source and hosted jobs.

| Command / gate | Actual result |
| --- | --- |
| Four registry adapter suites, `vitest run ... --maxWorkers=1` | 62/62 passed, including all 21 previous ENS cases and the added published-vector case. Repeated after the test-fixture lint correction: 62/62 passed. |
| `tsc -p packages/chain-adapters/tsconfig.build.json` | Passed with a 768 MiB Node heap. |
| `GHOSTPAY_LOCAL_BUILD_PROFILE=full vite build` followed by unchanged `node scripts/scan-bundle.mjs` | Passed; 18 artifact files scanned; no dynamic code, unexpected origins, source maps or loose deployment JSON. |
| `GHOSTPAY_LOCAL_BUILD_PROFILE=lean vite build` followed by unchanged `node scripts/scan-bundle.mjs` | Passed; 17 artifact files scanned with the same guards. |
| Focused ESLint for `registryEns.ts` and its tests | Passed after replacing an unused mock parameter and a plain-object Promise rejection fixture. Assertions remain intact. |
| `git diff --check` | Passed. |
| Independent `final_review` source review | No additional blocking issue found at `ef3c1cfe`; the reviewer explicitly required the actual full/lean artifact scans above. |

An initial local baseline `npm run build -w @ghostpay/web` exited 134 during the broad web typecheck at a 768 MiB
heap, before artifact creation. It is not local RED bundle evidence or a pass. The already inspected exact-source
hosted failures supplied RED. Corrected artifact builds invoked Vite and the unchanged scan directly; this note does
not claim a fresh full-web typecheck. The chain package build verified the corrected TypeScript API, which is unchanged.

## Remaining boundaries

Selected-RPC-only ENS still supports Ethereum and Sepolia, not silent cross-chain or offchain fallback. Proxy
code-presence checking is not authenticated runtime provenance. Live ENS/browser/wallet acceptance and final
combined-head hosted checks remain separate gates. No network default, deployment, signature authority or release
approval was added.
