// Regression tests for workflow logic (audit L7-L4, L7-M4). No network: the CI `changes` filter runs against a stub
// `gh` that serves fixture pages and applies --jq to each page with the system jq, as `gh api --paginate --jq` does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const noJq = spawnSync('jq', ['--version']).status === 0 ? false : 'jq not installed';

/** The `run: |` script of the step `- id: <id>` in a workflow, dedented. */
function stepScript(workflow, id) {
  const lines = workflow.split('\n');
  const start = lines.findIndex((l) => l.trim() === `- id: ${id}`);
  assert.ok(start >= 0, `step ${id} not found`);
  const stepIndent = lines[start].indexOf('-');
  let i = start + 1;
  while (i < lines.length && !/^\s*run: \|\s*$/.test(lines[i])) {
    assert.ok(lines[i].trim() === '' || lines[i].search(/\S/) > stepIndent, `step ${id} has no run: | block`);
    i++;
  }
  const runIndent = lines[i].search(/\S/);
  const body = [];
  for (i++; i < lines.length && (lines[i].trim() === '' || lines[i].search(/\S/) > runIndent); i++) body.push(lines[i]);
  const indent = Math.min(...body.filter((l) => l.trim() !== '').map((l) => l.search(/\S/)));
  return `${body.map((l) => l.slice(indent)).join('\n')}\n`;
}

const GH_STUB = `#!/usr/bin/env bash
# Stub for \`gh api\`: repos/<r>/pulls/<n> serves $STUB_DIR/pr.json; .../files serves the pages files-*.json (all with
# --paginate, else the first); --jq is applied to each page separately. Every call is logged.
set -euo pipefail
echo "$*" >> "$STUB_DIR/calls"
[ "$1" = api ] || exit 64
shift
path=""; filter=""; paginate=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --paginate) paginate=1 ;;
    --jq|-q) filter="$2"; shift ;;
    -*) echo "stub gh: unsupported flag $1" >&2; exit 64 ;;
    *) path="$1" ;;
  esac
  shift
done
case "$path" in
  repos/*/pulls/*/files) pages=("$STUB_DIR"/files-*.json); [ "$paginate" = 1 ] || pages=("\${pages[0]}") ;;
  repos/*/pulls/*) pages=("$STUB_DIR/pr.json") ;;
  *) echo "stub gh: unexpected path $path" >&2; exit 64 ;;
esac
for p in "\${pages[@]}"; do if [ -n "$filter" ]; then jq -r "$filter" "$p"; else cat "$p"; fi; done
`;

/**
 * Run the CI `changes` filter step. `pr` is the pull request object, `files` the file entries; the stub serves them in
 * pages of 100, at most 30 pages (3000 entries), like the GitHub API.
 */
function changesFilter({ event = 'pull_request', pr, files = [] }) {
  const dir = mkdtempSync(join(tmpdir(), 'gp-ci-'));
  try {
    const bin = join(dir, 'bin');
    const stub = join(dir, 'stub');
    mkdirSync(bin);
    mkdirSync(stub);
    writeFileSync(join(bin, 'gh'), GH_STUB, { mode: 0o755 });
    writeFileSync(join(stub, 'pr.json'), JSON.stringify(pr ?? {}));
    const served = files.slice(0, 3000);
    for (let p = 0; p * 100 < Math.max(served.length, 1); p++) {
      writeFileSync(join(stub, `files-${String(p + 1).padStart(3, '0')}.json`), JSON.stringify(served.slice(p * 100, p * 100 + 100)));
    }
    const out = join(dir, 'github-output');
    writeFileSync(out, '');
    const script = join(dir, 'filter.sh');
    writeFileSync(script, stepScript(read('.github/workflows/ci.yml'), 'filter'));
    const r = spawnSync('bash', [script], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, STUB_DIR: stub, GITHUB_OUTPUT: out, GH_TOKEN: 'stub', EVENT: event, REPO: 'owner/repo', PR: '7' },
    });
    assert.equal(r.status, 0, r.stderr);
    const code = [...readFileSync(out, 'utf8').matchAll(/^code=(.*)$/gm)].map((m) => m[1]);
    assert.equal(code.length, 1, `exactly one code= output, got ${JSON.stringify(code)}`);
    return code[0];
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const docs = (n) => Array.from({ length: n }, (_, i) => ({ filename: `docs/page-${i}.md` }));

test('CI changes filter: docs-only and code pull requests are classified as before (audit L7-L4)', { skip: noJq }, () => {
  assert.equal(changesFilter({ pr: { changed_files: 2 }, files: [{ filename: 'docs/a.md' }, { filename: 'README.md' }] }), 'false');
  assert.equal(changesFilter({ pr: { changed_files: 2 }, files: [{ filename: 'docs/a.md' }, { filename: 'apps/web/src/x.ts' }] }), 'true');
  assert.equal(changesFilter({ pr: { changed_files: 1 }, files: [{ filename: 'docs/x.md', previous_filename: 'src/x.ts' }] }), 'true', 'a rename out of code counts as code');
  assert.equal(changesFilter({ event: 'push', pr: { changed_files: 1 }, files: docs(1) }), 'true', 'every non-PR run runs everything');
  assert.equal(changesFilter({ pr: { changed_files: 0 }, files: [] }), 'true', 'an empty list runs everything');
});

test('CI changes filter fails safe when the 3000-file list may be truncated (audit L7-L4)', { skip: noJq }, () => {
  // 3500 changed files, the API lists the first 3000 (all docs): the code change sits in the unlisted tail.
  assert.equal(changesFilter({ pr: { changed_files: 3500 }, files: [...docs(3000), { filename: 'packages/core-crypto/src/x.ts' }] }), 'true');
  assert.equal(changesFilter({ pr: { changed_files: 3000 }, files: docs(3000) }), 'true', 'at the cap the list cannot be known to be complete');
  assert.equal(changesFilter({ pr: { changed_files: 5 }, files: docs(3) }), 'true', 'fewer entries than changed_files');
  assert.equal(changesFilter({ pr: {}, files: docs(3) }), 'true', 'unknown changed_files');
  assert.equal(changesFilter({ pr: { changed_files: 2999 }, files: docs(2999) }), 'false', 'a complete docs-only list below the cap still skips');
});

test('Pages mirror builds every workspace lib from source, never from the Actions cache (audit L7-M4)', () => {
  const pages = read('.github/workflows/pages.yml');
  assert.doesNotMatch(pages, /uses:\s*\.\/\.github\/actions\/setup-node-libs/, 'the composite action restores packages/*/dist from the libs cache');
  assert.doesNotMatch(pages, /uses:\s*actions\/cache(\/restore)?@/, 'no Actions cache restore at all');
  const setupNode = /uses: actions\/setup-node@[0-9a-f]{40} # v\S+/.exec(read('.github/actions/setup-node-libs/action.yml'))?.[0];
  assert.ok(setupNode !== undefined);
  assert.ok(pages.includes(setupNode), 'same pinned actions/setup-node as the rest of CI');
  const order = ['npm ci --ignore-scripts', 'rm -rf packages/*/dist', 'npm run build:libs', 'npm run build -w apps/web'].map((s) => pages.indexOf(s));
  assert.ok(order.every((at) => at >= 0), `missing step: ${JSON.stringify(order)}`);
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'install, clean, build libs, then build the app');
});
