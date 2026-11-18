# Team B — delegated registry signing acceptance

- Repository: `djshellshoxxx/GhostPay`.
- Branch: `codex/unified-registry-delegation`.
- Base: `94d8ea81e2b185caab6e96cd5face0fa4fd1ab37` (published equivalent `55e8bf49feb854d37a55d36492b0710d1226b64c`, PR #187).
- Claim: `177bdf03`; regression specification: `f64daceb`.
- Implementation: `7b4c06b2247299455e867ba241011853459811fd`.
- Native acceptance strengthening: `4cfe30a762c3311c356bac43eb6ed4bbd724354a`, then `ba7deab24afa58ab34064984cb21ff5fb4767589`.
- Workflow: Caveman with local tools, isolated worktree, red/green verification and independent review. Continued the preserved regression commit after the previous worker stopped; did not restart its work.

## Implementation

`packages/chain-adapters/src/registryDelegation.ts` now exports `buildRegistryDelegationRequest` and
`signRegistryDelegation`, with public request, authorization and callback types through the existing wildcard export.
The builder validates a positive safe integer chain ID, uint256 bigint nonce, nonzero registrant and scheme-1 keys.
It creates the canonical EIP-712 domain and ordered struct and computes its digest. The canonical struct omits the
registrant; signature recovery or ERC-1271 verification must authenticate the selected account. The request,
all nested typed-data objects and arrays, and final transaction are frozen. Callback references and input values
are captured before asynchronous signing. Signatures remain opaque bounded bytes (including empty and non-65-byte
ERC-1271 authorizations), and the verifier must return exactly `true` before calldata is returned.

The injected verifier is an explicit trust boundary, not an automatic production verifier. It must check selected
chain ID and current registry nonce against the typed request, authenticate the selected registrant, and simulate
against the verified deployment. Simulation alone cannot validate request chain ID or nonce fields because those
values are implicit in the registry rather than encoded in calldata. The native acceptance example implements all
three checks. Verification is point-in-time; the caller must repeat deployment, chain, nonce and simulation checks
before a separately confirmed broadcast. No helper reads private keys, broadcasts, supplies a default RPC, chooses
runtime pins or exposes on-behalf registration in UI v1.

Native acceptance uses the existing CC0 ERC-6538 reference contract. The new `Registry1271Wallet.test.sol` is a
local owner-controlled fixture accepting a configured digest and opaque signature; it is not a production wallet
or proposed authority model. The tests exercise EOA registration, correct signature/nonce lifecycle, wrong signer,
wrong chain and verifying-contract domains, changed keys, replay and invalidation. Contract-wallet cases cover
empty, four-byte and 65-byte signatures; successful execution; wrong magic; verifier revert; changed signature;
wrong-chain digest; replay; invalidation; and a fresh authorization after invalidation.

Canonical reference checked against <https://eips.ethereum.org/EIPS/eip-6538> on 2026-11-16; existing reference file
remains unmodified. Only its temporary compilation copy relaxes the exact pragma, as in the preexisting test.

## Validation

| Source and command | Result |
|---|---|
| `f64daceb`: from `packages/chain-adapters`, `../../node_modules/.bin/vitest run src/registryDelegation.test.ts --maxWorkers=1` | True red: 33 failed, 20 passed; missing signing exports, no assertion weakening. |
| `7b4c06b2`: from `packages/chain-adapters`, `../../node_modules/.bin/vitest run src/registryDelegation.test.ts src/registry.test.ts src/registry.compat.test.ts --coverage --coverage.include=src/registryDelegation.ts --maxWorkers=1` | 73/73 passed, zero skips. Delegation module coverage: statements 35/35, branches 24/24, functions 7/7, lines 31/31 (100% each). Other module coverage is not claimed by this focused selection. |
| `ba7deab2`: from `apps/web`, `ANVIL_BIN=/tmp/ghostpay-analyzers/bin/anvil SOLC_BIN=/tmp/ghostpay-analyzers/bin/solc REQUIRE_ANVIL=1 NODE_OPTIONS=--max-old-space-size=1536 ../../node_modules/.bin/vitest run src/features/registry/registry.anvil.test.ts --maxWorkers=1` | 9/9 passed, zero skips; real Anvil 1.8.5 and solc 0.8.28. Native acceptance source includes both review follow-ups. |
| Implementation before test-only follow-ups: `NODE_OPTIONS=--max-old-space-size=1536 npm run typecheck -w @ghostpay/chain-adapters` and `npm run build -w @ghostpay/chain-adapters` | Passed, including dependency builds for core-crypto and invoice-schema. |
| `7b4c06b2`: native-test-only TypeScript config extending `apps/web/tsconfig.json` and including `registry.anvil.test.ts`; `tsc --noEmit` | Passed. Temporary config removed. |
| Changed delegation source/tests and native test: scoped ESLint | Passed on `7b4c06b2` and final `ba7deab2` (exit 0). |
| Full isolated web typecheck before other workspace packages were built | Failed with missing unrelated workspace `dist` exports and consequent type errors. No source change inferred from this environment preparation failure. Root owns the full dependency build and integrated web check. |
| Repeated chain typecheck plus ESLint under concurrent integration builds | Process exited 137; not a passing check. Earlier completed source-scoped checks remain recorded above. |

Logs retained locally during execution: `/tmp/ghostpay-registry-focused-final.log`,
`/tmp/ghostpay-registry-native-final.log`, `/tmp/ghostpay-registry-native-typecheck.log`,
`/tmp/ghostpay-registry-final-lint.log`, `/tmp/ghostpay-registry-web-typecheck.log`.

## Review and integration

Independent reviewer: `final_review2`. Initial review of `7b4c06b2` found no blocking source defect. Its comment
correction was resolved by `4cfe30a7`, which also proves wrong-chain signatures reach the registry when paired with
the correct request. `ba7deab2` separately proves wrong-signer rejection against the exact current request.
Independent final results are recorded in the unified review handoff.

Integration order after the shared base: `f64daceb`, `7b4c06b2`, `4cfe30a7`, `ba7deab2`, then this handoff commit.
The claim commit is optional if the coordinator preserves the ownership entry directly. No dependency/lock,
ENS, locale, relayer or production-contract changes overlap other workers.

Remaining gates: root's final combined-source typecheck/build/tests and hosted CI; verified registry runtime
provenance for production chains; real EOA/contract-wallet transport acceptance; ordinary release approval gates.
On-behalf UI v1 is explicitly excluded by spec 06. No public-chain or external-wallet qualification is claimed.
