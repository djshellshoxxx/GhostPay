/** Offline, single-directory local approval recorder. Never signs or broadcasts payments. */
import { constants } from 'node:fs';
import { lstat, mkdir, open, rename, rmdir, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  createAccountState, executeProposal, parseAccountState, parseProposalExchange,
  pruneExpired, queueProposal, serializeAccountState,
} from '../../packages/merchant-multisig/dist/index.js';

const MAX_BYTES = 2 * 1024 * 1024;
const fail = (code) => Object.assign(new Error(code), { code });

async function privateDirectory(directory) {
  if (process.platform === 'win32') throw fail('UNSUPPORTED_FILESYSTEM');
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0
      || (typeof process.getuid === 'function' && stat.uid !== process.getuid())) throw fail('UNSAFE_DIRECTORY');
}

async function syncDirectory(directory) {
  const handle = await open(directory, constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  try { await handle.sync(); } finally { await handle.close(); }
}

async function readSnapshot(directory) {
  const handle = await open(join(directory, 'account.json'), constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o077) !== 0 || stat.size > MAX_BYTES
        || (typeof process.getuid === 'function' && stat.uid !== process.getuid())) throw fail('UNSAFE_SNAPSHOT');
    const bytes = Buffer.alloc(MAX_BYTES + 1);
    let count = 0;
    while (count < bytes.length) {
      const { bytesRead } = await handle.read(bytes, count, bytes.length - count, null);
      if (bytesRead === 0) break;
      count += bytesRead;
    }
    if (count > MAX_BYTES) throw fail('OVERSIZED_SNAPSHOT');
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, count));
    const snapshot = JSON.parse(text);
    if (snapshot === null || typeof snapshot !== 'object' || Array.isArray(snapshot)
        || Object.keys(snapshot).join(',') !== 'format,version,revision,account'
        || snapshot.format !== 'ghostpay-local-approvals' || snapshot.version !== 1
        || !Number.isSafeInteger(snapshot.revision) || snapshot.revision < 0
        || typeof snapshot.account !== 'string'
        || JSON.stringify(snapshot) !== text) throw fail('INVALID_SNAPSHOT');
    const state = parseAccountState(snapshot.account);
    return Object.freeze({ revision: snapshot.revision, state });
  } finally { await handle.close(); }
}

async function commit(directory, revision, state) {
  const path = join(directory, `.account-${randomUUID()}.tmp`);
  let handle;
  try {
    const text = JSON.stringify({ format: 'ghostpay-local-approvals', version: 1, revision, account: serializeAccountState(state) });
    handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    await handle.writeFile(text);
    await handle.sync();
    await handle.close(); handle = undefined;
    await rename(path, join(directory, 'account.json'));
    await syncDirectory(directory);
  } finally {
    if (handle) await handle.close();
    await unlink(path).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}

async function locked(directory, fn) {
  await privateDirectory(directory);
  const lock = join(directory, '.lock');
  try { await mkdir(lock, { mode: 0o700 }); } catch (error) {
    if (error.code === 'EEXIST') throw fail('LOCKED');
    throw error;
  }
  let uncertainCommit = false;
  try {
    return await fn(() => { uncertainCommit = true; }, () => { uncertainCommit = false; });
  } finally {
    // On any failure after commit begins, retain lock for explicit operator recovery.
    if (!uncertainCommit) await rmdir(lock);
  }
}

/** The caller chooses a new private directory and trusted policy. Existing state cannot be replaced. */
export async function initializeApprovals(directory, policy) {
  await mkdir(directory, { mode: 0o700 });
  await locked(directory, async (begin, complete) => {
    const state = createAccountState(policy);
    begin(); await commit(directory, 0, state); complete();
  });
  return inspectApprovals(directory);
}

/** Snapshot is informational. Every mutation reloads under the process-shared lock. */
export async function inspectApprovals(directory) {
  await privateDirectory(directory);
  return readSnapshot(directory);
}

/**
 * Applies one queue/execute/prune transition at the expected local revision.
 * execute only consumes an approval and records it locally; it is NOT a payment.
 */
export async function updateApprovals(directory, expectedRevision, action, now) {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw fail('INVALID_REVISION');
  return locked(directory, async (begin, complete) => {
    const current = await readSnapshot(directory);
    if (current.revision !== expectedRevision) throw fail('STALE_SNAPSHOT');
    if (current.revision === Number.MAX_SAFE_INTEGER) throw fail('REVISION_LIMIT');
    let result;
    if (action?.kind === 'queue') {
      const exchange = parseProposalExchange(action.exchange, current.state.policy);
      result = queueProposal(current.state, exchange.proposal, exchange.approvals, now);
    } else if (action?.kind === 'execute') {
      result = executeProposal(current.state, action.digest, now);
    } else if (action?.kind === 'prune') {
      result = pruneExpired(current.state, now);
    } else throw fail('INVALID_ACTION');
    begin(); await commit(directory, current.revision + 1, result.state); complete();
    return Object.freeze({ revision: current.revision + 1, ...result });
  });
}
