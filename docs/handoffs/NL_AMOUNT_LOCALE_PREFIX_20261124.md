# BUG-ONLY: preserve Swiss locale prefix for natural-language amounts — 2026-11-24 UTC

## Reproduction and root cause

Exact main `c8e131c1402a96b5c9d5cd8dc5ae4f0c02188063`. Source `packages/ux-intake/src/nlamount.ts` blob `df552a1334efb109f40a944c8bfdac0d422b8ccb`. The accepted tag `de-CH-1996` is a regional variant of the supported `de-CH` descriptor. The old lookup checks the whole tag then jumps directly to generic `de`; single underscore replacement also fails to normalize `de_CH_1996`. In both cases the ordinary input `1.234 usdc` with a synthetic USDC asset of six decimals produced 1234000000 base units instead of 1234000. The parser therefore interprets the same decimal reading as 1234 rather than 1.234. Swiss apostrophe grouping also fails for `de-CH-1901`. No Pages caller reachability or actual payment outcome established; these are public package parser cases, not live transactions.

## Isolated implementation

- Branch `automation/20261124/bug/nl-amount-locale-prefix-r11`.
- Additive ownership claim `cf2edfd1b32c15a2080ac7681e94ad888d53a6bc`.
- Regression first `33dc42c74c63f2ca8e49e03d9f181bedf6eb0c47`, new `packages/ux-intake/src/nlamount.locale-prefix.test.ts` blob `256e346e45ed2ee296070965e0db9682a8496888`.
- Production correction `ca0cfbfafe003bf24d9d90d1157871b45d986073`, blob `4cfda807306b53619aee4d80ac4f18e23da1333e`: normalize all accepted underscores; repeatedly remove trailing subtags only until a known table prefix is found. Return the existing detached descriptor. Preserve the original accepted tag grammar, including rejection of singleton-extension syntax, and existing amount, grouping, precision and ambiguity policies.

## Verification and limitations

Recomputed Git SHA-1 blob hashes for the exact baseline/repaired source, committed regression and existing dependency blobs `text.ts` = `bd5877060168acc83d11f1cb9b6fa7b2ebf40e07`, `result.ts` = `74a6a294caef828e72f5b48e2a1a86491b23f677`. Executed the actual parser and its dependencies in V8 after removing TypeScript annotations; executed committed regression bodies with minimal Vitest-compatible describe/it/expect shims. At regression-only head 2/5 pass, 3/5 fail: two wrong numeric outputs and one unexpected-token error. At exact production repair 5/5 pass. Neighbor checks 10/10 pass: English/German/French grouping, exact Swiss case-insensitive/underscore spelling, ambiguous no-locale rejection, multiplier, number words, zero-decimal Swiss rejection and German whole-unit control, detached descriptor. No full checkout: local git ls-remote failed DNS resolution. These are not native Vitest, full repo, browser, lint/typecheck or build results.

## Ownership and integration

- All 245 discovered open PRs' changed-file lists inspected; no production or dedicated regression path collision. Existing nlamount.test.ts owners #224/#238/#262/#264/#278/#372 left untouched. Prior locale snapshot PR #521 is merged. Main ACTIVE_WORK claim from #521 is historical. Live main and today's PR ID list rechecked before publication; no intervening change observed.
- Generation 20 integration lock released at `4fe0656517a03cb7a39d4e248187c76ffaa3238a`, not acquired.
- #390 confirmed merged at `377c0216d451f1576f199ec0223aafadd9243002`; exact original head `b655bc273a6704c9c140287b8adcdf4085b91882`: five returned workflows success, Snyk success, CI full/lean E2E and Pages native artifact job success, zero submitted GitHub independent reviews. No edits to that branch.
- #631 exact head `bc8fa946c387274ebefdcfa9516b820bd6887477` remains CI-failed; #595 exact head `534bb3808d0f37dd2e6c1f4aaca7c529d9b2432c` four returned workflows passed but still unmerged, no submitted reviews. Keep these separate; no duplication or ownership override.
- Independent review unavailable in this round; do not claim approval. Require fresh exact-final-head hosted checks, applicable native Pages/browser qualification, current dependency and file ownership clearance and legitimate integration ownership. Draft only. No features, new dependencies, external traffic, contract/fund interaction, deployment, release or merge performed.
