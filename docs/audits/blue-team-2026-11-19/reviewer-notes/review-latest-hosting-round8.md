> Reviewer checkpoint. Earlier pending lists describe the time of that handoff. Final completion and finding dispositions are authoritative in [coverage.md](../coverage.md) and [findings.md](../findings.md). Earlier BROWSER-01 wording about absent Pay route coverage is superseded by the correction in the canonical register.

# Latest hosting source review — round 8

## Result

All 20 assigned versions were fully read at the supplied final cut. **No new confirmed production finding** was established in this lane. One surviving generated-guide wording observation is recorded separately below. The seven baseline production findings remain unchanged.

## Scope and limits

- Final cut: `2026-11-20T06:51:27Z`.
- Main: `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`.
- Tor feature: `e60c69f32dbbd9edf7e81ed8866144d665e3de9a`.
- Primary rows: 0, 1, 2, and 9 through 25; root owns payment URI rows 3–7 and Pages row 8.
- Immutable Git sources only. No repository code, tests, builds, installs, servers, Docker/Tor commands, probes, network operations or proof of concept were executed. No source or Git state was changed.
- The baseline findings register was read only as parent-authorized audit metadata.

## Coverage

| Category | Versions | Lines |
|---|---:|---:|
| Assigned production | 11 | 1822 |
| Assigned test/support | 9 | 1617 |
| Supplemental sources/configuration/docs | 36 | 7967 |
| Total | 56 | 11406 |

The total covers 52 distinct paths. Supplemental coverage is 33 complete-content reads plus 3 main counterparts reviewed using the fully read feature source and every main-to-feature diff hunk. Two primary truncations and one supplemental truncation were repaired with explicit rereads. No assigned or visited-file ranges remain pending.

## Verified archive and export path

The new Tor recipe requires a primitive lowercase expected archive SHA-256, checks for its matching _headers policy, and rechecks the hash on the private copy used for generation. ZIP entry/path checks and extracted-tree verification precede export. Static exports omit hidden/never-served paths and use a fresh output tree.

- [deploy/tor-static/prepare.mjs:75–99](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/deploy/tor-static/prepare.mjs#L75-L99) at `e60c69f32dbbd9edf7e81ed8866144d665e3de9a`.
- [deploy/tor-static/prepare.mjs:113–146](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/deploy/tor-static/prepare.mjs#L113-L146) at `e60c69f32dbbd9edf7e81ed8866144d665e3de9a`.
- [tools/portable-hosting-kit/src/cli.mjs:493–519](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/tools/portable-hosting-kit/src/cli.mjs#L493-L519) at `e60c69f32dbbd9edf7e81ed8866144d665e3de9a`.
- [tools/portable-hosting-kit/src/core/verify.mjs:376–395](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/tools/portable-hosting-kit/src/core/verify.mjs#L376-L395) at `e60c69f32dbbd9edf7e81ed8866144d665e3de9a`.
- [tools/portable-hosting-kit/src/core/zip.mjs:305–383](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/tools/portable-hosting-kit/src/core/zip.mjs#L305-L383) at `e60c69f32dbbd9edf7e81ed8866144d665e3de9a`.
- [tools/portable-hosting-kit/src/core/zip.mjs:394–468](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/tools/portable-hosting-kit/src/core/zip.mjs#L394-L468) at `e60c69f32dbbd9edf7e81ed8866144d665e3de9a`.
- [tools/portable-hosting-kit/src/profiles/static-export.mjs:97–148](https://github.com/djshellshoxxx/GhostPay/blob/773a94be1c8328d6fa1720ae48f1b6a2d903f0c5/tools/portable-hosting-kit/src/profiles/static-export.mjs#L97-L148) at `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`.

## Headers and canonical onion configuration

The feature centralizes checksum-valid, canonical HTTP onion-origin validation, rejects unsupported ports/normalization, and aligns advertised origins with virtual port 80. Export/preview/nginx all apply the shared header policy; generated transport headers are clearnet-only. The application intentionally retains https:/wss: connect sources for explicit application endpoints.

- [tools/portable-hosting-kit/src/config/host-config.mjs:109–120](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/tools/portable-hosting-kit/src/config/host-config.mjs#L109-L120) at `e60c69f32dbbd9edf7e81ed8866144d665e3de9a`.
- [tools/portable-hosting-kit/src/adapters/tor.mjs:503–524](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/tools/portable-hosting-kit/src/adapters/tor.mjs#L503-L524) at `e60c69f32dbbd9edf7e81ed8866144d665e3de9a`.
- [tools/portable-hosting-kit/src/serve/headers.mjs:315–378](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/tools/portable-hosting-kit/src/serve/headers.mjs#L315-L378) at `e60c69f32dbbd9edf7e81ed8866144d665e3de9a`.
- [tools/portable-hosting-kit/src/serve/headers.mjs:394–438](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/tools/portable-hosting-kit/src/serve/headers.mjs#L394-L438) at `e60c69f32dbbd9edf7e81ed8866144d665e3de9a`.
- [tools/portable-hosting-kit/src/profiles/nginx.mjs:213–218](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/tools/portable-hosting-kit/src/profiles/nginx.mjs#L213-L218) at `e60c69f32dbbd9edf7e81ed8866144d665e3de9a`.
- [tools/portable-hosting-kit/src/profiles/nginx.mjs:321–360](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/tools/portable-hosting-kit/src/profiles/nginx.mjs#L321-L360) at `e60c69f32dbbd9edf7e81ed8866144d665e3de9a`.
- [apps/web/public/_headers:1–10](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/apps/web/public/_headers#L1-L10) at `e60c69f32dbbd9edf7e81ed8866144d665e3de9a`.

## Container topology and identity handling

Using all three documented Compose files removes published ports and the web publishing network; the web service remains on site_internal while Tor receives separate egress. The Tor build context allowlists only build/startup inputs. The identity volume is mounted only by Tor, with non-root/read-only/capability restrictions and startup ownership/mode checks.

- [deploy/tor-static/prepare.mjs:16–31](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/deploy/tor-static/prepare.mjs#L16-L31) at `e60c69f32dbbd9edf7e81ed8866144d665e3de9a`.
- [tools/portable-hosting-kit/src/profiles/container.mjs:71–132](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/tools/portable-hosting-kit/src/profiles/container.mjs#L71-L132) at `e60c69f32dbbd9edf7e81ed8866144d665e3de9a`.
- [tools/portable-hosting-kit/src/adapters/tor.mjs:396–430](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/tools/portable-hosting-kit/src/adapters/tor.mjs#L396-L430) at `e60c69f32dbbd9edf7e81ed8866144d665e3de9a`.
- [deploy/tor-static/.dockerignore:1–6](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/deploy/tor-static/.dockerignore#L1-L6) at `e60c69f32dbbd9edf7e81ed8866144d665e3de9a`.
- [deploy/tor-static/Dockerfile:18–32](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/deploy/tor-static/Dockerfile#L18-L32) at `e60c69f32dbbd9edf7e81ed8866144d665e3de9a`.
- [deploy/tor-static/tor-start.sh:10–25](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/deploy/tor-static/tor-start.sh#L10-L25) at `e60c69f32dbbd9edf7e81ed8866144d665e3de9a`.

## Workflow secret boundary and build handoff

The workflow is validation-only, uses a pull_request trigger rather than a privileged pull_request_target flow, declares contents:read, disables persisted checkout credentials, and supplies no deployment/signing secret to the reviewed steps. It builds the lean static workspace before packaging and tests the resulting archive. The locally computed CI checksum binds test bytes but does not establish publisher authentication.

- [.github/workflows/tor-static.yml:1–17](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/.github/workflows/tor-static.yml#L1-L17) at `e60c69f32dbbd9edf7e81ed8866144d665e3de9a`.
- [.github/workflows/tor-static.yml:35–77](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/.github/workflows/tor-static.yml#L35-L77) at `e60c69f32dbbd9edf7e81ed8866144d665e3de9a`.
- [.github/workflows/tor-static.yml:78–110](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/.github/workflows/tor-static.yml#L78-L110) at `e60c69f32dbbd9edf7e81ed8866144d665e3de9a`.
- [scripts/build-workspaces.mjs:26–50](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/scripts/build-workspaces.mjs#L26-L50) at `e60c69f32dbbd9edf7e81ed8866144d665e3de9a`.
- [apps/web/vite.config.ts:61–101](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/apps/web/vite.config.ts#L61-L101) at `e60c69f32dbbd9edf7e81ed8866144d665e3de9a`.
- [apps/web/scripts/localBuildProfile.mjs:240–270](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/apps/web/scripts/localBuildProfile.mjs#L240-L270) at `e60c69f32dbbd9edf7e81ed8866144d665e3de9a`.

## Timestamp change

The shared static-export change preserves source mtimeMs as string seconds, including pre-epoch values. The assigned regression sources cover fractional-second, epoch and pre-epoch cases; no test execution or runtime result is claimed.

- [tools/portable-hosting-kit/src/profiles/static-export.mjs:125–139](https://github.com/djshellshoxxx/GhostPay/blob/773a94be1c8328d6fa1720ae48f1b6a2d903f0c5/tools/portable-hosting-kit/src/profiles/static-export.mjs#L125-L139) at `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`.
- [tools/portable-hosting-kit/test/profiles/static-export.test.mjs:70–95](https://github.com/djshellshoxxx/GhostPay/blob/773a94be1c8328d6fa1720ae48f1b6a2d903f0c5/tools/portable-hosting-kit/test/profiles/static-export.test.mjs#L70-L95) at `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`.
- [tools/portable-hosting-kit/test/profiles/differential.test.mjs:41–43](https://github.com/djshellshoxxx/GhostPay/blob/773a94be1c8328d6fa1720ae48f1b6a2d903f0c5/tools/portable-hosting-kit/test/profiles/differential.test.mjs#L41-L43) at `773a94be1c8328d6fa1720ae48f1b6a2d903f0c5`.

## H8-DOC-01 — archive guide wording still suggests subpath isolation

**Classification:** unranked documentation observation; no new production finding. **Confidence:** high from source. **Branch status:** present in all five supplied refs; pre-existing relative to the latest delta.

operatorGuide emits an OPERATOR.md statement that includes subpath alongside clearnet/onion/I2P in a sentence asserting separate browser storage, sessions and wallet permissions. A subpath alone does not create a distinct origin. The actual CLI and Tor recipe correctly retain dedicated-origin checks and warnings, so this is a surviving documentation inconsistency, not a demonstrated isolation bypass. OPERATOR.md is archive metadata, not part of the exported website.

May mislead an operator reading the archive guide in isolation; no changed browser origin policy, key disclosure, authorization bypass or tested runtime impact is established.

**Remediation:** Describe storage and permission separation in terms of distinct origins (scheme, hostname and port). State explicitly that paths on the same origin share origin storage, and align OPERATOR.md with the current CLI and Tor runbook.

- [tools/portable-hosting-kit/src/package-docs.mjs:46–55](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/tools/portable-hosting-kit/src/package-docs.mjs#L46-L55) at `e60c69f32dbbd9edf7e81ed8866144d665e3de9a`.
- [tools/portable-hosting-kit/src/cli.mjs:641–646](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/tools/portable-hosting-kit/src/cli.mjs#L641-L646) at `e60c69f32dbbd9edf7e81ed8866144d665e3de9a`.
- [tools/portable-hosting-kit/src/cli.mjs:757–777](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/tools/portable-hosting-kit/src/cli.mjs#L757-L777) at `e60c69f32dbbd9edf7e81ed8866144d665e3de9a`.
- [deploy/tor-static/prepare.mjs:82–87](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/deploy/tor-static/prepare.mjs#L82-L87) at `e60c69f32dbbd9edf7e81ed8866144d665e3de9a`.
- [deploy/tor-static/README.md:59–61](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/deploy/tor-static/README.md#L59-L61) at `e60c69f32dbbd9edf7e81ed8866144d665e3de9a`.

## Qualification limits

### Real Tor/runtime acceptance

No repository test, build, install, server, Docker command, Tor bootstrap, network probe or browser acceptance was executed. The browser-acceptance script explicitly uses ordinary loopback Chromium, blocks external HTTP(S)/WebSocket traffic, and does not establish Tor Browser or external-wallet routing.

- [scripts/tor/browser-acceptance.mjs:1–34](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/scripts/tor/browser-acceptance.mjs#L1-L34).
- [scripts/tor/browser-acceptance.mjs:85–107](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/scripts/tor/browser-acceptance.mjs#L85-L107).
- [deploy/tor-static/README.md:126–137](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/deploy/tor-static/README.md#L126-L137).

### Upstream pins and image reproducibility

The source enforces the configured Tor archive hash before extraction and the configured runtime floor/PoW/GPL checks. This review did not independently retrieve or verify upstream source/checksum/signature material or validate container image digests. The runbook itself records that upstream signature verification is still pending and that distro packages vary at build time.

- [deploy/tor-static/Dockerfile:3–16](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/deploy/tor-static/Dockerfile#L3-L16).
- [deploy/tor-static/runtime-check.sh:4–20](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/deploy/tor-static/runtime-check.sh#L4-L20).
- [deploy/tor-static/README.md:139–166](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/deploy/tor-static/README.md#L139-L166).

### Operator topology and identity preservation

The port/network isolation conclusion depends on applying the final compose.onion.yaml override in the documented order. Routine updates must preserve the Compose project identity volume. These requirements are explicit in the generated guide and recipe documentation; the audit did not activate any deployment.

- [deploy/tor-static/prepare.mjs:40–61](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/deploy/tor-static/prepare.mjs#L40-L61).
- [deploy/tor-static/prepare.mjs:133–143](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/deploy/tor-static/prepare.mjs#L133-L143).
- [deploy/tor-static/README.md:118–124](https://github.com/djshellshoxxx/GhostPay/blob/e60c69f32dbbd9edf7e81ed8866144d665e3de9a/deploy/tor-static/README.md#L118-L124).

## Exact primary coverage

Every row below was read in full, lines 1 through the listed line count.

| Row | Path | Blob | Lines |
|---:|---|---|---:|
| 0 | `tools/portable-hosting-kit/src/profiles/static-export.mjs` | `42009b42e5b03d4bb88fd2b51925a064abc445b3` | 149 |
| 1 | `tools/portable-hosting-kit/test/profiles/differential.test.mjs` | `04130f97dd71e3a48fb34ed67d920b68d9ccee9f` | 140 |
| 2 | `tools/portable-hosting-kit/test/profiles/static-export.test.mjs` | `2945afd04781da84e71b89b51d4f1fe02dd1ab8a` | 150 |
| 9 | `.github/workflows/tor-static.yml` | `59e0675115a2203546a917d020c27e4d95a2913e` | 110 |
| 10 | `deploy/tor-static/.dockerignore` | `2465bc7364814b57d1b8f484e3c67148615edc08` | 6 |
| 11 | `deploy/tor-static/Dockerfile` | `8d593b9a0e419661c59a6d85d8b57ac6f498b29c` | 32 |
| 12 | `deploy/tor-static/host.example.json` | `bff0f3e674f504e966cfeb7523d97048f356170c` | 9 |
| 13 | `deploy/tor-static/prepare.mjs` | `1c0776edde8faff31e7fc247204915509f48e141` | 177 |
| 14 | `deploy/tor-static/runtime-check.sh` | `8dddbffac95e7aeb2cca04260fa0a02cd7565dc3` | 20 |
| 15 | `deploy/tor-static/tor-start.sh` | `811be5b8949748d34b39edd0ffa05eb82711e809` | 25 |
| 16 | `scripts/tor/browser-acceptance.mjs` | `1f57b2d5a102f398cfc111e349dfc2684d498518` | 111 |
| 17 | `scripts/tor/hosting-config.test.mjs` | `4ac175f883ce1760c5cf308fc385e1b8218fa81d` | 176 |
| 18 | `tools/portable-hosting-kit/src/adapters/tor.mjs` | `a01d11a4d0409438cec689cde3998d0ce1c8c777` | 575 |
| 19 | `tools/portable-hosting-kit/src/config/host-config.mjs` | `ba5f2c311c77fabc1d85d66dc05f94388c7f616b` | 264 |
| 20 | `tools/portable-hosting-kit/src/serve/headers.mjs` | `d0bce8f92792580ea517d72b40a2653ea70111eb` | 455 |
| 21 | `tools/portable-hosting-kit/test/adapters/tor.test.mjs` | `62174c98d88122f5101ee8d9728b6747685d8a4f` | 196 |
| 22 | `tools/portable-hosting-kit/test/config/host-config.test.mjs` | `d702839dbaf95f62b6d86186b351817eae07fdff` | 132 |
| 23 | `tools/portable-hosting-kit/test/profiles/differential.test.mjs` | `5721e767c46307ed6776048163ba149f2cc5987b` | 140 |
| 24 | `tools/portable-hosting-kit/test/profiles/nginx.test.mjs` | `963eec40dfae88830f8594cc923026b671d9c0fc` | 224 |
| 25 | `tools/portable-hosting-kit/test/serve/headers.test.mjs` | `a2f499b8820e299d817520943724941e5b4cabc5` | 348 |

## Exact supplemental coverage

All 33 direct reads use the Tor feature commit; identical-blob applicability to the other supplied refs is enumerated in JSON. The final three rows use main and the complete-counterpart/diff method.

| Path | Blob | Lines | Method |
|---|---|---:|---|
| `tools/portable-hosting-kit/src/cli.mjs` | `5b4445881537af302d3d94e6cd0c4e41aa7adaa1` | 1–946 | Full content |
| `tools/portable-hosting-kit/src/serve/routing.mjs` | `b02f9ef440c4404d0ece1480531f54efef08fe30` | 1–230 | Full content |
| `tools/portable-hosting-kit/src/policy.mjs` | `4f13b17785cb53213f7dc6abce3902b34ca1fa5e` | 1–232 | Full content |
| `tools/portable-hosting-kit/src/profiles/container.mjs` | `4ab2205f98233904ff02233a92987cd6daec6b8f` | 1–169 | Full content |
| `tools/portable-hosting-kit/src/profiles/nginx.mjs` | `c932bdfb392f83fec6ff10517db40235ddbf3a4a` | 1–428 | Full content |
| `tools/portable-hosting-kit/src/types.mjs` | `cc9c73bd51da2342eb14a71d592fcf416c577dfe` | 1–121 | Full content |
| `tools/portable-hosting-kit/src/errors.mjs` | `80d71210dd00b6f03a03a41943656fc41091741c` | 1–55 | Full content |
| `tools/portable-hosting-kit/src/version.mjs` | `29920000142c3aaa39de04b185e447b0255f78f1` | 1–7 | Full content |
| `tools/portable-hosting-kit/src/serve/preview.mjs` | `07d074f2a42993380714752ca01d5d6e77e8701b` | 1–450 | Full content |
| `tools/portable-hosting-kit/src/core/verify.mjs` | `c006df5aacaf9669d5f7cf400cfa24c8feb385eb` | 1–396 | Full content |
| `tools/portable-hosting-kit/src/core/inventory.mjs` | `28b1c41bd4ea5494c772706839073087d31d88d2` | 1–283 | Full content |
| `tools/portable-hosting-kit/src/core/atomic.mjs` | `d6099cdbaffc8767c13de1532d399b0f1d4eec46` | 1–328 | Full content |
| `tools/portable-hosting-kit/src/core/hash.mjs` | `3d9613977e76c984329b7e3068291b8a65ee85f0` | 1–144 | Full content |
| `tools/portable-hosting-kit/src/core/package.mjs` | `cd7207c96ed47f9c3b1effae9997eedbecab2d6b` | 1–182 | Full content |
| `tools/portable-hosting-kit/src/core/validate.mjs` | `9a9d6f655fba74d08177af0e9ae0baeed15edcc3` | 1–189 | Full content |
| `tools/portable-hosting-kit/src/core/manifest.mjs` | `463341978463b1f4f4b4405d8ead98123dcb6143` | 1–378 | Full content |
| `tools/portable-hosting-kit/src/overlay/mirror.mjs` | `dcb33bd5b7238b12e50a71268a996f3522f8638d` | 1–47 | Full content |
| `tools/portable-hosting-kit/src/core/paths.mjs` | `8077026c02dd422a34fd4c38aa577179786bb4a6` | 1–137 | Full content |
| `tools/portable-hosting-kit/src/core/zip.mjs` | `fde2f1c7c7a45a20c5820718239e564bc467de32` | 1–469 | Full content |
| `tools/portable-hosting-kit/src/core/canonical-json.mjs` | `c3ca8a92e1178ae50befb81583276f2f042e48cf` | 1–73 | Full content |
| `tools/portable-hosting-kit/src/privacy/external-refs.mjs` | `7a0616b95dd7e3510895e427b298b532cfc04fa8` | 1–259 | Full content |
| `tools/portable-hosting-kit/src/package-docs.mjs` | `edcbcdb2aa709a8cc3b12ddcde0925dc8e6320a8` | 1–72 | Full content |
| `scripts/build-workspaces.mjs` | `08ed929620c90421f040cc0fd00adf0f30c6d9fb` | 1–51 | Full content |
| `package.json` | `a4b3282474dbf3b55e1945c201d4a862aeb13670` | 1–46 | Full content |
| `apps/web/package.json` | `087747cbd56412fe67551b10d874805d01e7f2a4` | 1–56 | Full content |
| `apps/web/vite.config.ts` | `7f11e3b91b733ef2e53385b5be022970d60d52f9` | 1–128 | Full content |
| `apps/web/public/_headers` | `604be638edef9d055c8c2b4f52d5988e2bbd5ee4` | 1–36 | Full content |
| `deploy/tor-static/README.md` | `0bbb974c52f2753623dee8eaa712babdb6607f8d` | 1–166 | Full content |
| `apps/web/scripts/localBuildProfile.mjs` | `65c1b1690763f34c64262643e94cdd672f0f057b` | 1–274 | Full content |
| `apps/web/scripts/scan-bundle.mjs` | `2b1b579c18c66c552c407d20d96bda6e28bed1e4` | 1–238 | Full content |
| `apps/web/scripts/validate-deployments.mjs` | `d64a04674ef09a8adff4ee3469694c893edb3e48` | 1–53 | Full content |
| `tools/portable-hosting-kit/bin/ghostpay-host.mjs` | `b2f6082dcf9788efad1d882ae797639ed6341709` | 1–14 | Full content |
| `tools/portable-hosting-kit/package.json` | `b454b1bdd1a93499d0a2e45b8cc782fb1ad85916` | 1–21 | Full content |
| `tools/portable-hosting-kit/src/adapters/tor.mjs` | `0105435acbeb2a19bbf9b00564a0848846e2a60a` | 1–569 | Full feature counterpart + entire diff |
| `tools/portable-hosting-kit/src/config/host-config.mjs` | `267551801dfebc4f71622a4d7aa8d9019196870a` | 1–261 | Full feature counterpart + entire diff |
| `tools/portable-hosting-kit/src/serve/headers.mjs` | `ae6571b9784a49dce019cf9776cd7f2d4b47cbc7` | 1–459 | Full feature counterpart + entire diff |

## Explicit scope exclusions and unexpanded references

- `tools/portable-hosting-kit/src/adapters/i2p.mjs`: Optional I2P generator is imported by the shared CLI but not selected by prepareStaticTor; no I2P end-to-end review claimed. No lines read; remaining 1–226 at `03bd1640f26322927519c7ebb7033e16f1549c37`.
- `tools/portable-hosting-kit/src/wizard.mjs`: Interactive configuration command is not invoked by the reviewed Tor preparation/build path. No lines read; remaining 1–123 at `a6630c1762e213d650d9ab8b611d410a8912911d`.
- `tools/portable-hosting-kit/src/demo/demo-site.mjs`: Demo command and test fixture helper; assigned tests were read without executing fixture generation. No lines read; remaining 1–161 at `cfa70aa4b2f47f84ae4b511a1e9346364afa86b9`.
- `tools/portable-hosting-kit/test/serve/helpers.mjs`: Test execution helper; no executed-test or complete test-harness behavior claim. No lines read; remaining 1–242 at `0ea649190c0402c79caa55681553a680fcc626cb`.
- `tools/portable-hosting-kit/test/profiles/compare.mjs`: Differential request helper; assigned differential files were read, no server comparisons executed. No lines read; remaining 1–123 at `a9b869f584d95392bb2981c69cd1710aae590377`.
- `tools/portable-hosting-kit/test/adapters/fixtures.mjs`: Test fixture helper; no executed-test claim. No lines read; remaining 1–75 at `18ca28d400e80731554982da12df1c539795373b`.
- `packages/chain-adapters/**`: Application deployment-signature implementation remains outside this narrow hosting delta; the build script call boundary was read, not the application/business implementation.
- `package-lock.json and third-party runtime/build packages`: No dependency freshness, upstream authenticity, package-install or third-party-code audit claimed.

## Handoff

All 20 primary versions and 36 supplemental versions reviewed. No pending assigned or visited-file ranges. One stale generated-guide wording observation is separate from the seven baseline findings. Unexpanded references listed explicitly above are excluded from the narrow Tor call-path closure. Source-only conclusions do not establish successful build, container startup, Tor availability or browser/payment acceptance.
