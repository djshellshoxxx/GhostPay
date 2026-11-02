#!/usr/bin/env bash
# Unsigned CI candidate only. Usage: bash scripts/qualify-lean.sh /absolute/new/output
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$here/lib-common.sh"
repo="$(cd "$here/.." && pwd -P)"
out="${1:-}"
[ "$#" -eq 1 ] && [[ "$out" = /* ]] || gp_die 'provide one absolute, new output directory'
[ ! -e "$out" ] && [ ! -L "$out" ] || gp_die 'output path already exists'
out="$(cd "$(dirname "$out")" && pwd -P)/$(basename "$out")"
case "$out/" in "$repo/"*) gp_die 'output must be outside the source checkout';; esac
[ -z "$(git -C "$repo" status --porcelain --untracked-files=normal)" ] || gp_die 'source checkout must be clean'
commit="$(git -C "$repo" rev-parse HEAD)"
tree="$(git -C "$repo" rev-parse HEAD^{tree})"
epoch="$(git -C "$repo" log -1 --format=%ct HEAD)"
[ -z "${GITHUB_SHA:-}" ] || [ "$commit" = "$GITHUB_SHA" ] || gp_die 'HEAD does not match GITHUB_SHA'
mkdir "$out"
tmp="$(mktemp -d "$out/.builds.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT
version="lean-candidate-${commit:0:12}"
tarball="ghostpay-web-$version.tar.gz"
for run in first second/nested; do
  copy="$tmp/$run/source"
  mkdir -p "$(dirname "$copy")"
  git clone --quiet --no-hardlinks --no-checkout "$repo" "$copy"
  git -C "$copy" checkout --quiet --detach "$commit"
  [ "$(git -C "$copy" rev-parse HEAD^{tree})" = "$tree" ] || gp_die 'copied source tree mismatch'
  mkdir "$copy/.candidate-empty-deployments"
  label="${run%%/*}"
  # Do not inherit caller VITE_* values, release trust keys/manifests, or skip flags.
  if ! env -i PATH="$PATH" HOME="$HOME" TMPDIR="${TMPDIR:-/tmp}" CI=true TZ=UTC LC_ALL=C \
      GHOSTPAY_LOCAL_BUILD_PROFILE=lean GHOSTPAY_RELEASE_PUBKEYS= \
      GHOSTPAY_DEPLOYMENTS_DIR="$copy/.candidate-empty-deployments" \
      GP_SKIP_INSTALL=0 GP_COMMIT="$commit" SOURCE_DATE_EPOCH="$epoch" VERSION="$version" \
      OUT_DIR="$copy/release-out" \
      bash "$copy/scripts/release-build.sh" >"$out/$label.log" 2>&1; then
    tail -n 60 "$out/$label.log" >&2
    gp_die "$label build failed; full log retained in $out"
  fi
  node --input-type=module - "$copy/apps/web/dist/ghostpay-lean-build.json" <<'NODE'
import { readFileSync } from 'node:fs';
const report = JSON.parse(readFileSync(process.argv[2], 'utf8'));
if (report.format !== 'ghostpay-lean-build/1' || report.profile !== 'lean'
    || !report.chunks?.length || !report.workers?.length) throw new Error('missing lean build evidence');
NODE
  cp "$copy/apps/web/dist/ghostpay-lean-build.json" "$copy/release-out/ghostpay-lean-build.json"
done
first="$tmp/first/source/release-out"
second="$tmp/second/nested/source/release-out"
for file in "$tarball" sbom.cdx.json release-manifest.json ghostpay-lean-build.json SHA256SUMS; do
  cmp "$first/$file" "$second/$file" || gp_die "two clean builds differ: $file (logs retained)"
done
mkdir "$out/candidate"
cp "$first/"* "$out/candidate/"
node --input-type=module - "$out" "$commit" "$tree" "$epoch" "$tmp/first/source/package-lock.json" <<'NODE'
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const [out, commit, tree, epoch, lockfile] = process.argv.slice(2);
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const manifest = JSON.parse(readFileSync(join(out, 'candidate/release-manifest.json'), 'utf8'));
const receipt = {
  format: 'ghostpay-lean-qualification/1', status: 'two-build-byte-comparison-passed',
  source: { commit, tree, cleanCheckout: true, lockfileSha256: hash(lockfile) },
  profile: 'lean', sourceDateEpoch: Number(epoch), tools: manifest.tools,
  configuration: { deploymentManifests: 'empty', releaseVerificationKeys: 'empty' },
  builds: { count: 2, differentCleanDirectories: true, install: 'npm ci --ignore-scripts --no-audit --no-fund in each clone' },
  artifacts: readdirSync(join(out, 'candidate')).sort().map((name) => {
    const path = join(out, 'candidate', name);
    return { name, sha256: hash(path), bytes: statSync(path).size };
  }),
  provenance: { attestation: 'not-created-by-this-script', signature: 'not-created', publication: 'not-performed' },
  limits: [
    'Unconfigured candidate: no deployment manifests or release verification keys are included.',
    'No tests, browser smokes, coverage, fuzzing, static analysis or license review run in this script; existing gates remain required.',
    'SBOM is npm production dependency inventory, not proof of emitted-module contents or vulnerability clearance.',
    'Byte equality is demonstrated on this runner/toolchain, not independent builders or other platforms.',
    'Bundler module/Worker evidence is not proof of behavioral correctness.'
  ]
};
writeFileSync(join(out, 'qualification.json'), `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
NODE
printf 'Unsigned lean candidate comparison passed; evidence: %s\n' "$out"
