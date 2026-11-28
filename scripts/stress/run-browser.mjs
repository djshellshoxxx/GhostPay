#!/usr/bin/env node
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { redactDiagnostics } from './redact.mjs';
import { disableRetries } from './replay-args.mjs';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const resultsDir = resolve(process.env.GHOSTPAY_RESULTS_DIR ?? 'stress-results');
const config = fileURLToPath(new URL('./replay-browser.config.mts', import.meta.url));
const require = createRequire(resolve(root, 'apps/web/package.json'));
const expectedPlaywrightVersion = JSON.parse(readFileSync(resolve(root, 'apps/web/package.json'), 'utf8')).devDependencies['@playwright/test'];
let installedPlaywright;
try {
  installedPlaywright = require('playwright/package.json');
} catch {
  installedPlaywright = undefined;
}

try {
  mkdirSync(resultsDir, { recursive: true, mode: 0o700 });
} catch (error) {
  process.stderr.write(`STRESS results-directory-failed ${JSON.stringify({ code: error?.code ?? 'UNKNOWN' })}\n`);
}

function writeDiagnostic(name, value) {
  const line = `STRESS ${JSON.stringify(value)}\n`;
  try {
    appendFileSync(resolve(resultsDir, name), line, { mode: 0o600 });
  } catch (error) {
    process.stderr.write(`STRESS diagnostic-write-failed ${JSON.stringify({ file: name, code: error?.code ?? 'UNKNOWN' })}\n`);
  }
  process.stderr.write(line);
}

function browserPath(name) {
  const configured = process.env[`GHOSTPAY_${name.toUpperCase()}`];
  if (configured) return configured;
  try {
    return require('playwright')[name].executablePath();
  } catch {
    return undefined;
  }
}

function browserVersion(name) {
  const executable = browserPath(name);
  if (!executable) return { executable: null, version: 'unavailable' };
  const result = spawnSync(executable, ['--version'], { encoding: 'utf8', timeout: 5_000 });
  const output = redactDiagnostics(`${result.stdout ?? ''} ${result.stderr ?? ''}`, 220).trim();
  return {
    executable: redactDiagnostics(executable, 220),
    version: result.status === 0 ? output || 'unknown' : `unavailable (${result.error?.code ?? result.status ?? 'launch-error'})`,
    ...(result.status === 0 || !output ? {} : { versionCheckOutput: output }),
  };
}

function processTree(rootPid) {
  if (process.platform !== 'linux') return { supported: false, processes: [] };
  const pending = [rootPid];
  const seen = new Set();
  const processes = [];
  while (pending.length && seen.size < 256) {
    const pid = pending.pop();
    if (!pid || seen.has(pid)) continue;
    seen.add(pid);
    try {
      const status = readFileSync(`/proc/${pid}/status`, 'utf8');
      const name = status.match(/^Name:\s*(.+)$/m)?.[1] ?? 'unknown';
      const ppid = Number(status.match(/^PPid:\s*(\d+)$/m)?.[1] ?? 0);
      const rssKb = Number(status.match(/^VmRSS:\s*(\d+)\s+kB$/m)?.[1] ?? 0);
      const virtualKb = Number(status.match(/^VmSize:\s*(\d+)\s+kB$/m)?.[1] ?? 0);
      processes.push({ pid, ppid, name, rssKb, virtualKb });
      const children = readFileSync(`/proc/${pid}/task/${pid}/children`, 'utf8').trim();
      if (children) pending.push(...children.split(/\s+/).map(Number));
    } catch {
      // A child can exit between enumerating it and reading /proc; the next sample covers live processes.
    }
  }
  return { supported: true, processes, totalRssKb: processes.reduce((sum, item) => sum + item.rssKb, 0) };
}

for (const name of ['chromium', 'firefox', 'webkit']) {
  writeDiagnostic('browser-metadata.jsonl', {
    type: 'browser',
    name,
    playwrightVersion: installedPlaywright?.version ?? 'unavailable',
    expectedPlaywrightVersion,
    ...browserVersion(name),
  });
}

let playwrightCli;
try {
  if (!installedPlaywright) throw new Error('missing Playwright');
  if (installedPlaywright.version !== expectedPlaywrightVersion) {
    process.stderr.write(`STRESS playwright-version-mismatch ${JSON.stringify({ expected: expectedPlaywrightVersion, actual: installedPlaywright.version })}\n`);
    process.exit(1);
  }
  const packagePath = require.resolve('playwright/package.json');
  const bin = typeof installedPlaywright.bin === 'string' ? installedPlaywright.bin : installedPlaywright.bin?.playwright;
  if (!bin) throw new Error('missing Playwright CLI entry');
  playwrightCli = resolve(dirname(packagePath), bin);
} catch {
  process.stderr.write('STRESS runner-error {"message":"Playwright is not installed in apps/web dependencies."}\n');
  process.exit(1);
}

const args = ['test', '--config', config, ...disableRetries(process.argv.slice(2))];
const debug = process.env.DEBUG ? `${process.env.DEBUG},pw:browser*` : 'pw:browser*';
const child = spawn(process.execPath, [playwrightCli, ...args], {
  cwd: root,
  env: { ...process.env, DEBUG: debug, GHOSTPAY_RESULTS_DIR: resultsDir },
  stdio: ['inherit', 'pipe', 'pipe'],
});

child.stdout.on('data', (chunk) => process.stdout.write(chunk));
let stderrBuffer = '';
child.stderr.on('data', (chunk) => {
  stderrBuffer += chunk.toString();
  const lines = stderrBuffer.split(/(?<=\n)/);
  stderrBuffer = lines.pop() ?? '';
  const safe = lines.map((line) => redactDiagnostics(line, 10_000)).join('');
  if (!safe) return;
  try {
    appendFileSync(resolve(resultsDir, 'browser-stderr.log'), safe, { mode: 0o600 });
  } catch (error) {
    process.stderr.write(`STRESS browser-stderr-write-failed ${JSON.stringify({ code: error?.code ?? 'UNKNOWN' })}\n`);
  }
  process.stderr.write(safe);
});

const sample = () => writeDiagnostic('process-resources.jsonl', {
  type: 'process-resources',
  sampledAt: new Date().toISOString(),
  ...processTree(child.pid),
});
const sampleTimer = setInterval(sample, 2_000);
sample();

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => child.kill(signal));
}

child.on('error', (error) => {
  process.stderr.write(`STRESS child-launch-failed ${JSON.stringify({ code: error.code ?? 'UNKNOWN', message: redactDiagnostics(error.message, 240) })}\n`);
});

child.on('close', (code, signal) => {
  clearInterval(sampleTimer);
  sample();
  if (stderrBuffer) process.stderr.write(redactDiagnostics(stderrBuffer, 10_000));
  process.exitCode = code ?? (signal ? 1 : 0);
});
