# Original-config exhaustive web lint partition plan

Source observed: `3ab1c3f7efd2b9b65eb3db08a35748c9e515eb33`; tree `c58843c86dae5164eab259d3440aba01406bd593`. This includes the reviewed camera, hosting and canonical-array integrations. Historical 74e3111f and e74ddd26 discovery artifacts remain separately saved in scratch. The exact 497 selected paths and their file bytes are unchanged from e74ddd26; the canonical-array change is in a dependency outside the original web lint selection, whose full type graph remains enabled.

## Discovery result (no lint run)

Original npm workspace script: `eslint --config ../../eslint.config.js src e2e`, executed from `apps/web`.

Node 22.23.4, ESLint 10.15.0, typescript-eslint 8.73.0. Exact installed `findFiles` discovery (the function called by `ESLint.lintFiles`) matches an independent full humanfs walk filtered through public `isPathIgnored`/`calculateConfigForFile` exactly. No parser, TypeScript program, `lintFiles` or `lintText` was invoked. Discovery does not establish a memory bound for actual typed lint.

- 497 selected files: 455 in `src`, 42 in `e2e`.
- 326 `.ts`, 169 `.tsx`, and two `.mts` declaration files. This includes 292 `.test`/`.spec` files. There are no `.js`, `.jsx`, or `.cjs` files under these two directories.
- 508 total walked files; 11 excluded by the original resolved configuration: four `.mjs` files explicitly ignored by the repository config, three `.css`, two `.sol`, one `.json`, one `.md`. Every excluded path is listed in the JSON. No tracked file was missed by discovery.
- Two resolved configurations: 121 rule entries for `.ts`/`.tsx`; 120 for the two `.d.mts` files because the existing restricted-import rule targets only `.ts`/`.tsx`. Both retain `projectService: true` and the original workspace `tsconfigRootDir`.
- Selection SHA-256: `293c110b6816d6e1632bd141c25bba3e1611fc084ff065612e781bf55faa0eb4`.

The JSON contains each selected path, content hash, byte size, resolved-config hash, complete resolved configs, original input hashes, installed discovery source hashes, and a 21-partition proposal (24 files each, final partition 17). The text file contains all selected paths. The `.mjs` script reproduces discovery; its internal helper use is pinned to the installed ESLint version and must be rechecked if ESLint changes.

## Sound execution approach

Fresh **serial** processes are suitable for exhaustive lint evaluation here: the loaded config uses standard ESLint and typescript-eslint rules, with no custom aggregate/stateful repository plugin, no `--fix`, no `--cache`, no `--max-warnings`, no quiet filtering, and no bulk suppression file. Rule evaluation and inline directives apply to each file with the same original types/project graph. The command must keep the actual cwd `apps/web`: this config deliberately reads `process.cwd()` when setting `tsconfigRootDir`.

For each manifest partition, invoke the same installed CLI with `--config ../../eslint.config.js` and that partition's exact listed paths. The JSON `command_argv` provides argument arrays; pass them directly to `spawn`/`execFile`, not shell interpolation. Do not change rules, ignore patterns, tsconfig, parser options, environment parser backend, inline directives, or type checking. Preserve all stdout/stderr and exit status; a kill, parse error, diagnostic error, missing file or unexecuted partition means incomplete/failing qualification. Run every partition rather than stopping after a diagnostic. Only assess a complete pass when the union of successfully processed files equals the current original discovery set exactly with no duplicate/missing files and zero errors; retain warnings with original semantics (the original command has no max-warning threshold).

Recommended first execution shape after other heavy work stops: Node 22.23.4, 768 MiB old-space and 32 MiB semi-space, one process at a time, 24 files per process. These heap settings are a resource experiment, not a proven lint memory bound. Start with a representative partition to establish whether the unchanged full project fits; it still counts toward the same complete manifest if source/config are unchanged. If a partition is killed, retry its exact files in smaller fresh-process subsets and retain both attempts. If one-file processes still cannot load the project under available memory, the gate remains blocked; do not substitute a narrowed TypeScript program or turn off type-aware rules.

Before execution and at the end, rediscover the manifest and verify source/config hashes. If pending integration adds or changes files, regenerate this receipt for the final source. Capture JSON results or another per-file receipt so aggregation proves all selected files ran, not merely that each process exited. Keep the original full-command exit 137 separately: successful exhaustive partitions would establish an **exhaustive original-config partitioned lint result**, not that the previous monolithic npm command passed. Hosted CI remains authoritative for its own required job.

## Why memory may improve and why it is not guaranteed

Installed typescript-eslint `createParseSettings.js` retains a module-level `TSSERVER_PROJECT_SERVICE`; `useProgramFromProjectService.js` opens each linted client file and obtains its language-service program. A fresh process drops that accumulated state and ESLint's source/config result caches between partitions. The unchanged `apps/web/tsconfig.json` includes `src`, `e2e`, and config/support files. Every partition can therefore load the full TypeScript project and its dependency declarations; splitting ESLint input is not splitting or reducing the type graph. This makes reduced accumulated memory plausible while preserving type-aware rules, but it does not prove that the initial full-project cost fits.

No repository file, config, test, rule or gate has been edited for this investigation. No lint pass is claimed.

## Runtime cache restoration

The previous Node 22 cache executable disappeared during the environment reset. The pinned **22.23.4** executable was restored and directly version-checked at `/workspace/scratch/13855ecc035c/runtime-npm-cache/_npx/361c55be1121897e/node_modules/node/bin/node`. Final discovery used that executable. The temporary lint driver requires the same path/version; its only source adjustment is the executable-path constant. No earlier check is retroactively assigned a different runtime.
