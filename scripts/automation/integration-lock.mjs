#!/usr/bin/env node
// Cooperative integration exclusion. Git's non-fast-forward rejection is the
// atomic compare-and-swap; never force this ref or infer ownership from a cache.
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const LOCK_REF = 'refs/heads/automation/ghostpay-integration-lock';
const STATE_PATH = 'integration-lock.json';
const FORMAT = 'ghostpay-integration-lock/1';
const SHA = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;

function ownerName(owner) {
  if (typeof owner !== 'string' || !owner.trim() || owner.length > 200 || /[\x00-\x1f\x7f]/.test(owner)) {
    throw new Error('A nonempty owner identifier of at most 200 characters is required.');
  }
  return owner;
}

function ttl(value = 3600) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 21600) {
    throw new Error('ttlSeconds must be an integer from 1 through 21600.');
  }
  return value * 1000;
}

function timestamp(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}

function validateState(state) {
  if (!state || typeof state !== 'object' || state.format !== FORMAT
      || !['held', 'released'].includes(state.status)
      || !Number.isSafeInteger(state.generation) || state.generation < 1
      || typeof state.token !== 'string' || !UUID.test(state.token)
      || typeof state.base_sha !== 'string' || !SHA.test(state.base_sha)
      || !timestamp(state.acquired_at) || !timestamp(state.heartbeat_at) || !timestamp(state.expires_at)
      || Date.parse(state.heartbeat_at) < Date.parse(state.acquired_at)
      || Date.parse(state.expires_at) <= Date.parse(state.heartbeat_at)
      || (state.status === 'released' && (!timestamp(state.released_at)
        || Date.parse(state.released_at) < Date.parse(state.heartbeat_at)))) {
    throw new Error('Invalid integration lock state; stop and inspect the remote ref.');
  }
  ownerName(state.owner);
  return state;
}

export function createIntegrationLock({ cwd = process.cwd(), remote = 'origin', now = Date.now } = {}) {
  if (typeof remote !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(remote)) {
    throw new Error('Use a configured Git remote name, not a URL or Git option.');
  }

  function git(args, input) {
    return new Promise((accept, reject) => {
      const child = execFile('git', args, {
        cwd, encoding: 'utf8', maxBuffer: 65536, timeout: 60000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      }, (error, stdout) => {
        if (error) reject(new Error(`Git operation failed (${error.code ?? 'unknown'}); inspect repository access and current lock state.`));
        else accept(stdout.trim());
      });
      child.stdin.on('error', () => {});
      child.stdin.end(input);
    });
  }

  async function checkRemote() {
    const names = (await git(['remote'])).split('\n');
    if (!names.includes(remote)) throw new Error('The configured Git remote does not exist.');
    const fetchUrls = (await git(['remote', 'get-url', '--all', remote])).split('\n');
    const pushUrls = (await git(['remote', 'get-url', '--push', '--all', remote])).split('\n');
    if (fetchUrls.length !== 1 || pushUrls.length !== 1 || fetchUrls[0] !== pushUrls[0]) {
      throw new Error('The lock remote must read and write the same single destination.');
    }
  }

  function clock() {
    const value = now();
    if (!Number.isSafeInteger(value) || value < 0 || value > 8640000000000000 - 21600000) {
      throw new Error('Invalid clock; refuse to change integration ownership.');
    }
    return value;
  }

  async function status() {
    await checkRemote();
    const refs = await git(['ls-remote', '--refs', remote, LOCK_REF]);
    if (!refs) return null;
    const lines = refs.split('\n');
    const [sha, ref] = lines[0].split(/\s+/);
    if (lines.length !== 1 || ref !== LOCK_REF || !SHA.test(sha)) throw new Error('Unexpected integration lock ref response.');
    // Fetch the observed immutable commit, not whichever head exists later.
    await git(['fetch', '--no-tags', '--no-recurse-submodules', '--no-write-fetch-head', remote, sha]);
    let state;
    try { state = JSON.parse(await git(['show', `${sha}:${STATE_PATH}`])); }
    catch { throw new Error('Unreadable integration lock state; stop and inspect the remote ref.'); }
    return { sha, state: validateState(state) };
  }

  async function publish(previous, state) {
    validateState(state);
    const blob = await git(['hash-object', '-w', '--stdin'], `${JSON.stringify(state, null, 2)}\n`);
    const tree = await git(['mktree'], `100644 blob ${blob}\t${STATE_PATH}\n`);
    const parents = previous ? ['-p', previous.sha] : [];
    const sha = await git([
      '-c', 'user.name=GhostPay automation', '-c', 'user.email=ghostpay-automation@users.noreply.github.com',
      'commit-tree', tree, ...parents,
    ], `automation: ${state.status} integration lock for ${state.owner}\n`);
    // Every state transition has exactly the observed remote head as parent.
    // Concurrent writers create siblings, so Git accepts only one. Initial
    // acquisition uses unrelated root commits with the same one-winner rule.
    // push.followTags is a repository/user setting; explicitly prevent a lock
    // transition from publishing an annotated release tag as a side effect.
    try { await git(['push', '--porcelain', '--no-follow-tags', remote, `${sha}:${LOCK_REF}`]); }
    catch { throw new Error('Integration lock update rejected or unconfirmed; re-read remote state before proceeding.'); }
    return { sha, state };
  }

  async function owned(identity, allowExpired = false) {
    ownerName(identity?.owner);
    const current = await status();
    if (!current || current.state.status !== 'held' || current.state.owner !== identity.owner
        || current.state.token !== identity.token) {
      throw new Error('Integration lock ownership mismatch; do not write shared targets.');
    }
    const time = clock();
    if (time < Date.parse(current.state.heartbeat_at)) throw new Error('Clock moved backwards; refuse integration.');
    if (!allowExpired && time >= Date.parse(current.state.expires_at)) {
      throw new Error('Integration lock expired; verify the previous writer stopped before release and reacquisition.');
    }
    return current;
  }

  return {
    status,
    async acquire({ owner, ttlSeconds } = {}) {
      ownerName(owner);
      const duration = ttl(ttlSeconds);
      const previous = await status();
      if (previous?.state.status === 'held') {
        throw new Error('Integration lock already held; expiry alone never permits takeover.');
      }
      const time = clock();
      const at = new Date(time).toISOString();
      return publish(previous, {
        format: FORMAT, status: 'held', owner, token: randomUUID(),
        generation: (previous?.state.generation ?? 0) + 1,
        base_sha: await git(['rev-parse', '--verify', 'HEAD']),
        acquired_at: at, heartbeat_at: at, expires_at: new Date(time + duration).toISOString(),
      });
    },
    assertOwned: (identity) => owned(identity),
    async heartbeat(identity = {}) {
      const duration = ttl(identity.ttlSeconds);
      const previous = await owned(identity);
      const time = clock();
      if (time < Date.parse(previous.state.heartbeat_at)) throw new Error('Clock moved backwards; refuse lock renewal.');
      if (time >= Date.parse(previous.state.expires_at)) throw new Error('Integration lock expired before renewal.');
      return publish(previous, {
        ...previous.state, heartbeat_at: new Date(time).toISOString(), expires_at: new Date(time + duration).toISOString(),
      });
    },
    async release(identity) {
      const previous = await owned(identity, true);
      return publish(previous, { ...previous.state, status: 'released', released_at: new Date(clock()).toISOString() });
    },
  };
}

async function cli(args) {
  const [command, ...options] = args;
  if (!['status', 'acquire', 'assert', 'heartbeat', 'release'].includes(command)) {
    throw new Error('Usage: integration-lock.mjs status|acquire|assert|heartbeat|release [--owner ID] [--token TOKEN] [--ttl-seconds N] [--remote NAME]');
  }
  const parsed = {};
  for (let i = 0; i < options.length; i += 2) {
    const key = options[i];
    const value = options[i + 1];
    if (!['--owner', '--token', '--ttl-seconds', '--remote'].includes(key) || value === undefined
        || value.startsWith('--') || Object.hasOwn(parsed, key)) throw new Error('Invalid or duplicate lock option.');
    parsed[key] = value;
  }
  const lock = createIntegrationLock({ remote: parsed['--remote'] });
  const identity = {
    owner: parsed['--owner'], token: parsed['--token'],
    ttlSeconds: parsed['--ttl-seconds'] === undefined ? undefined : Number(parsed['--ttl-seconds']),
  };
  const result = await lock[command === 'assert' ? 'assertOwned' : command](identity);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  cli(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
