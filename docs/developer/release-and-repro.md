# Release, reproducible build and deployment

Sources: `scripts/{release-build,repro-check,verify-release,lib-common}.sh`, `scripts/{gen-release-manifest,normalize-sbom}.mjs`,
`.github/workflows/{ci,nightly,release}.yml`, `docs/operators/{release-and-verify,deployment-runbook}.md`,
`docs/DEPLOYMENT_MANIFEST.md`, `deployments/README.md`. Operator-facing procedures (including user-side verification) live in
the operators docs; this page explains the machinery for developers. Evidence level: the workflows have **never run on GitHub**
(actionlint/shellcheck and local runs only); reproducibility was checked on one Linux host.

## 1. Workflows

| Workflow | Trigger | Jobs |
|---|---|---|
| `ci.yml` | PR, push to `main`, manual | `typescript` (Foundry 1.8.5, `npm ci --ignore-scripts`, `build:libs`, contract artifacts for anvil, typecheck, lint, `npm test` with `REQUIRE_ANVIL=1`, web build, `npm audit --omit=dev --audit-level=high`); `e2e` (Playwright Chromium); `contracts` (`forge fmt --check`, `build --sizes`, `test`, `snapshot --check`, coverage + lcov artifact, NatSpec, Slither); `secrets-and-egress` (`scan-secrets.sh`, `check-actions-pinned.sh`) |
| `nightly.yml` | 03:17 UTC, manual | `forge test --fuzz-runs 100000`, Slither, dependency audit (+ `npm audit signatures`), `repro-check.sh --head` |
| `release.yml` | tag `v*` | `verify` -> `build` (environment `release`, manual approval) -> `draft-release` (environment `release`); ends at a **draft** GitHub release; the `publish-static` job is a disabled stub (`if: false`) |

All actions are pinned to full SHAs; permissions are least-privilege per job; no job receives deployment, RPC, pinning or signing
secrets. CI rewrites the sandbox `solc` line of `foundry.toml` with `sed` before any `forge` command.

## 2. The deterministic web build

```bash
VERSION=v0.0.0-test bash scripts/release-build.sh          # needs network for `npm ci` unless GP_SKIP_INSTALL=1
```

Environment: `VERSION` (default `git describe --tags --always`), `SOURCE_DATE_EPOCH` (default: HEAD commit time),
`GP_COMMIT` (needed when the tree has no `.git`), `OUT_DIR` (default `release-out/`), `GP_SKIP_INSTALL=1`.

Steps: `npm ci --ignore-scripts` -> delete every `packages/*/dist` and `apps/web/dist` (a pre-existing `dist` is never trusted)
-> `npm run build:libs` -> `npm run build -w @ghostpay/web` (type-check, Vite build, bundle scan) -> deterministic tar of
`apps/web/dist` renamed to `ghostpay-web/` -> CycloneDX SBOM -> `release-manifest.json` -> `SHA256SUMS`.

What makes it reproducible:

- `TZ=UTC`, `LC_ALL=C`, `SOURCE_DATE_EPOCH` = the (tag) commit time.
- `tar --sort=name --owner=0 --group=0 --numeric-owner --mode='u=rwX,go=rX' --mtime=@$SOURCE_DATE_EPOCH --format=posix` with
  `atime`/`ctime` pax headers deleted; `gzip -n -9` (no name, no timestamp).
- The SBOM comes from `npm sbom --sbom-format cyclonedx --omit dev --sbom-type application`; its random `serialNumber` and
  timestamp are replaced by values derived from the lockfile digest and the epoch (`normalize-sbom.mjs`).
- Vite config: `sourcemap: false`, `assetsInlineLimit: 0`, `cssCodeSplit: false`, `modulePreload.polyfill: false`, base `./`.
- Exact dependency pins and `npm ci` from the committed lockfile.

Outputs: `ghostpay-web-<VERSION>.tar.gz`, `sbom.cdx.json`, `release-manifest.json` (commit, tag, epoch, tool versions,
lockfile hash, artifact hashes, deployment manifests found in `deployments/`, CI run URL, and explicit `not-recorded` entries for
IPFS CID, onion hash, source verification, audit summaries), and `SHA256SUMS` over those three. The release manifest contains
tool versions and so is **not** part of the reproducibility comparison.

## 3. Proving reproducibility

```bash
bash scripts/repro-check.sh --head        # clone HEAD into two different directories and build both
bash scripts/repro-check.sh --worktree    # copy tracked + untracked-not-ignored files (to test uncommitted changes)
KEEP=1 VERSION=repro bash scripts/repro-check.sh --head    # keep temp dirs for inspection
```

It builds in `.../a-first/ghostpay` and `.../b-second/nested/ghostpay` with the same `SOURCE_DATE_EPOCH` and compares the
tarball and SBOM hashes (`SAME`/`DIFF`), prints a `diff -rq` of the extracted trees on mismatch, and exits non-zero. Claim
scope: same Node/npm major and a Linux GNU toolchain only; not tested across operating systems.

## 4. Verifying a download (developer view)

```bash
bash scripts/verify-release.sh ghostpay-web-v1.2.3.tar.gz SHA256SUMS <40-hex-commit> release-manifest.json
gh attestation verify ghostpay-web-v1.2.3.tar.gz --repo <owner>/<repo>
git verify-tag v1.2.3 && git rev-parse v1.2.3^{commit}
```

`verify-release.sh` checks the tarball hash against `SHA256SUMS`, every other listed file next to it, the manifest commit and
tarball hash, and archive sanity (single top-level directory, no absolute/parent paths, no source maps, `index.html` present). It
needs only bash, tar and sha256sum (node or python3 to read the manifest). It proves consistency, **not authenticity**:
authenticity comes from the signed tag (key fingerprint published out of band; none exists yet), the attestation and an
independent rebuild. The in-app release-hash widget is informational only.

## 5. Cutting a release (maintainers)

One-time repository settings: environment `release` with required reviewers; protected `v*` tag ruleset; your signing key
registered and its fingerprint published through an independent channel.

1. `main` is green (CI and the latest nightly), open audit findings acknowledged in the notes.
2. `git tag -s v1.2.3 -m "GhostPay v1.2.3" && git push origin v1.2.3` (annotated and signed; `release.yml` rejects lightweight
   or unsigned tags; it can only confirm a signature block is *present*).
3. Approve the `release` environment for `build`, then for `draft-release`.
4. Download the draft's files on a separate machine, run `verify-release.sh`, `gh attestation verify`, optionally rebuild.
5. Publish the draft by hand. Hosting remains off (ADR-0015); publishing static copies needs a new ADR.

Packages are `0.1.0`, `private: true` and not published to npm; there is no version-bump automation. Dependency updates arrive
as grouped weekly Dependabot PRs (actions: one group; npm: minor/patch group and major group), each needing review of the
lockfile diff, `THIRD_PARTY.md` and a green CI. Refresh the register with `node docs/tools/third-party-table.mjs --write`
(`--check` fails if stale, `--verify` compares the lockfile with `node_modules`).

## 6. Deploying contracts

Nothing has been deployed. The procedure (full text: `docs/operators/deployment-runbook.md`; mainnets are blocked until an
independent audit and the chain-enablement checklist):

1. Clean checkout of the exact commit to be recorded; `forge build`, `forge test`, `forge fmt --check` with a local
   `solc_version = "0.8.28"` edit (do not commit it).
2. `FEE_RECIPIENT=<hardware wallet or multisig> scripts/pre-deploy-check.sh router` (prints the effective configuration,
   never broadcasts), then
   `FEE_RECIPIENT=<...> forge script script/Deploy.s.sol --rpc-url "$RPC" --broadcast --account <keystore>` (or `--ledger`).
   Policy contracts: `pre-deploy-check.sh policy` then `DeployPolicy.s.sol`; then `DeployPolicyRouter.s.sol` with
   `POLICY_FACTORY`. Sign with a keystore or hardware wallet, never a raw key on the command line.
3. Verify sources on the explorer; read back with a *different* RPC:
   `cast call <router> "FEE_RECIPIENT()(address)"`, `"FEE_BPS()(uint256)"`, `"ANNOUNCER()(address)"`, and
   `cast codehash <addr>` for every contract.
4. Write `apps/web/deployments/<chainId>.json` (`bytecodeHashes` = `cast codehash` of the **runtime** code on chain, which embeds the
   immutables, so the same source gives different hashes per deployment; `deployTx` hashes; `solcVersion` with commit;
   40-hex git `commit`; RFC 3339 `date`; optional flat `policy*` fields). Validate twice: the JSON schema
   (`npx ajv-cli validate -s deployments/schema.json -d deployments/<chainId>.json`) **and** the project validator:

   ```bash
   npm run build:libs
   GHOSTPAY_RELEASE_PUBKEYS=<compressed-public-key-hex> npm run validate:deployments -w @ghostpay/web
   ```

   The validator is stricter than the schema: distinct role addresses, `feeBps == 25`, real dates, checksummed addresses,
   and a valid structured signature. The web build compiles the raw manifest into its hashed bundle; default runtime loading
   does not fetch `/deployments/*.json`. Sign `manifestDigest(validatedManifest)` with the approved offline secp256k1 release
   key and encode compact low-s `r || s`. Relayer and ops monitor enforce the same structured digest and key allowlist;
   unsigned and legacy raw-text-signed manifests are refused by all production consumers.
5. Do not enable a chain (`enabled: true` in `chains.ts`, relayer `ALLOW_MAINNET`) before the chain checklist and signer compatibility review are complete.
6. A replaced router follows the migration procedure in the runbook (new router, new manifest, new signed release; old clients
   keep the old router; the router holds nothing, stray funds are unrecoverable).

Open gaps (not faked): deployment smoke script and testnet job, maintained offline manifest-signing tool/ceremony, fork tests, Mythril and mutation testing,
a published signing-key fingerprint, relayer Docker image build/attestation, CODEOWNERS and CodeQL.
