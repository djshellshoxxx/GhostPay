# Original-config web lint discovery and partition assessment

Source observed: `9b8e502498388405d5f03da170e7c51574bc06a6`; tree `e585d1dec43844bd18167f213c246994ea6c4397`. This includes the reviewed camera, hosting, canonical-array and merchant-clock integrations. The exact 497 selected paths and file bytes remain unchanged from the e74 and 3ab discoveries. The two invoice-schema corrections are outside the original web lint file selection; the full dependency type graph remains enabled by the original configuration.

The complete 3ab trial, exact driver and discovery inputs are retained unchanged in `web-lint-partitions-3ab/`. Those historical results are not qualification for this newer source.

## Discovery result (no lint run)

Original npm workspace script: `eslint --config ../../eslint.config.js src e2e`, with actual cwd `apps/web`.

Node 22.23.4, ESLint 10.15.0, typescript-eslint 8.73.0. Installed `findFiles` discovery used by `ESLint.lintFiles` matches an independent full humanfs walk filtered through public `isPathIgnored` and `calculateConfigForFile`. No parser, TypeScript program, `lintFiles` or `lintText` was invoked. Discovery does not establish a memory bound for typed lint.

- 497 selected files: 455 in `src`, 42 in `e2e`.
- 326 `.ts`, 169 `.tsx`, and two `.mts` declaration files, including 292 `.test`/`.spec` files. No `.js`, `.jsx` or `.cjs` files exist under the two selected directories.
- 508 total walked files; 11 excluded by the original resolved configuration: four `.mjs`, three `.css`, two `.sol`, one `.json` and one `.md`. The manifest lists every excluded path. No tracked file was missed.
- Two resolved configurations: 121 rule entries for `.ts`/`.tsx`; 120 for the two `.d.mts` files because the existing restricted-import rule targets `.ts`/`.tsx`. Both retain `projectService: true` and the original workspace `tsconfigRootDir`.
- Selection SHA256: `293c110b6816d6e1632bd141c25bba3e1611fc084ff065612e781bf55faa0eb4`.

The JSON contains every selected path, content hash, byte size, resolved-config hash, complete resolved configs, original input hashes and installed discovery-source hashes. Its 21 partitions contain 24 files each except the final 17. The text file contains all selected paths. The `.mjs` reproduces this discovery for the recorded workspace; its internal ESLint helper use is version-specific.

## Historical execution outcome

The earlier original monolithic command ended with exit 137. The subsequent trial selected only partition 3 at source `3ab1c3f7efd2b9b65eb3db08a35748c9e515eb33`, using the reviewed driver, Node 22.23.4, 768 MiB old-space and 32 MiB semi-space. The ESLint child received SIGKILL (return -9; shell equivalent 137) after 185.333358435 seconds, with Linux wait4 maximum RSS 404,932 KiB. Child completion was 10:20:16.248895 UTC; the aggregate was written at 10:20:29.716100 UTC.

There was no `eslint.json`: zero files have verifiable lint results, error/warning totals are unknown, and 20 partitions were unexecuted. The driver exited 2. The cause of SIGKILL is unknown; the receipts do not establish OOM or a source/ESLint defect. Input hashes remained unchanged across the attempt. All original artifacts and their independent review are preserved in the historical directory.

No retry, smaller-subset attempt or remaining-partition execution was performed. No lint process was run for this refreshed discovery. The failed trial establishes neither resource suitability nor an exhaustive partitioned lint pass.

## Semantic conditions for a future exhaustive result

Fresh serial processes preserve the original per-file rules here: the configuration uses standard ESLint/typescript-eslint rules, with no custom aggregate/stateful repository plugin. The actual cwd must remain `apps/web`, because `tsconfigRootDir` uses `process.cwd()`. A future separately coordinated evaluation must retain the original configuration, rules, ignore patterns, parser options, inline directives and full TypeScript project; it must not substitute a reduced type graph.

The manifest's exact argument arrays can be passed directly to the same installed CLI. Preserve stdout/stderr, terminal codes and per-file JSON. The original command has no `--fix`, `--cache`, `--max-warnings` or quiet filtering; retain those semantics. A complete pass requires the successful result-file union to equal the original discovery exactly, with no missing, duplicate, ignored or unexpected files and zero errors. Warnings remain visible with the original nonblocking semantics. Killed, failed or unexecuted work cannot count as qualified.

Source/config/input hashes must bind every result to one current source. Historical attempts remain distinct. Even a later complete success would be an **exhaustive original-config partitioned lint result**, not a successful replay of the earlier monolithic npm command. Hosted CI remains responsible for its own required job.

## Why partitioning may change resource use

Installed typescript-eslint retains a module-level TypeScript project service and opens each linted file through it. Fresh processes discard accumulated parser/language-service and ESLint caches between partitions. However, the unchanged web tsconfig includes `src`, `e2e` and support files; every partition may load the full project and dependency declarations. Splitting ESLint input does not reduce the type graph. Resource suitability remains unproven after the failed trial.

## Runtime and scope

The pinned Node 22.23.4 executable was restored and verified at `/workspace/scratch/13855ecc035c/runtime-npm-cache/_npx/361c55be1121897e/node_modules/node/bin/node`. This discovery used that executable. The retained historical driver contains the independently reviewed path-only correction; no further driver change is part of this refresh.

This investigation changes documentation/discovery artifacts only. No product runtime, configuration, test, rule, timeout or gate is altered. No new lint, test, TypeScript or coverage pass is claimed.
