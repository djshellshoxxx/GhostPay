# Existing hygiene PR #339: package qualification

## Decision

The unchanged corrected hygiene package at existing PR #339 head
`d03600ca87c7156d4acd1ff78bef6e92c20d9ea4` passes its complete original test and
coverage gate, typecheck and build. **Qualification remains blocked by seven lint
errors in the existing evidence-boundary test file.** No product or test change was
made by this qualification worker, and no duplicate feature PR was created.

This is local package evidence. It does not establish browser integration,
hosted-CI success, independent chain finality, live-provider compatibility or release
readiness. Existing [PR #339](https://github.com/djshellshoxxx/GhostPay/pull/339)
remains the authoritative implementation.

## Exact source and donor history

- Evidence branch: `qualify/ghostpay-hygiene-evidence-20261120-9a4ab6`.
- Qualified source: `d03600ca87c7156d4acd1ff78bef6e92c20d9ea4`.
- Hygiene package tree: `94cdab13ec016107609b0138a29a004ad39d36df`.
- Original main input: `aa3df1cb37274fae73af0ca957183c15c51b62d3`.
- Relative to that input, the existing implementation changes only four hygiene
  files: `verify.ts`, `verify.test.ts`, `verify.evidence-boundary.test.ts` and
  `fixtures.testutil.ts`, all under `packages/hygiene/src/`.
- `HYGIENE_SOURCE.json` records all 25 tracked package-file hashes, complete
  hygiene commit order, original gate settings and source equality.

The complete sequence was inspected, including all five later corrections after
the initial production commit:

| Existing commit | Contribution preserved and inspected |
| --- | --- |
| `86be64572c37f46c12daccf9bb00b7af298e5073` | Original evidence-boundary regression file; no historical baseline execution performed here. |
| `951cd589ed96dc9382b04762ee0dad91cf3fea89` | Private request-bound Transfer validation and event deduplication. |
| `b8cf3dcdc173ef7e46d39d59771534a3fe2e7cd2` | Shared RPC fixture includes a usable block hash. |
| `06baa1c1e2a32ed939778683b0aadb5b0a57c18e` | Existing fixtures use the requested sweep block and distinct event indices while retaining their behavioral assertions. |
| `d2101b783cbed5a052228642445c2e3804048a17` | Existing regression fixture preserves exact optional typing and removes unused destructuring bindings. |
| `44d9a35a23803a838f4d2f66685e7b0668ab98e5` | Validated block hash is narrowed through a local binding. |
| `ab7640f734a5e407dee386d7629b2fd6235d9fcc` | Existing conflicting-event regression is present. |

Final source review confirms that the private RPC helper checks the returned token
emitter and requested block interval, requires a valid block hash and log index,
and counts a repeated valid event identity once. Conflicting parsed rows for the
same identity remove that identity from accepted evidence. The exported parser's
public result shape and existing token-only RPC request shape are preserved.
The package still evaluates one provider's evidence; it does not obtain an
independent canonical header or establish chain finality.

## Executed gates

Commands ran sequentially on the exact corrected source. Node was `v24.22.3`,
npm `11.19.1`, Vitest/coverage-v8 `5.0.5`, TypeScript `5.9.3` and ESLint `10.15.0`.
The repository declares Node `>=22`; Node 22 parity was not separately executed.

| Command, from repository root | Resource setting | Actual result |
| --- | --- | --- |
| `npm run test -w @ghostpay/hygiene -- --maxWorkers=1` | `NODE_OPTIONS=--max-old-space-size=256` | Exit 0; 6/6 files and 149/149 tests pass; no skipped tests reported; all original coverage thresholds pass. |
| `npm run typecheck -w @ghostpay/hygiene` | 256 MiB heap | Exit 0. |
| `npm run lint -w @ghostpay/hygiene` | 256 MiB heap | Exit 134; V8 heap exhaustion before lint diagnostics. |
| Same original lint command, single targeted resource retry | 512 MiB heap | Exit 1; seven lint errors, zero warnings. |
| `npm run build -w @ghostpay/hygiene` | 256 MiB heap | Exit 0. |

The original coverage provider, include/exclude patterns, 60-second test timeout,
fork pool, thresholds, assertions and skips were not modified. The sole test-run
CLI override limited concurrency to one worker. No new test case or payload was
introduced. Test execution used the corrected source only.

| Coverage measure | Actual | Original required minimum |
| --- | ---: | ---: |
| Statements | 99.52% (419/421) | 95% |
| Branches | 99.1% (333/336) | 90% |
| Functions | 100% (74/74) | 95% |
| Lines | 100% (334/334) | 95% |

The seven remaining lint diagnostics are all in
`packages/hygiene/src/verify.evidence-boundary.test.ts`:

| Location | Existing rule violation |
| --- | --- |
| 21:10 | `@typescript-eslint/no-unnecessary-type-assertion` |
| 23:5 | `@typescript-eslint/require-await` |
| 49:14 | `@typescript-eslint/no-unnecessary-type-assertion` |
| 50:13 | `@typescript-eslint/no-unnecessary-type-assertion` |
| 51:11 | `@typescript-eslint/no-unnecessary-type-assertion` |
| 60:14 | `@typescript-eslint/no-unnecessary-type-assertion` |
| 61:16 | `@typescript-eslint/no-unnecessary-type-assertion` |

These are actionable existing test-source findings, rather than a remaining
resource-only blocker. The feature owner must preserve all current assertions
when correcting them on the existing implementation lane and qualify that new
head. This evidence-only branch does not make that correction.

## Dependency provenance

The full root lockfile and 20 relevant manifests/configuration inputs match both
supplied local donors byte-for-byte. All 678 external lock records match.
`HYGIENE_DEPENDENCIES.json` records exact hashes, version checks and donor heads.

External package files were reused from the matching installation in
`/workspace/scratch/9a4ab6c3d117/GhostPay/node_modules` through a separate directory
tree with hardlinked files. Cache directories `.vite`, `.cache`, `.tmp` and
`.vite-temp` were excluded. All 68 workspace links resolve into this qualification
worktree. No donor cache was used as a writable cache directory.

The 117 tracked TypeScript/JSON inputs for `core-crypto`, `chain-adapters` and
`invoice-schema` match the compiled donor at
`/workspace/scratch/3d4e69bb7cff/GhostPay`, head
`e6ed3ee64a786c33b1af06b5fc7a51d742eb6544`. Its 150 compiled dependency output files
were copied into this worktree, with individual hashes retained. No source or
dependency version was overlaid or changed. This is a reused matching dependency
installation, not a fresh `npm ci` qualification or an independent rebuild of those
three dependency packages.

## Browser and integration boundary

At the coordinator-confirmed frozen recovered-fixes/#307 input
`5a745d4b5fba69b66a9779f88aefc63c253a4f27`, a source search under `apps/web` finds
no hygiene package reference or named `addressFreeReceipt`, `sweepConfirmed` or
`spentCheck` caller. The separate privacy input
`2bc2098298d90928eb1acafad969f28316bb05fc` contains the web package dependency and
the `DestLedger`/`fundingGuard` import in `apps/web/src/lib/sweep.ts`. That separate
browser wiring does not become part of #307 through package qualification.
The frozen searches and exact commands are retained in `HYGIENE_CALLERS.json`.

No browser, live RPC, external system, wallet, transaction, full-monorepo gate,
fresh remote CI query or release action was executed by this worker. Later
integration must recheck the authoritative feature head, relevant overlaps,
required hosted CI and applicable browser acceptance. A package pass cannot close
those separate gates, and the lint result currently prevents a package-green
claim for this head.

## Evidence files

- `HYGIENE_SOURCE.json`: source hashes, original configuration and donor sequence.
- `HYGIENE_DEPENDENCIES.json`: matching lock/manifests, installed versions, workspace
  links and copied compiled dependency provenance.
- `HYGIENE_COVERAGE.json`, `HYGIENE_TYPECHECK.json`, `HYGIENE_LINT.json`,
  `HYGIENE_LINT_RETRY.json`, `HYGIENE_BUILD.json`: exact commands, UTC timestamps,
  exit codes and complete merged stdout/stderr in lossless base64 plus readable
  text. The first lint failure is retained.
- `HYGIENE_LCOV.json`: complete original LCOV result in a lossless JSON wrapper.
- `HYGIENE_CALLERS.json`: frozen browser-consumer searches.

All qualification changes are documentation/evidence plus the additive ownership
registry entry. Existing feature source, tests, dependency/configuration files and
donor history remain unchanged.
