# Policy Anvil fixture reconciliation — 2026-11-19

## Source and ownership

- Branch: `repair/ghostpay-270-policy-fixture-20261119`, stacked on PR #270.
- Exact parent: `73545f63112910d46002718354ab5e99f8652e1f` (current PR #270).
- Original source input: `fefcd57fb2397685a361dcbb9b9cf705efbfc17b`, verified as
  the new parent's direct first parent; the policy fixture is unchanged.
- Historical hunk: `cd4539d2b7f3f14c63227c74d88c032e1e1f360d`, parent `95d2480a6e2bacf16fe3c142c38a2538758bd102`.
- Changed test: `packages/policy-scheme/src/anvil.test.ts`.
- Input test blob: `c62fbfa028bc5c99e1f831932ca61022d5e41ac4`.
- Corrected test blob: `463e440907ba7884e0026f43fd3b9be2d1a1bae3`.
- The only other changes are this handoff and the additive ownership claim.
- Root coordinator owns integration. #264/#270/#272, main and the integration lease are untouched.

## Observed failure and correction

At #264 head `bf510471283cb0aa9cf6ff79e640e0b50a0b5d0a`, the
[rest-0 job](https://github.com/djshellshoxxx/GhostPay/actions/runs/44487029004/job/135458055648)
ran 118 policy tests: 117 passed; the router Anvil cross-check failed at
`anvil.test.ts:312`. It passed a native-token leaf/proof into the ERC-20 withdraw
builder, which correctly raised `INVALID_PROOF` at `eip712.ts:256` before the
test could exercise its encoder and contract checks.

The input Anvil test and EIP-712 runtime blobs are identical in #264 and the
selected #270 parent. Runtime EIP-712 blob:
`2f7679ede1e91ad43690fbe3f6fbfc4ab65910d7`.
Other policy-package files differ between those broad branches; the earlier CI
result is source-pinned failure evidence, not a full qualification of this parent.

Only the historical 6-addition/2-deletion hunk is recovered:

1. Assert that the builder rejects a token that its proof does not cover.
2. Hand-build the deliberately mismatched test message from the valid native
   order, retaining the encoder's `limitLeafHash` rejection.
3. Sign that deliberately invalid test order with the low-level test account so
   the contract's existing revert assertion actually executes.

The ordinary `signPolicyTypedData` helper also validates the reconstructed
digest; asking it to sign a mutated cached typed-data object would correctly
fail before the intended on-chain negative test. Bypassing it is confined to
this intentionally malformed test input. Production builders, signers,
encoders, contracts and ABI definitions are unchanged.

Do not recover the historical whole Anvil file: it also contains earlier
accountSalt/salt-only payment ABI differences outside this fix. The selected
hunk was applied directly from `git show cd4539d2 -- anvil.test.ts`.

## Qualification and environment limits

- Exact historical hunk application and `git diff --check` passed.
- Node 24's built-in TypeScript syntax transform passed for the changed file;
  this is parsing only, not TypeScript checking or test execution.
- Independent reviewer `clock_hosting_review` approved the exact corrected test
  blob above: only the historical withdrawal hunk changed; current payment ABI
  and all builder, encoder, contract-revert and positive-flow assertions remain.
- No policy unit, coverage, TypeScript or ESLint pass is claimed for this new head.
- The shared main dependency installation was not reused: it held viem 2.57.13
  and Vitest 5.0.5; this parent's unchanged lock requires 2.57.19 and 5.1.0.
- A bounded exact-lock policy-only `npm ci` was killed (exit 137). The executor
  then restarted and removed temporary worktrees/dependencies.
- The source and claim were reconstructed in a persistent isolated worktree.
  A second exact-lock attempt ended with ENOSPC (exit 228). The incomplete owned
  setup/cache was discarded. There are no dependency or lockfile edits.
- `anvil`, `forge` and `solc` were not found on PATH. Real Anvil execution and
  contract artifact availability remain unqualified. A skip is not an Anvil pass.

The attempted setup command was:

```sh
NODE_OPTIONS=--max-old-space-size=768 npm ci --workspace @ghostpay/policy-scheme --ignore-scripts --no-audit --no-fund
```

Once the exact dependency environment and real Anvil/artifacts are available,
run the original gates without weakening their coverage or requirements:

```sh
npm run typecheck -w @ghostpay/policy-scheme
npm run lint -w @ghostpay/policy-scheme
# From packages/policy-scheme, first the focused real-contract test:
REQUIRE_ANVIL=1 NODE_OPTIONS=--max-old-space-size=512 node ../../node_modules/vitest/vitest.mjs run src/anvil.test.ts --coverage.enabled=false --maxWorkers=1
# Then the existing full package gate, with its original coverage thresholds:
REQUIRE_ANVIL=1 NODE_OPTIONS=--max-old-space-size=768 npm test -w @ghostpay/policy-scheme -- --maxWorkers=1
```

The real-contract test needs PolicyAccount, PolicyAccountFactory,
GhostPayPolicyRouter, ERC5564Announcer and MockERC20 artifacts. Current CI builds
the contracts with Forge before setting the required Anvil gate. No runtime
claim follows merely from parsing this test or reviewing its source.

## Related CI triage and active ownership

The #264 typecheck and ts-check jobs failed on a stale `stripComments` import in
`apps/web/src/lib/manifest.test.ts`; lean-candidate repeats that error.
The full-browser job failed while its web-server TypeScript build was starting,
before browser tests could run. This is build qualification failure, not
observed browser behavior.

#270 already replaces that test-only helper with a TypeScript parse/print step
and retains its security assertions. Its AppShell generic assertion and
idle-lock matcher changes also address the corresponding lint failures: 21 of
the 35 reported web lint violations have direct source fixes in this parent.

Fourteen reported lint expressions remain outside this patch. Fresh active
repair inputs include private-scan lint
`1b010ec910d04df105fd662cc360629cb0a2f5dd` and export authorization
`b0abb726c138ad1df2f03b7b102c9bd9de318887`.
Their owners retain the scan source/test lanes; no duplicate web correction is
included here. Both heads still carry the input policy Anvil blob above.
Those separate repairs need their own exact-head qualification; no claim that
all fourteen violations are already fixed is made here.

#271 adapter qualification and #272 Sweep work do not repair this policy fixture
or the listed web lint diagnostics. Previously known Mythril/CodeQL findings
remain separate gates; this test repair does not resolve them.

Before publication, #270 advanced to `73545f63112910d46002718354ab5e99f8652e1f`
with merchant/evidence reconciliation. Its policy Anvil fixture still has the
same unrepaired input blob. The coordinator authorized placing this small
three-file change on that fresh parent. All newer coordinator source and claims
are retained; the original `fefcd57f` provenance remains its direct ancestry.

No workflow rerun, gate suppression, dependency upgrade, contract change, real
transaction, deployment, release, main mutation or other-owner branch edit occurred.
