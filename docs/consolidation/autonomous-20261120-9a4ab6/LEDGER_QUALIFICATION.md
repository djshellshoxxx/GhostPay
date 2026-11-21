# Seven-testnet destination ledger: independent package qualification

## Result and source

**The existing #341 source passed independent review and all four original
hygiene package gates: 154 tests with coverage, typecheck, typed lint and build.**
No product, test, dependency, configuration, assertion or threshold was changed
by this qualification worker. Browser integration and final combined-source
qualification remain open.

| Identity | Immutable value |
| --- | --- |
| Existing authoritative feature PR | [#341](https://github.com/djshellshoxxx/GhostPay/pull/341) |
| Qualified source | `78137622011528a646ae94155ee4acf7f72e1e2a` |
| Original feature base | `2876b7db580e47a880d5951ce9e62941bcf76fdf` |
| Original test-first contribution | `0284eead8822306c625981d5095e983f8364cb93` |
| Original production correction | `26d2ba95a045bb60d9344cb3e4a84224c2b74b50` |
| Qualification claim | `6972f1f51a1a991457c616b03c04d916e4a7d8be` |
| Frozen current integration #307 | `5a745d4b5fba69b66a9779f88aefc63c253a4f27` |

Worker: `/root/ledger_qualification`, independent of the original implementation.
Branch: `qualify/ghostpay-ledger-evidence-20261120-9a4ab6`. The live PR metadata
was refreshed before the ownership claim and still identified the exact source
above. The 111-PR frozen path inventory identifies only #341 as owner of
`ledger.ts` and `ledger.browser-chains.test.ts`. #339's verification paths are
separate. This evidence extends the existing `ACTIVE_WORK.md` registry; it does
not replace the registry or transfer integration ownership.

## Reviewed behavior and limits

The existing [production correction](https://github.com/djshellshoxxx/GhostPay/commit/26d2ba95a045bb60d9344cb3e4a84224c2b74b50)
replaces the ledger's use of the smaller experimental helper guard with a
ledger-specific rule. Safe-integer identifiers must resolve through the existing
`findChain` table to an enabled testnet; local Anvil remains an explicit supported
test chain. The seven enabled networks are Ethereum Sepolia, Base Sepolia,
OP Sepolia, Arbitrum Sepolia, Polygon Amoy, BNB Testnet and Avalanche Fuji.
Mainnets, disabled and unknown networks remain refused. This is static policy
validation, not independent observation of an RPC's network identity or finality.

The same guard is used for reads, reuse decisions, acknowledged reuse and strict
row restoration. Ordinary `record` calls the guarded `canUse` method. The
existing narrower `assertTestnetChain` helper is byte-identical to the feature
base and still limits the other experimental helpers to Anvil, Ethereum Sepolia
and Base Sepolia. The feature adds no dependency or storage mechanism; hygiene
already declares `@ghostpay/chain-adapters` as a direct dependency.

The existing regression pins the seven-network table, exercises record/read/reuse
and serialization restoration on each enabled testnet, retains local testing and
network rejection, checks isolation of history by chain, and preserves the
narrower helper policy. Existing package assertions and error handling remain.
No blocking defect was found in this bounded source review.

`DestLedger` is a pure in-memory model. Its `toJSON`/`from` round trip is
serialization, not encryption, durable storage or a browser restart test. The
package does not itself supply those properties. No payment submission,
transaction signing, automatic refund or persistent duplicate-payment guarantee
is added or established here.

### The browser dependency remains separate

The original #341 handoff describes a browser caller in #307. Fresh source
inspection establishes a narrower current result:

| Inspected exact source | `apps/web` search for `DestLedger` or `@ghostpay/hygiene` |
| --- | --- |
| Current #307 `5a745d4b` | No matches |
| Existing #341 `78137622` | No matches |
| Privacy #326 `a34ce43e` | Dependency and Sweep caller present |
| Privacy #327 `9608ec99` | Dependency and Sweep caller present |
| Privacy #336 `410353a2` | Dependency and Sweep caller present |

The full exact-ref search results are retained in `LEDGER_SOURCE.json`. Package
qualification therefore does not establish that current #307 displays these
warnings. Integration must preserve the separately owned privacy stack and test
the actual combined browser caller. A serializable model alone does not change
the browser's session-only retention contract.

## Executed checks

Execution used Node `v24.22.3` and npm `11.19.1`. Each original script ran
sequentially. Only Node heap size and the test command's worker concurrency were
bounded; the original configuration, test timeout, assertion set, coverage
thresholds and skip behavior remained unchanged.

| Check | Actual result | Duration |
| --- | --- | ---: |
| Original chain-adapters dependency build, including core-crypto and invoice-schema | Passed, exit 0 | 6.451 s |
| Original hygiene test script, `--maxWorkers=1` | 154/154 tests, 6/6 files, zero failures/skips; coverage passed | 11.618 s |
| Original hygiene typecheck | Passed, exit 0 | 3.013 s |
| Original hygiene typed lint | Passed, exit 0; zero lint findings | 4.858 s |
| Original hygiene build | Passed, exit 0 | 2.472 s |

| Coverage | Result | Original threshold |
| --- | ---: | ---: |
| Statements | 100% — 398/398 | 95% |
| Branches | 99.68% — 313/314 | 90% |
| Functions | 100% — 73/73 | 95% |
| Lines | 100% — 317/317 | 95% |

Commands, from the qualification worktree root:

```sh
NODE_OPTIONS=--max-old-space-size=256 npm run build -w @ghostpay/chain-adapters
NODE_OPTIONS=--max-old-space-size=256 npm run test -w @ghostpay/hygiene -- --maxWorkers=1
NODE_OPTIONS=--max-old-space-size=256 npm run typecheck -w @ghostpay/hygiene
NODE_OPTIONS=--max-old-space-size=512 npm run lint -w @ghostpay/hygiene
NODE_OPTIONS=--max-old-space-size=256 npm run build -w @ghostpay/hygiene
```

No package gate failed or required a resource retry. The npm invocations emit
the existing environment's `http-proxy` configuration warning; it is preserved
in the logs. No baseline failure was rerun or relabelled as new evidence.

## Dependency and evidence provenance

The installed external dependency tree was reused after verifying the complete
lockfile, 20 relevant manifest/configuration files, all 678 external lock records,
the selected tool/direct dependency versions and zero missing nonoptional
installed paths. External package files were hardlinked into separate dependency
directories. All 68 workspace links resolve into this worktree, and cache
directories are separate. This was not a fresh `npm ci`.

The first candidate compiled-output check stopped before any copying because a
source-equality assertion failed. The complete comparison found 12 differing
input files, including six production files in chain-adapters and invoice-schema.
**No compiled output was reused.** The original chain-adapters package script
rebuilt the three dependency packages from this exact older source. Their 153
generated outputs are pinned in the evidence, and the final hygiene build was
also run from its unchanged source.

- `LEDGER_CURRENT_PR.json`: live source metadata before the claim.
- `LEDGER_DEPENDENCIES.json`: installation matches, rejected compiled-candidate
  differences, isolated links and dependency provenance.
- `LEDGER_SOURCE.json`: all 25 tracked hygiene file hashes, original corrective
  diff, unchanged narrow guard, consumer searches, ownership comparison and
  freshly built dependency output hashes.
- `LEDGER_CHECKS.json`: complete command metadata and lossless process-output
  wrappers, preserving original bytes, byte counts and SHA-256 values.
- `LEDGER_LCOV.json`: lossless original LCOV output and its SHA-256.

The qualification claim is documentation only; every command's recorded source
head is that claim successor of the exact feature source. Subsequent changes
are evidence and additive status only. Final scope and whitespace checks verify
that no application, package, script or workflow source changed.

## Integration handoff

Keep #341 as the authoritative implementation and reuse its original test and
runtime commits. Do not rewrite the feature or infer completed browser warnings
from this package pass. #339 has disjoint source paths in the same package; its
later corrected evidence and this result do not qualify a new combined package
tree automatically. After composing the selected donors, rerun the original
package gates and the actual privacy/Sweep browser regressions on that resulting
source, preserving all current-main and integration changes.

No hosted CI, full-monorepo build, browser bundle, Chromium/Firefox/mobile,
Pages, Tor, live provider, real wallet or payment acceptance was executed by
this worker. No shared source branch, lease, remote ref, release or deployment
was changed. The existing held generation-11 lease remains with its coordinator;
timestamp expiry does not authorize this worker to take it over.
