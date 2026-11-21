# Published-source build qualification — 2026-11-18

Full/lean web builds, both Pages artifact builds and actual loopback file checks, the development release build, and the two-clean-clone reproducibility gate passed. Browser acceptance remains blocked: the actual full/lean Chromium processes aborted on the runtime socket restriction before application assertions. No product or workflow source was changed in this lane, and no tag, deployment, release publication, or main merge was performed.

## Source and tools

| Item | Verified value |
|---|---|
| Published source commit | `9bad95e5cc0ee73f5adb8d2c587161074b21e080` |
| Source tree | `81341de7972041b5f7ce53da76027846356fab90` |
| Source URL | https://github.com/djshellshoxxx/GhostPay/tree/9bad95e5cc0ee73f5adb8d2c587161074b21e080 |
| Original local source with identical tree | `e8c77e7e8699dd16b86b7a1ff90b834594d07105` |
| Node | `22.23.5` |
| npm and npx | `11.21.2` |
| Lockfile SHA-256 | `0b79a483446f8c5778ff7f5bf178762e2c12c66a90fc13ca8f62158b1e01cce2` |
| SOURCE_DATE_EPOCH | `1795012894` (published commit time) |
| Existing system Chromium | `156.0.8078.79`, `/usr/bin/chromium` |

The checkout was fetched from the published branch and detached at the exact commit above. `source-before-builds.json` records the original clean source. `source-after-builds.json` independently records the same HEAD/tree and no source changes for the primary checkout and both reproducibility clones. The latter checks exclude only the generated `release-out` directory, in addition to normal Git-ignored outputs.

Exact resolved Node/npm/npx paths are in `resolved-toolchain-check.json` and its log. Tool probes also record installed Foundry `1.8.5` / `51a52c59cffd940f76eddd0b4bb1791aa4b5ac7f` and solc `0.8.28`; this build lane makes no additional native-contract test claim.

## Actual outcomes

| Record | Exit | Seconds | Outcome |
|---|---:|---:|---|
| `clean-install` | 137 (SIGKILL/-9) | 14.677 | SIGKILL; cause unproven; 768 MiB old-space cap; retained failure. |
| `clean-install-retry-384` | 137 (SIGKILL/-9) | 16.250 | SIGKILL; cause unproven; one authorized 384 MiB retry; retained failure. |
| `clean-install-after-suite` | 0 | 9.594 | Passed after the root full test run completed; 721 packages, exact pinned toolchain. |
| `build-libraries` | 0 | 79.462 | Dependency-ordered libraries built from the clean installation; 768 MiB cap. |
| `web-full` | 0 | 14.043 | TypeScript, Vite and postbuild bundle scan passed; 19 retained files. |
| `web-lean` | 0 | 14.441 | TypeScript, Vite and postbuild bundle scan passed; 17 retained files. |
| `pages-project-build` | 0 | 15.275 | Default clean-source Pages build gates passed; shared declared origin; 16 site files; no manifests. |
| `pages-project-check` | 0 | 0.176 | All 16 file hashes and 15 actual HTTP file bodies/MIME types passed under /GhostPay/. |
| `pages-dedicated-build` | 0 | 15.203 | Default clean-source Pages build gates passed; placeholder dedicated declared origin; 16 site files; no manifests. |
| `pages-dedicated-check` | 0 | 0.187 | All 16 file hashes and 15 actual HTTP file bodies/MIME types passed under /. |
| `playwright-full` | 1 | 14.769 | Preflight failure: my GP_COMMIT stamp intentionally classified the public test-key fixture as production, so its key was rejected; no browser launch. |
| `playwright-full-standard` | 1 | 19.071 | Normal invocation built its server, then pinned Chromium1255 was missing: 1 launch failure, 84 not run; no application assertion pass. |
| `playwright-full-system` | 1 | 18.923 | Supported system-browser override actually launched Chromium, then socket EPERM/SIGABRT: 1 launch failure, 84 not run; no application assertion pass. |
| `playwright-lean-system` | 1 | 16.887 | Supported system-browser override actually launched Chromium, then socket EPERM/SIGABRT: 1 launch failure, 74 not run; no application assertion pass. |
| `release-build` | 0 | 102.182 | Actual release:build, including fresh npm ci, libraries, chain-matrix gate, full web and SBOM; channel development. |
| `release-artifact-check` | 0 | 0.041 | Independent metadata, complete checksums, regular-file membership and tar metadata/path checks passed. |
| `release-repro` | 0 | 206.123 | Actual --head clean-clone command passed; tarball and SBOM byte-identical in two different checkout paths. |
| `repro-a-artifact-check` | 0 | 0.048 | First retained clone artifact passed the independent development-artifact checks. |
| `repro-b-artifact-check` | 0 | 0.042 | Second retained clone artifact passed the independent development-artifact checks. |

The first two installation processes received SIGKILL, with no V8 heap diagnostic. Their cause is unproven. The unchanged 768 MiB installation command passed after the concurrent root test suite completed; the original failures remain in the records. No failure was silently replaced with a pass.

## Pages artifact scope

Both invocations used the repository's default clean-source gates, with no deployment manifests or release keys. All payments are disabled. Their embedded commit equals the published SHA. The checks validate the generated site's allowlisted files, lean module/worker report, expected source and lockfile metadata, complete checksum membership, all file contents, and real HTTP responses from the shipped loopback Pages stand-in.

| Artifact | Declared origin | Local serving path | SHA-256 of SHA256SUMS |
|---|---|---|---|
| `artifacts/pages-project` | `https://djshellshoxxx.github.io` (shared) | `/GhostPay/` | `e9d03e75ec6232af625cf1193a0978777a6f56f69927e1169b95493e95b5118f` |
| `artifacts/pages-dedicated` | `https://ghostpay.example` (placeholder dedicated origin) | `/` | `ddcca5eda8cb44ea3f781df0e8483da28e50c9738cd91d472e81fe60ed75ec17` |

Each artifact contains 16 files. The `.nojekyll` control marker is hash-checked; the other 15 files were fetched and their response bytes and MIME types verified. The project check also verified the trailing-slash redirect and rejection of a request outside the project path. The local server intentionally supplied no security headers, matching its source behavior.

These are static artifact and loopback transport checks. They do not establish a hosted HTTPS deployment, browser enforcement of CSP or origin checks, successful worker execution, UI behavior, wallet behavior, anonymity, or browser RPC silence. Each helper result explicitly records `hostedOriginTested: false` and `browserTested: false`.

Pages' build subprocess uses `env -i`, which clears NODE_OPTIONS. The authorized scratch-only `resource-bin/node` wrapper invokes the exact pinned Node with `--max-old-space-size=1536`; it forwards no arbitrary NODE_OPTIONS and changes no repository gate. `resource-wrapper-check.log` verifies this in a cleared environment: Node22.23.5, explicit old-space cap, NODE_OPTIONS absent. Other web/release builds used the same 1536 MiB old-space setting normally. The cap is not a claim that total process RSS is bounded to that number.

## Browser attempts

The first full attempt supplied `GP_COMMIT` to identify the fixture build. The shipped key parser defines a 40-hex GP_COMMIT without the development marker as production, and correctly rejected the public test signing key. This was a qualification invocation error, not a discovered product regression. That failed preflight is retained separately.

The normal full invocation omitted that variable, matching the shipped test command. Its web-server build completed; Playwright then could not find its expected Chromium headless-shell1255 installation. The supported `GHOSTPAY_CHROMIUM=/usr/bin/chromium` override was used for actual full and lean launch attempts without any runtime access-control workaround. Both processes aborted with `socket() failed: Operation not permitted` at `process_singleton_posix.cc:297` and `SIGABRT`.

Full selected 85 tests: one launch failure and 84 not run. Lean selected 75: one launch failure and 74 not run. The failing setup happened before application assertions. No Chromium, accessibility, device, CSP, IndexedDB, wallet or user-flow acceptance pass is claimed. The existing system Chromium version is distinct from the missing pinned Playwright browser. No additional browser download or restrictive-runtime workaround was attempted.

## Development release and reproducibility

`VERSION=qualification-9bad95e5` is not a release tag. All three generated manifests record `channel: development`, `tag: null`, `sourceTree.clean: true`, the exact published commit, Node22.23.5 and npm11.21.2. The normal release build performs its own fresh npm installation, library rebuild, chain-matrix validation, full web build, bundle scan, and npm CycloneDX SBOM generation. No install/build gate was skipped.

| Artifact | Identical SHA-256 in standalone build and both clones |
|---|---|
| `ghostpay-web-qualification-9bad95e5.tar.gz` | `3ad9d94c09e5dfedecf2fe5be5b5748b83e3d0df5cd9b396230f603d41eb4cc1` |
| `sbom.cdx.json` | `e2165196882b5150466731805c38c7fb93d088d1344aebba11d880831bee107d` |
| `release-manifest.json` | `5a8c345a094e048542b00c1adb0cbb9aae15c4194fb32af6e9162245fbab4213` |

The repository's `release:repro -- --head` command explicitly compares the tarball and SBOM and returned zero. The separate artifact checks also verify each manifest and tar member's source ID, fixed epoch, owner/group, path and regular-file properties, reject duplicate members, and compare full file hashes. They parse the CycloneDX metadata and count 139 components; they do not independently prove dependency completeness. The reproducibility result covers two clean checkout paths within this pinned environment, not a cross-platform campaign.

Retained output locations:

- `artifacts/release-development/`
- `tmp/ghostpay-repro.tvEPwc/a-first/ghostpay/release-out/`
- `tmp/ghostpay-repro.tvEPwc/b-second/nested/GhostPay-repro/release-out/`

The two clone build logs are `tmp/ghostpay-repro.tvEPwc/a-first.log` and `tmp/ghostpay-repro.tvEPwc/nested.log`. Full and lean pre-browser snapshots are in `artifacts/web-full/` and `artifacts/web-lean/`, with SHA-256 inventories alongside them. Existing Vite chunk-size/dynamic-import warnings and the default broad connect-src note remain visible in the build logs; no gate was relaxed to suppress them.

## Independent review and evidence

The archaeology worker independently reviewed the scratch helper, corrected its emitted `./` checksum-prefix handling before execution, and reviewed the completed Pages/web artifacts. Its read-only review correctly distinguishes metadata from executed build provenance and static HTTP checks from browser acceptance. The release helper's exact membership and duplicate-path checks were strengthened before its first execution. Final independent evidence review is recorded by that worker; this report does not invent a rerun on its behalf.

`qualification-results.json` contains every command record and log digest. `evidence-index.json` pins the retained evidence and artifact metadata. All files are under `/workspace/scratch/4fa14be12559/analysis-build` unless an absolute tool path is recorded. Root owns remaining hosted qualification, typed-web lint and any final publication decision.

## Exact commands and environment overrides

The runner prepends the verified Node22 directory, npm11.21.2 directory and pinned native-tool directory to PATH, sets CI=1/TZ=UTC/LC_ALL=C, and removes ambient build/release switches before applying the listed explicit overrides. No repository source is modified by the runner. Every JSON record captures the argv array, directory, overrides, heap setting, times, exit code and raw log path.

### clean-install

`NODE_OPTIONS=--max-old-space-size=768`; working directory `/workspace/scratch/4fa14be12559/analysis-build/source`; resource-only Pages node wrapper: `False`.

```sh
npm ci --ignore-scripts --prefer-offline --no-audit --no-fund
```

Record: `clean-install.json`; output: `logs/clean-install.log`.

### clean-install-retry-384

`NODE_OPTIONS=--max-old-space-size=384`; working directory `/workspace/scratch/4fa14be12559/analysis-build/source`; resource-only Pages node wrapper: `False`.

```sh
npm ci --ignore-scripts --prefer-offline --no-audit --no-fund
```

Record: `clean-install-retry-384.json`; output: `logs/clean-install-retry-384.log`.

### clean-install-after-suite

`NODE_OPTIONS=--max-old-space-size=768`; working directory `/workspace/scratch/4fa14be12559/analysis-build/source`; resource-only Pages node wrapper: `False`.

```sh
npm ci --ignore-scripts --prefer-offline --no-audit --no-fund
```

Record: `clean-install-after-suite.json`; output: `logs/clean-install-after-suite.log`.

### build-libraries

`NODE_OPTIONS=--max-old-space-size=768`; working directory `/workspace/scratch/4fa14be12559/analysis-build/source`; resource-only Pages node wrapper: `False`.

```sh
npm run build:libs
```

Record: `build-libraries.json`; output: `logs/build-libraries.log`.

### web-full

`NODE_OPTIONS=--max-old-space-size=1536`; working directory `/workspace/scratch/4fa14be12559/analysis-build/source`; resource-only Pages node wrapper: `False`.

```sh
GHOSTPAY_LOCAL_BUILD_PROFILE=full GP_COMMIT=9bad95e5cc0ee73f5adb8d2c587161074b21e080 npm run build --workspace @ghostpay/web
```

Record: `web-full.json`; output: `logs/web-full.log`.

### web-lean

`NODE_OPTIONS=--max-old-space-size=1536`; working directory `/workspace/scratch/4fa14be12559/analysis-build/source`; resource-only Pages node wrapper: `False`.

```sh
GHOSTPAY_LOCAL_BUILD_PROFILE=lean GP_COMMIT=9bad95e5cc0ee73f5adb8d2c587161074b21e080 npm run build --workspace @ghostpay/web
```

Record: `web-lean.json`; output: `logs/web-lean.log`.

### pages-project-build

`NODE_OPTIONS=--max-old-space-size=1536`; working directory `/workspace/scratch/4fa14be12559/analysis-build/source`; resource-only Pages node wrapper: `True`.

```sh
GHOSTPAY_PAGES_ORIGIN=https://djshellshoxxx.github.io bash scripts/pages/build-pages.sh /workspace/scratch/4fa14be12559/analysis-build/artifacts/pages-project
```

Record: `pages-project-build.json`; output: `logs/pages-project-build.log`.

### pages-project-check

`NODE_OPTIONS=--max-old-space-size=384`; working directory `/workspace/scratch/4fa14be12559/analysis-build/source`; resource-only Pages node wrapper: `False`.

```sh
node /workspace/scratch/4fa14be12559/analysis-build/check-pages-artifact.mjs /workspace/scratch/4fa14be12559/analysis-build/source /workspace/scratch/4fa14be12559/analysis-build/artifacts/pages-project /GhostPay/ https://djshellshoxxx.github.io true 9bad95e5cc0ee73f5adb8d2c587161074b21e080
```

Record: `pages-project-check.json`; output: `logs/pages-project-check.log`.

### pages-dedicated-build

`NODE_OPTIONS=--max-old-space-size=1536`; working directory `/workspace/scratch/4fa14be12559/analysis-build/source`; resource-only Pages node wrapper: `True`.

```sh
GHOSTPAY_PAGES_ORIGIN=https://ghostpay.example bash scripts/pages/build-pages.sh /workspace/scratch/4fa14be12559/analysis-build/artifacts/pages-dedicated
```

Record: `pages-dedicated-build.json`; output: `logs/pages-dedicated-build.log`.

### pages-dedicated-check

`NODE_OPTIONS=--max-old-space-size=384`; working directory `/workspace/scratch/4fa14be12559/analysis-build/source`; resource-only Pages node wrapper: `False`.

```sh
node /workspace/scratch/4fa14be12559/analysis-build/check-pages-artifact.mjs /workspace/scratch/4fa14be12559/analysis-build/source /workspace/scratch/4fa14be12559/analysis-build/artifacts/pages-dedicated / https://ghostpay.example false 9bad95e5cc0ee73f5adb8d2c587161074b21e080
```

Record: `pages-dedicated-check.json`; output: `logs/pages-dedicated-check.log`.

### playwright-full

`NODE_OPTIONS=--max-old-space-size=1536`; working directory `/workspace/scratch/4fa14be12559/analysis-build/source`; resource-only Pages node wrapper: `False`.

```sh
GHOSTPAY_LOCAL_BUILD_PROFILE=full GP_COMMIT=9bad95e5cc0ee73f5adb8d2c587161074b21e080 TMPDIR=/workspace/scratch/4fa14be12559/analysis-build/tmp npm run test:e2e --workspace @ghostpay/web -- --max-failures=1 --workers=1 --output /workspace/scratch/4fa14be12559/analysis-build/artifacts/playwright-full-results
```

Record: `playwright-full.json`; output: `logs/playwright-full.log`.

### playwright-full-standard

`NODE_OPTIONS=--max-old-space-size=1536`; working directory `/workspace/scratch/4fa14be12559/analysis-build/source`; resource-only Pages node wrapper: `False`.

```sh
GHOSTPAY_LOCAL_BUILD_PROFILE=full TMPDIR=/workspace/scratch/4fa14be12559/analysis-build/tmp npm run test:e2e --workspace @ghostpay/web -- --max-failures=1 --workers=1 --output /workspace/scratch/4fa14be12559/analysis-build/artifacts/playwright-full-standard-results
```

Record: `playwright-full-standard.json`; output: `logs/playwright-full-standard.log`.

### playwright-full-system

`NODE_OPTIONS=--max-old-space-size=1536`; working directory `/workspace/scratch/4fa14be12559/analysis-build/source`; resource-only Pages node wrapper: `False`.

```sh
GHOSTPAY_LOCAL_BUILD_PROFILE=full GHOSTPAY_CHROMIUM=/usr/bin/chromium TMPDIR=/workspace/scratch/4fa14be12559/analysis-build/tmp npm run test:e2e --workspace @ghostpay/web -- --max-failures=1 --workers=1 --output /workspace/scratch/4fa14be12559/analysis-build/artifacts/playwright-full-system-results
```

Record: `playwright-full-system.json`; output: `logs/playwright-full-system.log`.

### playwright-lean-system

`NODE_OPTIONS=--max-old-space-size=1536`; working directory `/workspace/scratch/4fa14be12559/analysis-build/source`; resource-only Pages node wrapper: `False`.

```sh
GHOSTPAY_LOCAL_BUILD_PROFILE=lean GHOSTPAY_CHROMIUM=/usr/bin/chromium TMPDIR=/workspace/scratch/4fa14be12559/analysis-build/tmp npm run test:e2e --workspace @ghostpay/web -- --max-failures=1 --workers=1 --output /workspace/scratch/4fa14be12559/analysis-build/artifacts/playwright-lean-system-results
```

Record: `playwright-lean-system.json`; output: `logs/playwright-lean-system.log`.

### release-build

`NODE_OPTIONS=--max-old-space-size=1536`; working directory `/workspace/scratch/4fa14be12559/analysis-build/source`; resource-only Pages node wrapper: `False`.

```sh
VERSION=qualification-9bad95e5 OUT_DIR=/workspace/scratch/4fa14be12559/analysis-build/artifacts/release-development GP_SOLC_VERSION=0.8.28 npm run release:build
```

Record: `release-build.json`; output: `logs/release-build.log`.

### release-artifact-check

`NODE_OPTIONS=--max-old-space-size=384`; working directory `/workspace/scratch/4fa14be12559/analysis-build/source`; resource-only Pages node wrapper: `False`.

```sh
python /workspace/scratch/4fa14be12559/analysis-build/check-release-artifact.py /workspace/scratch/4fa14be12559/analysis-build/artifacts/release-development 9bad95e5cc0ee73f5adb8d2c587161074b21e080 0b79a483446f8c5778ff7f5bf178762e2c12c66a90fc13ca8f62158b1e01cce2 1795012894
```

Record: `release-artifact-check.json`; output: `logs/release-artifact-check.log`.

### release-repro

`NODE_OPTIONS=--max-old-space-size=1536`; working directory `/workspace/scratch/4fa14be12559/analysis-build/source`; resource-only Pages node wrapper: `False`.

```sh
VERSION=qualification-9bad95e5 GP_SOLC_VERSION=0.8.28 KEEP=1 TMPDIR=/workspace/scratch/4fa14be12559/analysis-build/tmp npm run release:repro -- --head
```

Record: `release-repro.json`; output: `logs/release-repro.log`.

### repro-a-artifact-check

`NODE_OPTIONS=--max-old-space-size=384`; working directory `/workspace/scratch/4fa14be12559/analysis-build/source`; resource-only Pages node wrapper: `False`.

```sh
python /workspace/scratch/4fa14be12559/analysis-build/check-release-artifact.py /workspace/scratch/4fa14be12559/analysis-build/tmp/ghostpay-repro.tvEPwc/a-first/ghostpay/release-out 9bad95e5cc0ee73f5adb8d2c587161074b21e080 0b79a483446f8c5778ff7f5bf178762e2c12c66a90fc13ca8f62158b1e01cce2 1795012894
```

Record: `repro-a-artifact-check.json`; output: `logs/repro-a-artifact-check.log`.

### repro-b-artifact-check

`NODE_OPTIONS=--max-old-space-size=384`; working directory `/workspace/scratch/4fa14be12559/analysis-build/source`; resource-only Pages node wrapper: `False`.

```sh
python /workspace/scratch/4fa14be12559/analysis-build/check-release-artifact.py /workspace/scratch/4fa14be12559/analysis-build/tmp/ghostpay-repro.tvEPwc/b-second/nested/GhostPay-repro/release-out 9bad95e5cc0ee73f5adb8d2c587161074b21e080 0b79a483446f8c5778ff7f5bf178762e2c12c66a90fc13ca8f62158b1e01cce2 1795012894
```

Record: `repro-b-artifact-check.json`; output: `logs/repro-b-artifact-check.log`.

