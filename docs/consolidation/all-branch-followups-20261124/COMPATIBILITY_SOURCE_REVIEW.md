# Final extended composition — independent source review

## Decision

**Approved for source composition. No source-preservation blocker found.**

The reviewed immutable commit is `7852931fecc8bdd2ab17e3e70813f36e502c50b0`, with tree `bc51e09031d4d52a47b01596ed24ef5a8297a945`, in `/workspace/scratch/f80482f352bc/GhostPay-followups`. The application baseline is `bda2af071d4b9d3c85bbe4a20da2f8edb5eabcf8`, tree `8add357748674afb128926a797982badb54bac6b`.

This review independently verifies the coordinator's three merges against immutable Git objects. It reuses the separate unit reviews listed below. The reviewer authored the earlier standalone tooling recovery; its independent unit approval comes from `/root`. The cookie unit's separate independent approval comes from `/root/ui_data_review`. This is source and composition approval, not a new final-head execution result.

The companion machine-readable record is `final-extended-composition-independent-review-7852931.json`. It contains exact pins, path lists, proof hashes, per-parent claim-preservation checks, dependency comparisons, and explicit evidence limits.

## Preserved scope

| Property | Independently verified result |
| --- | --- |
| Tracked tree entries | 4,402 at the baseline; 4,418 at the reviewed tree |
| Complete delta | 20 paths: 16 additions, 4 existing-path modifications, no deletions |
| Existing entries with identical mode/type/blob | 4,398 of 4,402 |
| Existing application runtime | Unchanged; the sole `apps/` addition is the HTTPS/RPC browser spec |
| Package source | Entire `packages/` subtree is exact |
| Workflows and actions | Entire `.github/` subtree is exact |
| Existing test/spec paths | 985 retained: 984 byte-exact; the remaining test retains its entire original file as an exact prefix |
| Added test/spec paths | 4, yielding 989 test/spec paths; these are file counts, not executed-case counts |
| Merge-entry comparisons | 44 checks across the three merges, covering 19 distinct nonshared paths |
| History | Baseline and all three selected unit heads are ancestors of the reviewed commit |

The only modified existing paths are `docs/ai/ACTIVE_WORK.md`, `package.json`, `package-lock.json`, and `scripts/tests/dependency-tooling.test.mjs`. The claim registry preserves both parents' ordered nonblank lines and line multiplicities at each merge. The manifest, lockfile and test changes are limited to the scoped cookie correction described below.

The 16 additions consist of the HTTPS browser spec and its compatibility document, two read-only helper implementations, their three test files, two input/interpretation contract documents, three handoffs, two qualification JSONs, and two archived qualification logs. None activates an additional application feature, provider, network transport, workflow, or analyzer invocation.

## Three merge proofs

| Unit head | Root merge | Nonshared entry checks | Result |
| --- | --- | ---: | --- |
| Tools `7851c5063282255117709296ddde7dcef148444c` | `2b2d60df7283e1bc01fdfe22cf355a42aa6ac99a` | 10 | Every entry matches the selected parent, merge, and final tree |
| HTTPS/RPC `d995764543041b0d971db2759be9b2f3f9afc9a7` | `3fd5fefbf95a17d2bde6b3152d63eb57f3849636` | 15 | Every entry matches the selected parent, merge, and final tree |
| Cookie `bb81db3e68bc6725e6d966593a7f20bda88cd31d` | `7852931fecc8bdd2ab17e3e70813f36e502c50b0` | 19 | Every entry matches the selected parent, merge, and final tree |

For each JSON under `compatibility-merge-proofs`, the actual merge parents, tree, and unique merge base match the recorded values. The shared changed-path intersection contains only `docs/ai/ACTIVE_WORK.md`. The recorded nonshared list exactly exhausts the computed list, without duplicates. The complete merge tree equals the parent union except the additive claim resolution. Both parents' nonblank claim sequences remain ordered subsequences of the result; line counts equal the sum of the parents minus the merge base. No conflict markers remain.

These comparisons also verify the carried units through later merges, rather than checking only the new unit at each step.

## Scoped cookie correction

The final manifest adds only the override `"@sentry/node@5.30.0": { "cookie": "0.7.2" }`, preserving all existing overrides and other manifest fields. Exactly one of 815 lock package records changes: `node_modules/cookie`. Its only changed fields are `version`, `resolved`, and `integrity`, moving version `0.4.2` to `0.7.2`. Development status, license, engine metadata, all 814 other records, and lock top-level metadata remain exact. All 222 nondevelopment, nonlink package records excluding root metadata remain exact; including root metadata the count is 223.

The existing dependency-tooling test retains its original five cases and every original byte. One ordinary Sentry request-extractor compatibility case is appended. It covers decoded, empty, quoted and duplicate cookies, absent cookie headers, and preservation of a middleware-provided cookie object. The three changed product files are exact to both the reviewed cookie source `5a2038d6f5fd0e01f663a09d9dcaa75742754c07` and original donor `d3c2228c53cbda4ee650ec91776af8bb1c02674d`.

The reused cookie evidence qualifies a clean root-plus-one-workspace install of 334 packages and the separately reviewed consumer, router and compile checks. It is not a complete repository install. The full audit retained 15 low findings, with no moderate, high or critical findings; a clean full audit is not claimed. Historical donor installation results remain historical.

## New units and contract limits

The HTTPS/RPC spec and its compatibility document are exact to the separately reviewed donor entries. The test serves the built site through actual loopback TLS, uses an intercepted synthetic RPC, checks secure-context and selected-chain behavior, and cleans up its owned context, server and certificate directory. It does not qualify Tor routing or a live external RPC. Native acceptance requires hosted execution.

The claims comparator and its canonical suite/wrapper retain the exact reviewed source. Its documented canonical input contract remains explicit: the current `refresh/2` census shape requires normalization before meaningful use. No adapter, live census result, ownership release, ref mutation, or new gate is implied.

The Mythril summary helper and its tests also retain their exact reviewed source. The current runner's five-target order is compatible with its positional format. Positional labeling cannot prove contract identity, real analyzer execution, or absence of findings. No analyzer was run by this review, and the unit adds no workflow invocation or weaker acceptance rule.

## Reused independent reviews and qualification limits

The following existing reviews were read and their exact file hashes are recorded in the JSON:

- `/workspace/scratch/f80482f352bc/additional-compatibility-independent-review.md`
- `/workspace/scratch/f80482f352bc/additional-compatibility-independent-review.json`
- `/workspace/scratch/f80482f352bc/cookie-377-independent-review/REVIEW.md`
- `/workspace/scratch/f80482f352bc/cookie-377-independent-review/SOURCE_EVIDENCE.json`

No source, refs or remote state were changed. No project tests, native browser tests, installs, builds or analyzer runs were repeated. All verification in this review uses immutable source objects and existing evidence.

Earlier application/package execution results retain their original source pins. Application runtime and package source remain unchanged, but the final root manifest and lockfile differ by the scoped development-cookie correction. Whole-input equality to earlier pre-cookie runs is therefore not claimed. Applicable exact-composition hosted installation, Node, browser and security gates remain required before integration. Report-only staging after this reviewed commit does not alter this source pin; a later report commit needs its own docs-only-delta verification.
