#!/usr/bin/env bash
# Builds the GitHub Pages site for the lean GhostPay EVM web app: static files only, no backend, no relayer required.
#
# Usage: bash scripts/pages/build-pages.sh /absolute/new/output/dir
#   <out>/site/      the directory to publish (upload-pages-artifact path)
#   <out>/evidence/  lean module report, SHA256SUMS of every published file, pages-evidence.json, build log
#
# Env (all optional):
#   GHOSTPAY_PAGES_DEPLOYMENTS_DIR  reviewed, release-signed manifests to bundle. Default: none, so every chain shows
#                                   "payments disabled" (DEMO profile). Only EVM testnet chain ids are accepted.
#   GHOSTPAY_RELEASE_PUBKEYS        release public keys that verify those manifests (required when any is present).
#   GP_COMMIT                       commit recorded in build-info.json (default: git HEAD; must match HEAD in CI).
#
# Fails closed: a mainnet manifest, a manifest without a verifying key, a non-lean module, an absolute or external
# resource reference, a source map, a secret-shaped string or a missing CSP stops the build before anything is written
# to <out>/site. Caller VITE_* variables are not inherited (no experimental policy view, no iframe embed mode).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
die() { printf 'build-pages: %s\n' "$*" >&2; exit 1; }
cd "$ROOT"  # the inline node modules below import ./scripts/pages/verify-pages-site.mjs relative to the cwd

out="${1:-}"
[ "$#" -eq 1 ] && [[ "$out" = /* ]] || die "usage: build-pages.sh /absolute/new/output/dir"
[ ! -e "$out" ] && [ ! -L "$out" ] || die "output path already exists: $out"
case "$out/" in "$ROOT/apps/web/"*) die "output must not be inside apps/web" ;; esac
command -v node >/dev/null || die "node not found"
[ "$(node -p 'Number(process.versions.node.split(".")[0])')" -ge 22 ] || die "node >= 22 required"
[ -d "$ROOT/node_modules" ] || die "run 'npm ci --ignore-scripts' and 'npm run build:libs' first"

head_sha="$(git -C "$ROOT" rev-parse HEAD)"
commit="${GP_COMMIT:-$head_sha}"
[[ "$commit" =~ ^[0-9a-f]{40}$ ]] || die "GP_COMMIT must be a full 40-hex commit id"
[ -z "${GITHUB_SHA:-}" ] || [ "$commit" = "$GITHUB_SHA" ] || die "GP_COMMIT does not match GITHUB_SHA"
epoch="$(git -C "$ROOT" log -1 --format=%ct "$head_sha")"

mkdir -p "$out"
work="$(mktemp -d "$out/.work.XXXXXX")"
trap 'rm -rf "$work"' EXIT

# Deployment manifests: an explicit reviewed directory, or an empty one (payments disabled on every chain).
deployments="$work/deployments"
mkdir "$deployments"
if [ -n "${GHOSTPAY_PAGES_DEPLOYMENTS_DIR:-}" ]; then
  src="$(cd "$GHOSTPAY_PAGES_DEPLOYMENTS_DIR" && pwd -P)" || die "GHOSTPAY_PAGES_DEPLOYMENTS_DIR is not a directory"
  for f in "$src"/*.json; do
    [ -e "$f" ] || continue
    [ ! -L "$f" ] || die "manifest is a symlink (refused): $f"
    cp "$f" "$deployments/"
  done
fi
node --input-type=module - "$deployments" <<'NODE'
import { readdirSync } from 'node:fs';
import { checkManifestDir } from './scripts/pages/verify-pages-site.mjs';
const { problems, chainIds } = checkManifestDir(readdirSync(process.argv[2]));
if (problems.length > 0) { for (const p of problems) console.error(` - ${p}`); process.exit(1); }
console.log(chainIds.length === 0 ? 'manifests: none (payments disabled on every chain)' : `manifests: testnet chains ${chainIds.join(', ')}`);
NODE
if ls "$deployments"/*.json >/dev/null 2>&1 && [ -z "${GHOSTPAY_RELEASE_PUBKEYS:-}" ]; then
  die "manifests supplied without GHOSTPAY_RELEASE_PUBKEYS"
fi

log="$work/build.log"
echo "== build apps/web (lean profile, relative base) at $commit"
# Clean environment: no inherited VITE_* switches, release keys only as supplied, reproducible timestamps.
if ! (
  cd "$ROOT/apps/web"
  env -i PATH="$PATH" HOME="$HOME" TMPDIR="${TMPDIR:-/tmp}" CI="${CI:-}" TZ=UTC LC_ALL=C \
    GHOSTPAY_LOCAL_BUILD_PROFILE=lean \
    GHOSTPAY_RELEASE_PUBKEYS="${GHOSTPAY_RELEASE_PUBKEYS:-}" \
    GHOSTPAY_DEPLOYMENTS_DIR="$deployments" \
    GP_COMMIT="$commit" SOURCE_DATE_EPOCH="$epoch" \
    bash -c 'npx tsc -p tsconfig.json --noEmit && npx vite build --outDir "$0" --emptyOutDir && node e2e/devnet/scan-dist.mjs "$0"' "$work/dist"
) >"$log" 2>&1; then
  tail -n 60 "$log" >&2
  die "web build failed"
fi

echo "== assemble Pages site"
site="$work/site"
evidence="$work/evidence"
mkdir "$evidence"
[ -f "$work/dist/ghostpay-lean-build.json" ] || die "lean module report missing"
mv "$work/dist/ghostpay-lean-build.json" "$evidence/ghostpay-lean-build.json"
# GitHub Pages ignores _headers; publishing it would imply header protection the mirror does not have.
rm -f "$work/dist/_headers"
# public/deployments/ holds only a README: manifests are compiled into the bundle and never fetched from the host.
rm -rf "$work/dist/deployments"
: >"$work/dist/.nojekyll"
mv "$work/dist" "$site"

# Label the mirror (ADR-0015 item 5): a static, script-free banner above the app root, worded for the payment state.
cp "$ROOT/scripts/pages/assets/pages-mirror.css" "$site/pages-mirror.css"
node --input-type=module - "$site/index.html" "$deployments" <<'NODE'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { checkManifestDir } from './scripts/pages/verify-pages-site.mjs';
const [indexPath, deployments] = process.argv.slice(2);
const NAMES = { 11155111: 'Ethereum Sepolia', 84532: 'Base Sepolia', 11155420: 'OP Sepolia', 421614: 'Arbitrum Sepolia', 80002: 'Polygon Amoy', 97: 'BNB Smart Chain Testnet', 43113: 'Avalanche Fuji' };
const { chainIds } = checkManifestDir(readdirSync(deployments));
const state = chainIds.length === 0
  ? '<strong>Demonstration build.</strong> Payments are disabled on every chain: no deployment manifest is bundled.'
  : `<strong>Testnet beta.</strong> Payments work only on ${chainIds.map((id) => `${NAMES[id] ?? 'chain'} (${String(id)})`).join(', ')}, with test assets. Never send real funds.`;
const banner = `<p class="gp-pages-mirror" role="note" id="gp-pages-mirror"><strong>GitHub Pages mirror.</strong> ${state} This host cannot send security headers (no clickjacking protection). Before trusting it, compare the served files with the published SHA256SUMS: <a href="https://github.com/djshellshoxxx/GhostPay/blob/main/docs/pages/README.md" rel="noopener noreferrer">how to verify</a>.</p>`;
let html = readFileSync(indexPath, 'utf8');
if (!/<body[^>]*>/.test(html) || !html.includes('</head>')) throw new Error('index.html has no <head>/<body> to label');
html = html.replace('</head>', '    <link rel="stylesheet" href="./pages-mirror.css" />\n  </head>').replace(/<body([^>]*)>/, (m) => `${m}\n    ${banner}`);
writeFileSync(indexPath, html);
NODE

echo "== verify site"
manifests_sha="$(node --input-type=module - "$deployments" <<'NODE'
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
// Same digest as apps/web/vite.config.ts buildInfo.manifestsSha256 (raw text keyed by chain id, insertion order).
const dir = process.argv[2];
const out = {};
for (const name of readdirSync(dir)) {
  const m = /^([1-9][0-9]{0,15})\.json$/.exec(name);
  if (m?.[1] !== undefined) out[m[1]] = readFileSync(join(dir, name), 'utf8');
}
process.stdout.write(createHash('sha256').update(JSON.stringify(out)).digest('hex'));
NODE
)"
node --input-type=module - "$site" "$evidence" "$commit" "$manifests_sha" "$ROOT" "$deployments" <<'NODE'
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkManifestDir, sha256sums, verifySite } from './scripts/pages/verify-pages-site.mjs';
const [site, evidence, commit, manifestsSha256, root, deployments] = process.argv.slice(2);
const report = JSON.parse(readFileSync(join(evidence, 'ghostpay-lean-build.json'), 'utf8'));
const { problems, files } = verifySite(site, report, { expectCommit: commit, expectManifestsSha256: manifestsSha256 });
if (problems.length > 0) {
  console.error('Pages site verification FAILED:');
  for (const p of problems) console.error(` - ${p}`);
  process.exit(1);
}
writeFileSync(join(evidence, 'SHA256SUMS'), sha256sums(site, files), { flag: 'wx' });
const { chainIds } = checkManifestDir(readdirSync(deployments));
const digest = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const record = {
  format: 'ghostpay-pages-site/1',
  commit,
  profile: 'lean',
  base: 'relative (./)',
  paymentsEnabledChainIds: chainIds,
  status: chainIds.length === 0 ? 'DEMO: payments disabled on every chain (no deployment manifest)' : 'TESTNET: payments enabled only on the listed testnet chains',
  manifestsSha256,
  lockfileSha256: digest(join(root, 'package-lock.json')),
  sha256sumsSha256: digest(join(evidence, 'SHA256SUMS')),
  files: files.length,
  limits: 'GitHub Pages cannot send HTTP headers: only the meta CSP applies (no frame-ancestors, nosniff, COOP, Permissions-Policy). Not an audited or production host.',
};
writeFileSync(join(evidence, 'pages-evidence.json'), JSON.stringify(record, null, 2) + '\n', { flag: 'wx' });
console.log(`Pages site verified: ${String(files.length)} files; ${record.status}`);
NODE
cp "$log" "$evidence/build.log"
mv "$site" "$out/site"
mv "$evidence" "$out/evidence"
echo "build-pages: OK -> $out/site (evidence in $out/evidence)"
