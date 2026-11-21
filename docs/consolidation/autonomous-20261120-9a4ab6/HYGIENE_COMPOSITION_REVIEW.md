# Hygiene evidence and destination-ledger composition qualification

## Result

**The isolated composition of #339, its test-lint repair #347, and #341 passes
all four original hygiene package gates:** 161 tests across seven files, zero
failures or skips, original coverage thresholds, typecheck, typed lint and build.
The coordinator independently reviewed and approved the exact combined source.
No check required a retry, and no new implementation or test case was authored.

Existing [#339](https://github.com/djshellshoxxx/GhostPay/pull/339),
[#341](https://github.com/djshellshoxxx/GhostPay/pull/341) and
[#347](https://github.com/djshellshoxxx/GhostPay/pull/347) remain authoritative.
This is a package composition checkpoint, not a shared integration-target update,
duplicate feature PR, browser acceptance result or release qualification. The
separate 149- and 154-case donor results are not added as a unique-test total.

## Source and provenance

Worker: `/root/hygiene_composition`; branch:
`qualify/ghostpay-hygiene-composition-20261120-9a4ab6`.

| Input or checkpoint | Exact identity |
| --- | --- |
| #339 evidence implementation | `d03600ca87c7156d4acd1ff78bef6e92c20d9ea4` |
| Published #347 lint-repaired base | `95e60ce4948b7430865dafbd1ad01434310a75f7` |
| Tree-identical local #347 checkpoint | `ed3f400d29e8ff72e2dbadc4c92722581694c8f7` |
| #341 authoritative donor | `78137622011528a646ae94155ee4acf7f72e1e2a` |
| #341 original feature base | `2876b7db580e47a880d5951ce9e62941bcf76fdf` |
| Claim before source changes | `71647914` |
| Original test → composition commit | `0284eead8822306c625981d5095e983f8364cb93` → `c2cee3c8` |
| Original runtime correction | `26d2ba95a045bb60d9344cb3e4a84224c2b74b50` |
| **Executed combined source** | **`6a5cff0c1a6b521fd6fe0656edfc51c06eabf7eb`** |
| **Executed hygiene package tree** | **`087f548c2e6203cac0a4184f66157ea21cf77879`** |

Both original #341 commits were cherry-picked with `-x`, retaining their authors
and original commit references. They applied without conflicts. Current PR
metadata was read before the claim and refreshed after the checks; all three
authoritative heads remained unchanged. No broader donor history was merged.

#347's pre-change `ledger.ts` is exactly the donor's pre-change blob
`05d7f8eb0cb723266eac7a9a644053e29c2d653c`. The two final entries match #341 in
both mode and blob identity:

| Reused path | Exact final blob |
| --- | --- |
| `packages/hygiene/src/ledger.ts` | `7bc637d024db317e12bc08847d19e8348e4cbcd9` |
| `packages/hygiene/src/ledger.browser-chains.test.ts` | `b76b6cb0143901027b0006f892232cf5107be420` |

All **24 other tracked hygiene files** match #347 exactly. Thus every #339
verification correction, shared fixture repair, conflicting-event regression
and #347 lint adjustment is preserved. Only the two ledger paths change outside
the additive registry/evidence. `HYGIENE_COMPOSITION_SOURCE.json` records the
complete 26-file package comparison and full donor diff.

## Independent composition review

The changes occupy separate production paths. #339 retains request-bound
Transfer evidence, usable event identities and duplicate/conflicting-copy
handling. Its public parser and existing RPC request shape are untouched.
#341 applies the existing chain table's enabled-testnet policy to ledger reads,
reuse decisions, acknowledged reuse and restoration; ordinary recording
delegates to the guarded decision. Local Anvil remains supported. Mainnet,
disabled and unknown network IDs remain refused. The separate experimental
`assertTestnetChain` helper remains unchanged, so other hygiene RPC helpers do
not inherit the larger ledger policy. No dependency or RPC operation is added.

The coordinator `/root` separately read the entire #347-to-composition package
diff at `6a5cff0c` and approved it, citing exact donor identities, preservation of
the other 24 files and the original package results. This independent source
review is distinct from tests executed by this worker.

The ledger remains in memory. Its serialization test and inherited comment do
not establish encryption or durable recovery. Accepted provider evidence does
not independently establish canonical headers or chain finality. These limits
remain explicit in the approval and handoff.

## Actual execution

Commands ran sequentially against `6a5cff0c`, without uncommitted tracked source
changes, under Node `v24.22.3` and npm `11.19.1`. Original assertions, fork pool,
60-second test timeout, coverage configuration, thresholds and skips remain.

| Original command | Heap limit | Actual result | Duration |
| --- | ---: | --- | ---: |
| `npm run test -w @ghostpay/hygiene -- --maxWorkers=1` | 256 MiB | **161/161 tests, 7/7 files, zero skips; coverage passed** | 11.617 s |
| `npm run typecheck -w @ghostpay/hygiene` | 256 MiB | Exit 0 | 2.641 s |
| `npm run lint -w @ghostpay/hygiene` | 512 MiB | Exit 0; no findings | 4.337 s |
| `npm run build -w @ghostpay/hygiene` | 256 MiB | Exit 0 | 1.980 s |

| Coverage | Combined result | Original minimum |
| --- | ---: | ---: |
| Statements | 99.52% — 422/424 | 95% |
| Branches | 99.12% — 341/344 | 90% |
| Functions | 100% — 75/75 | 95% |
| Lines | 100% — 337/337 | 95% |

All four checks passed their first invocation. The existing npm `http-proxy`
configuration warning remains in the complete logs. No baseline failure or
vulnerability reproduction was run. Historical results are not new passes.

## Dependencies and evidence

The complete lock and **77** tracked manifest/configuration files match the
lint-repair donor. All **20** relevant configuration inputs and **117** tracked
dependency TypeScript/JSON inputs match their preserved provenance. All **150**
compiled dependency outputs were independently copied only after source/output
hash comparison. The package's own combined-source build was freshly executed.

The matching existing installation has **678** external lock records, no missing
nonoptional installed path, separate cache directories and **68** workspace links
resolving inside this worktree. External files are hardlinked into separate
directories, excluding `.vite`, `.cache`, `.tmp` and `.vite-temp`. This is cache
reuse, not a fresh `npm ci` or fresh build of the three unchanged dependencies.

- `HYGIENE_COMPOSITION_CURRENT_PRS.json`: final live input-head refresh.
- `HYGIENE_COMPOSITION_SOURCE.json`: complete source/donor preservation proof
  and exact-source browser-consumer searches.
- `HYGIENE_COMPOSITION_DEPENDENCIES.json`: complete matching-input and reused
  installation/output provenance, including the original proof.
- `HYGIENE_COMPOSITION_CHECKS.json`: commands, source/tree identities, UTC times,
  exits and complete lossless UTF-8/base64 process outputs.
- `HYGIENE_COMPOSITION_LCOV.json`: original 12,635-byte LCOV and verified hash.

All four process-output wrappers and LCOV reproduce their original bytes and
SHA-256 values. Terminal blank lines are retained inside wrappers; no output was
trimmed to alter a gate result.

## Remaining integration boundary

Exact-source searches find no `DestLedger` or `@ghostpay/hygiene` browser caller
in current #307 `5a745d4b5fba69b66a9779f88aefc63c253a4f27` or this composition.
Privacy #336 `410353a23631234aa888e46f38df22291c699a26` contains the separately
owned dependency and Sweep caller. Package qualification does not install that
wiring or repair the privacy stack's failed browser gates.

The coordinator may retain this exact checkpoint for integration, preserving
current main/#307 changes and checking current input heads and ownership before
any shared update. Applicable final-composition and actual browser-caller gates
remain required. Full-monorepo, hosted CI, Pages, Tor, native browser/mobile,
real-provider, wallet and financial acceptance were not executed here. No shared
branch, remote ref, integration lease, release or deployment was changed.
