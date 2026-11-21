# GP-BUG: MH-AMT-2 uint64 sampler cutoff on EVM-sized amount noise

Date: 2026-11-21. This is an isolated BUG-ONLY repair; no product feature, RPC or fund interaction.

## Immutable baseline and branch evidence

- Base `main`: `eb59d93cffed7848c4aac37d0e9650b87239c6da`.
- Isolated task branch: `automation/20261121/bug/large-amount-noise-bound-r1`.
- Claim-first coordination commit: `1ef027d02cbf943d3b4e0431a1085e702697bedb`.
- Failing-regression-first commit: `4f2b4419b91c3b9a88c4655be9a9f6832c688c4a` (new `packages/metadata-hardening/src/amounts.large-noise.test.ts`, Git blob `20a5506cd69d0cc4bdc2904aea7b82e12bbe708a`).
- Minimal source correction: `1a1f081c9a73aa6dafd76d80f8b262f1e099403c`, existing `packages/metadata-hardening/src/guard.ts` Git blob `3419341cd0aa215c80f78d6da2af1166f8feb141` (baseline blob `64f2e1046aacfcda72f28c3288f55b3f2e15547d`).
- Existing-neighbor boundary test adjustment: `cecf558151ee0f4a6a7dfb23c15da4547789150b` updates only `packages/metadata-hardening/src/catalogue.test.ts` (Git blob `6115dea781ce8dc1d2e6bd9ebea0aa05b8a18aa6`) to affirm the newly supported 2^64+1 sampling bound and retain refusal of 2^256+1; the old assertion that 2^64+1 must throw would otherwise falsely reject the intentional bug fix. No original shuffle, distribution or stuck-RNG assertions are removed.
- Test-fixture refinement: `e70b906c33be057ff11a4f595be9fb4229344314` switches the secondary large-amount fixture from uint256-max (whose randomly increased output could exceed an EVM uint256) to 2^200, leaving the first red regression intact; final new-test blob `5c45b4221e24802e2dc4b7d6865cb60c4309347c`.
- The only production change extends `randomBelow`'s upper integer bound from 2^64 to 2^256 and updates its associated JSDoc. Its existing uniform rejection sampler already handles arbitrary byte widths up to the Web Crypto 65,536-byte allowance; sampling 256 bits allocates only 32 bytes. All smaller bounds and their mapping are unchanged.

## Defect and expected behavior

`addAmountNoise` in `packages/metadata-hardening/src/amounts.ts` accepts a positive EVM base-unit `bigint` and a `maxBps` setting of 0–100, promising a uniform nonnegative noise surplus not exceeding `amount * maxBps / 10000`. It calls `randomBelow(max + 1n)`. For a testnet-only public fixture amount `2_000 * 10^18` base units and `maxBps=100`, `max=20_000_000_000_000_000_000`, larger than the sampler's original 2^64 bound `18_446_744_073_709_551_616`. Thus a valid amount incorrectly throws `MetadataHardeningError('INVALID_INPUT', 'bound out of range')` instead of producing an in-range surplus. The same bug affects even larger valid EVM uint256 amounts. No current Pages UI caller was identified, and there is no claim of user fund loss or crypto execution.

The new Vitest regression uses an existing deterministic in-memory `seededRng`, exercises 2,000 ETH-equivalent and a large 2^200-base-unit fixture on the supported Anvil testnet, checks returned value and noise bounds, and confirms that random-sampler requests *above* 2^256 still fail. Existing package tests continue checking small bounds, 0 bps, rejected mainnet and input validation. This adds no dependencies or production surface.

## Actual execution evidence, with limits

- Native Node `v22.16.0` source-equivalent isolated reproduction: **2 expected red boundary errors** on the original 64-bit bound; after the minimal 256-bit bound correction **1,017 checks passed** (16 large-amount sampled outputs, one above-uint256 refusal, 1,000 small-range output assertions). This stand-alone script copied the relevant pure logic; it was **not** the actual repository file imported, a Git blob hash-matched local execution, or a Vitest run.
- Hosted exact-head Vitest, package typecheck/lint/build, web full/lean/browser checks, CI and independent review: **pending at handoff creation**, to be verified from GitHub at the final PR HEAD. Do not claim success from source-equivalent checks.

## Prior draft PR #390 evidence recheck

Source review of [draft #390](https://github.com/djshellshoxxx/GhostPay/pull/390) confirms the original marker-expansion repro and its test-first commits without taking over its owner. Head `b655bc273a6704c9c140287b8adcdf4085b91882`, base `eb59d93cffed7848c4aac37d0e9650b87239c6da`. As checked on 2026-11-21, 37 checks: 18 success, 16 core CI jobs still queued, 3 expected skip; four supporting hosted workflows succeeded, no failure yet observed. Zero independent PR reviews. In particular web Vitest, typecheck, full e2e and contract matrix remain **unqualified**. No #390 source or branch mutation was warranted.

## Ownership and release gates

Draft bug-only integration PR: [#404](https://github.com/djshellshoxxx/GhostPay/pull/404). Open work includes broad #278/#262/#264/#307/#372 and consolidation #371/#401; their checked changed-file inventories do not touch the two claimed package paths. Search for open PRs with amount-noise/randomBelow scope found none; this is a scoped current inventory, not a guarantee over every unindexed historical branch. Re-run path intersection and compare against current main before any integration. Main integration lock is held, generation 11, owner `994a0d214fb9-root-r3`, at lock-branch head `6edfcd4dfb85c29e11aa0dee9fa0dabcc5b0ac79`; expiry alone is not permission to take it over. Draft PR remains the only proposed integration. No main change, merge, deployment, release or branch deletion. Independent reviewer and exact-head native/hosted qualification remain required.
