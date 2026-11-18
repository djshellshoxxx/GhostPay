#!/usr/bin/env node
// List, and optionally run, only the checks a change needs: the changed workspaces, every workspace that depends on
// them, and the Foundry projects that changed. Mirrors the grouping in .github/workflows/ci.yml (ts-test,
// contracts-test, contracts-extra) so a local pass predicts the CI result for the touched code.
//
// Usage:
//   node scripts/agent/affected.mjs                 # list affected targets vs origin/main (plus uncommitted changes)
//   node scripts/agent/affected.mjs --base HEAD~1   # compare with another ref
//   node scripts/agent/affected.mjs --json          # machine-readable
//   node scripts/agent/affected.mjs --run           # build needed libs, then test affected workspaces and forge projects
//   node scripts/agent/affected.mjs --run --checks typecheck,lint,test
//   node scripts/agent/affected.mjs --files a.ts,b.sol   # classify an explicit file list instead of git
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { affectedSet, buildsNeeded, classifyChanges, loadRepo } from './workspaces.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const VALID_CHECKS = new Set(['typecheck', 'lint', 'test']);

function parseArgs(argv) {
  const opts = { base: 'origin/main', json: false, run: false, checks: ['test'], files: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      const v = argv[++i];
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--base') opts.base = next();
    else if (a === '--json') opts.json = true;
    else if (a === '--run') opts.run = true;
    else if (a === '--checks') opts.checks = next().split(',').filter(Boolean);
    else if (a === '--files') opts.files = next().split(',').filter(Boolean);
    else if (a === '-h' || a === '--help') {
      console.log(readUsage());
      process.exit(0);
    } else throw new Error(`Unknown argument: ${a}`);
  }
  for (const c of opts.checks)
    if (!VALID_CHECKS.has(c)) throw new Error(`Unknown check: ${c} (use typecheck,lint,test)`);
  return opts;
}

function readUsage() {
  return 'node scripts/agent/affected.mjs [--base REF] [--files a,b] [--json] [--run [--checks typecheck,lint,test]]';
}

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
}

function changedFiles(base) {
  let mergeBase;
  try {
    mergeBase = git(['merge-base', base, 'HEAD'])[0];
  } catch {
    throw new Error(`Cannot resolve base "${base}". Fetch it (git fetch origin main) or pass --base <ref>.`);
  }
  const files = new Set([
    ...git(['diff', '--name-only', mergeBase, 'HEAD']),
    ...git(['diff', '--name-only', 'HEAD']), // staged + unstaged
    ...git(['ls-files', '--others', '--exclude-standard']),
  ]);
  return [...files].sort();
}

function run(cmd, args, cwd = root, env = process.env) {
  console.log(`\n$ ${[cmd, ...args].join(' ')}${cwd === root ? '' : `   (in ${cwd.replace(root, '')})`}`);
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', env });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    console.error(`\nFAILED (exit ${r.status}): ${[cmd, ...args].join(' ')}`);
    process.exit(r.status ?? 1);
  }
}

function hasCmd(name) {
  return spawnSync('sh', ['-c', `command -v ${name}`], { stdio: 'ignore' }).status === 0;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const repo = loadRepo(root);
  const files = opts.files ?? changedFiles(opts.base);
  const c = classifyChanges(files, repo);
  const affected = c.global ? repo.workspaces.map((w) => w.location) : affectedSet(repo.workspaces, c.direct);
  const forge = c.global ? repo.forge : [...c.forge].sort();
  const builds = buildsNeeded(repo.workspaces, affected);
  const result = {
    base: opts.files ? null : opts.base,
    files: files.length,
    global: c.global,
    direct: [...c.direct].sort(),
    affected,
    builds,
    forge,
    nodeScripts: c.nodeScripts || c.global,
    unmapped: c.unmapped,
  };

  if (opts.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`Changed files: ${files.length}${c.global ? '  (root config changed: FULL suite)' : ''}`);
    console.log(`Directly changed workspaces: ${result.direct.join(' ') || '-'}`);
    console.log(`Affected workspaces (${affected.length}): ${affected.join(' ') || '-'}`);
    console.log(`Libraries to build first (${builds.length}): ${builds.join(' ') || '-'}`);
    console.log(`Foundry projects: ${forge.join(' ') || '-'}`);
    console.log(`Node script tests: ${result.nodeScripts ? 'yes' : 'no'}`);
    if (c.unmapped.length)
      console.log(`Unmapped (check by hand: CI, deploy, infra, integrations): ${c.unmapped.join(' ')}`);
  }
  if (!opts.run) return;

  if (!existsSync(join(root, 'node_modules'))) {
    throw new Error('node_modules missing. Run: npm ci --ignore-scripts && npm run build:libs');
  }
  for (const loc of builds) run('npm', ['run', 'build', '-w', loc]);
  const ws = (script) =>
    affected.filter((loc) => repo.workspaces.find((w) => w.location === loc).scripts.includes(script));
  for (const check of opts.checks) {
    const targets = ws(check);
    if (targets.length) run('npm', ['run', check, ...targets.flatMap((t) => ['-w', t])]);
  }
  if (opts.checks.includes('test')) {
    if (forge.length && !hasCmd('forge')) {
      console.error(
        `\nSKIPPED forge tests for ${forge.join(', ')}: forge is not installed (Foundry v1.8.5, see .devcontainer).`,
      );
      process.exitCode = 2;
    } else {
      for (const p of forge) {
        const dir = join(root, p);
        // payer-hiding-contracts tests need the gitignored ERC-4337 EntryPoint fixture (as in ci.yml contracts-extra).
        if (existsSync(join(dir, 'scripts/fetch-entrypoint.sh')))
          run('bash', ['scripts/fetch-entrypoint.sh'], dir);
        run('forge', ['build'], dir);
        // FOUNDRY_PROFILE=dev cuts fuzz runs 10000 -> 256 for iteration; CI runs the full default profile.
        run('forge', ['test'], dir, {
          ...process.env,
          FOUNDRY_PROFILE: process.env.FOUNDRY_PROFILE ?? 'dev',
        });
        run('forge', ['fmt', '--check'], dir);
      }
    }
    if (result.nodeScripts) {
      const globs = ['scripts/testnet', 'scripts/regtest', 'scripts/agent', 'scripts/tests'];
      const tests = globs.flatMap((d) =>
        existsSync(join(root, d)) ? git(['ls-files', `${d}/*.test.mjs`]) : [],
      );
      if (tests.length) run('node', ['--test', ...tests]);
    }
  }
  if (c.unmapped.length) console.log(`\nNot covered by this run (unmapped paths): ${c.unmapped.join(' ')}`);
}

try {
  main();
} catch (e) {
  console.error(`affected: ${e.message}`);
  process.exit(1);
}
