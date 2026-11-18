// Shared helpers for scripts/beta/cli-devnet.e2e.mjs. LOCAL/TEST ONLY.
// Secrets reach the CLI only through private 0600 files or named environment variables of the child process,
// never through argv, and are never printed. Every CLI call asserts its exit code and parses --json output.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export const CLI = resolve(ROOT, 'packages/cli/dist/bin.js');
/** Public anvil/hardhat development mnemonic. World-known; holds nothing real. */
export const MNEMONIC = 'test test test test test test test test test test test junk';

/** Exit codes documented in packages/cli/README.md ("Results, exit codes and interpretation"). */
export const EXIT = Object.freeze({ ok: 0, fail: 1, usage: 2, io: 3, network: 4, unsupported: 5, config: 6 });

export function privateDir(label) {
  const dir = mkdtempSync(join(tmpdir(), `ghostpay-cli-${label}-`));
  chmodSync(dir, 0o700);
  return dir;
}

export function removeDir(dir) {
  if (process.env.CLI_E2E_KEEP === '1') { console.log(`kept work dir ${dir}`); return; }
  rmSync(dir, { recursive: true, force: true });
}

/** Writes a file with mode 0600 (required by the CLI's private secret reader on POSIX). */
export function writePrivate(path, text) {
  writeFileSync(path, text, { mode: 0o600 });
  chmodSync(path, 0o600);
  return path;
}

export const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const SECRET_ENV = new Set();
/** Registers environment values that must never appear in CLI stdout/stderr. */
export function secretEnv(values) {
  for (const v of Object.values(values)) if (typeof v === 'string' && v.length >= 8) SECRET_ENV.add(v);
  return values;
}

export const results = [];

/**
 * Runs the CLI with `--json`, asserts the exit code and returns `{ code, out, err }` with parsed JSON.
 * @param {string} label   Step name for the PASS/FAIL table.
 * @param {string[]} args  CLI arguments (never secrets).
 * @param {{ expect?: number, env?: Record<string,string>, stdin?: string, cwd?: string, code?: string }} o
 *   `code` additionally asserts the stable error.code of a failure.
 */
export function cli(label, args, o = {}) {
  for (const a of args) for (const s of SECRET_ENV) assert.ok(!a.includes(s), `${label}: secret material on argv`);
  const r = spawnSync(process.execPath, [CLI, ...args, '--json'], {
    cwd: o.cwd ?? ROOT, encoding: 'utf8', input: o.stdin ?? '', timeout: 120_000,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, ...(o.env ?? {}) },
  });
  const both = `${r.stdout}\n${r.stderr}`;
  for (const s of SECRET_ENV) assert.ok(!both.includes(s), `${label}: secret material leaked to CLI output`);
  const parse = (t) => { const s = t.trim(); if (s === '') return undefined; try { return JSON.parse(s); } catch { return { raw: s }; } };
  const res = { code: r.status, out: parse(r.stdout), err: parse(r.stderr) };
  const expect = o.expect ?? EXIT.ok;
  const errCode = res.err?.error?.code ?? res.out?.error?.code;
  const ok = res.code === expect && (o.code === undefined || errCode === o.code);
  const detail = `exit=${res.code}${errCode ? ` ${errCode}` : ''}${expect !== 0 ? ` (expected ${expect}${o.code ? ` ${o.code}` : ''})` : ''}`;
  results.push({ label, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${label} | ${detail}`);
  if (!ok) {
    console.error(`  argv: ghostpay ${args.join(' ')}`);
    console.error(`  stdout: ${r.stdout.slice(0, 2000)}`);
    console.error(`  stderr: ${r.stderr.slice(0, 2000)}`);
    throw new Error(`${label}: unexpected CLI result (${detail})`);
  }
  return res;
}

/** Records a non-CLI assertion in the same PASS table. */
export function check(label, fn, detail = '') {
  try { fn(); } catch (e) { results.push({ label, ok: false, detail: e.message }); console.log(`FAIL ${label} | ${e.message}`); throw e; }
  results.push({ label, ok: true, detail });
  console.log(`PASS ${label}${detail ? ` | ${detail}` : ''}`);
}

export function summary(title) {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n== ${title}: ${results.length - failed.length}/${results.length} checks passed`);
  return failed.length === 0;
}
