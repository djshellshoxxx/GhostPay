import { createHash, generateKeyPairSync, sign, verify } from 'node:crypto';
import { canonicalize } from '@ghostpay/invoice-schema';
import fc from 'fast-check';
import { describe, expect, it, vi } from 'vitest';
import { openTeamMembershipReview, type TeamMembershipProvider } from './commitMembership';
import type { TeamMembershipSnapshot } from './membership';

const issuer = generateKeyPairSync('ed25519');
const start = 1_800_000_000_000;
const empty: TeamMembershipSnapshot = Object.freeze({
  teamId: 'team-a', issuerFingerprint: 'a'.repeat(64), revision: 0,
  membershipEpoch: 1, members: Object.freeze([]),
});

function invite(index: number, epoch = 1) {
  const memberFingerprint = index.toString(16).padStart(64, '0');
  const claims = {
    version: 1, teamId: empty.teamId, issuerFingerprint: empty.issuerFingerprint,
    memberFingerprint, capabilityId: `cap-${index}`, nonce: `nonce-${index}`,
    roles: ['reconcile'], recordScope: ['record-1'], membershipEpoch: epoch, expiresAtMs: start + 100,
  };
  const signature = sign(null, Buffer.from('ghostpay:ghostteams:capability:v1\n' + canonicalize(claims)),
    issuer.privateKey).toString('base64url');
  return { kind: 'accept' as const, memberFingerprint,
    invitation: new TextEncoder().encode(canonicalize({ ...claims, signature })) };
}

// Synthetic storage. The separate digest stands in for the provider's trusted checkpoint.
// Each read decodes fresh objects, including when a new consumer opens after revocation.
function fixture() {
  const digest = (bytes: string) => createHash('sha256').update(bytes).digest('hex');
  let bytes = canonicalize(empty);
  let checkpoint = digest(bytes);
  let writes = 0;
  function current() {
    if (digest(bytes) !== checkpoint) throw new Error('Fixture checkpoint mismatch');
    const state = JSON.parse(bytes) as TeamMembershipSnapshot;
    for (const member of state.members) {
      Object.freeze(member.roles);
      Object.freeze(member.recordScope);
      Object.freeze(member);
    }
    Object.freeze(state.members);
    return Object.freeze({ token: checkpoint, snapshot: Object.freeze(state) });
  }
  function connect() {
    const provider = {
      readAuthenticated: vi.fn(() => Promise.resolve(current())),
      nowMs: vi.fn(() => start),
      isCurrent: vi.fn(() => true),
      verifyIssuerSignature: (msg, signature) => verify(null, msg, issuer.publicKey, signature),
      compareAndSwapOwnerReviewed: vi.fn<TeamMembershipProvider['compareAndSwapOwnerReviewed']>(
        (expected, next, guard) => {
          if (current().token !== expected.token) return Promise.resolve('conflict');
          guard();
          if (next !== expected.snapshot) {
            bytes = canonicalize(next);
            checkpoint = digest(bytes);
            writes++;
          }
          return Promise.resolve('applied');
        }),
    } satisfies TeamMembershipProvider;
    return provider;
  }
  return { connect, current, writes: () => writes, bytes: () => bytes,
    replaceBytes: (replacement: string) => { bytes = replacement; } };
}

async function review(provider: TeamMembershipProvider) {
  const result = await openTeamMembershipReview(provider);
  if (!result.ok) throw new Error(result.code);
  return result;
}

describe('GhostTeams owner-reviewed membership commits', () => {
  it('permits one winner per head and preserves the losing draft for explicit review', async () => {
    const store = fixture();
    const slowPort = store.connect();
    const swap = slowPort.compareAndSwapOwnerReviewed.getMockImplementation()!;
    let release!: () => void;
    const pendingApproval = new Promise<void>(resolve => { release = resolve; });
    slowPort.compareAndSwapOwnerReviewed.mockImplementationOnce(async (...args) => {
      await pendingApproval;
      return swap(...args);
    });
    const slow = await review(slowPort);
    const fast = await review(store.connect());
    const a = invite(1);
    const b = invite(2);
    const pending = slow.commit(a);
    expect(slowPort.compareAndSwapOwnerReviewed).toHaveBeenCalledOnce();
    expect(await fast.commit(b)).toEqual({ ok: true, changed: true, revision: 1 });
    release();
    expect(await pending).toEqual({ ok: false, code: 'TEAM_REVISION_CONFLICT', retryable: true });
    expect(store.writes()).toBe(1);
    const reopened = await review(store.connect());
    expect(reopened.snapshot.members.map(m => m.memberFingerprint)).toEqual([b.memberFingerprint]);
    expect(await reopened.commit(a)).toEqual({ ok: true, changed: true, revision: 2 });
  });

  it('rechecks duplicate acceptance atomically and preserves revocation across reopen', async () => {
    const store = fixture();
    const command = invite(1);
    await (await review(store.connect())).commit(command);
    const previous = await review(store.connect());
    expect(await previous.commit(command)).toEqual({ ok: true, changed: false, revision: 1 });
    expect(store.writes()).toBe(1);
    expect(await previous.commit({ kind: 'revoke', memberFingerprint: command.memberFingerprint }))
      .toEqual({ ok: true, changed: true, revision: 2 });
    expect(await previous.commit(command)).toMatchObject({ ok: false, code: 'TEAM_REVISION_CONFLICT' });
    const reopened = await review(store.connect());
    expect(reopened.snapshot).toMatchObject({ revision: 2, membershipEpoch: 2, members: [] });
    expect(await reopened.commit(command)).toMatchObject({ ok: false, code: 'TEAM_EPOCH_STALE' });
    expect(store.writes()).toBe(2);
  });

  it('submits the exact parent and proposed revision to the owner check for every mutation', async () => {
    const store = fixture();
    const port = store.connect();
    const command = invite(1);
    const emptyHead = store.current();
    port.compareAndSwapOwnerReviewed.mockResolvedValueOnce('denied');
    expect(await (await review(port)).commit(command)).toMatchObject({ ok: false, code: 'TEAM_SCOPE_DENIED' });
    expect(port.compareAndSwapOwnerReviewed).toHaveBeenCalledWith(emptyHead,
      expect.objectContaining({ revision: 1, members: [expect.objectContaining({ memberFingerprint: command.memberFingerprint })] }),
      expect.any(Function));
    expect(store.current()).toEqual(emptyHead);
    await (await review(port)).commit(command);
    const activeHead = store.current();
    port.compareAndSwapOwnerReviewed.mockResolvedValue('denied');
    const active = await review(port);
    expect(await active.commit({ kind: 'revoke', memberFingerprint: command.memberFingerprint }))
      .toMatchObject({ ok: false, code: 'TEAM_SCOPE_DENIED' });
    expect(await active.commit(command)).toMatchObject({ ok: false, code: 'TEAM_SCOPE_DENIED' });
    expect(store.current()).toEqual(activeHead);
  });

  it('passes the candidate and head together so approval for A cannot commit B', async () => {
    const store = fixture();
    const port = store.connect();
    const swap = port.compareAndSwapOwnerReviewed.getMockImplementation()!;
    const active = await review(port);
    const approved = invite(1);
    const other = invite(2);
    // Record the exact offer shown for explicit approval, then replay that approval on each call.
    port.compareAndSwapOwnerReviewed.mockResolvedValueOnce('denied');
    await active.commit(approved);
    const [parent, candidate] = port.compareAndSwapOwnerReviewed.mock.calls[0]!;
    const approvedBytes = canonicalize(candidate);
    port.compareAndSwapOwnerReviewed.mockImplementation((head, next, guard) =>
      head.token === parent.token && canonicalize(next) === approvedBytes
        ? swap(head, next, guard) : Promise.resolve('denied'));
    expect(await active.commit(other)).toMatchObject({ ok: false, code: 'TEAM_SCOPE_DENIED' });
    expect(store.writes()).toBe(0);
    expect(await active.commit(approved)).toEqual({ ok: true, changed: true, revision: 1 });
    expect(await (await review(port)).commit(other)).toMatchObject({ ok: false, code: 'TEAM_SCOPE_DENIED' });
    expect(store.writes()).toBe(1);
  });

  it.each(['session', 'expiry', 'rollback'] as const)('checks %s at the point of write', async (mode) => {
    const store = fixture();
    const port = store.connect();
    const swap = port.compareAndSwapOwnerReviewed.getMockImplementation()!;
    port.compareAndSwapOwnerReviewed.mockImplementationOnce((...args) => {
      if (mode === 'session') port.isCurrent.mockReturnValue(false);
      else port.nowMs.mockReturnValue(mode === 'expiry' ? start + 100 : start - 1);
      return swap(...args);
    });
    expect(await (await review(port)).commit(invite(1))).toMatchObject({
      ok: false, code: mode === 'expiry' ? 'TEAM_INVITE_EXPIRED' : 'TEAM_SESSION_STALE',
    });
    expect(store.writes()).toBe(0);
  });

  it('requires a fresh read after either a failed write or a lost acknowledgement', async () => {
    const store = fixture();
    const port = store.connect();
    const command = invite(1);
    const original = store.current();
    port.compareAndSwapOwnerReviewed.mockRejectedValueOnce(new Error('fixture detail'));
    const first = await review(port);
    const unconfirmed = { ok: false, code: 'TEAM_COMMIT_UNCONFIRMED', retryable: false };
    expect(await first.commit(command)).toEqual(unconfirmed);
    expect(store.current()).toEqual(original);
    expect(await first.commit(command)).toEqual(unconfirmed);
    expect(port.compareAndSwapOwnerReviewed).toHaveBeenCalledTimes(1);
    const swap = port.compareAndSwapOwnerReviewed.getMockImplementation()!;
    port.compareAndSwapOwnerReviewed.mockImplementationOnce(async (...args) => {
      await swap(...args);
      throw new Error('acknowledgement lost');
    });
    expect(await (await review(port)).commit(command)).toEqual(unconfirmed);
    const reopened = await review(store.connect());
    expect(reopened.snapshot.revision).toBe(1);
    expect(await reopened.commit(command)).toEqual({ ok: true, changed: false, revision: 1 });
    expect(store.writes()).toBe(1);
  });

  it('keeps an unreadable or locked head out of the consumer', async () => {
    const port = fixture().connect();
    port.readAuthenticated.mockRejectedValueOnce(new Error('fixture detail'));
    expect(await openTeamMembershipReview(port)).toMatchObject({ ok: false, code: 'TEAM_STATE_UNAVAILABLE' });
    port.isCurrent.mockReturnValueOnce(true).mockReturnValue(false);
    expect(await openTeamMembershipReview(port)).toMatchObject({ ok: false, code: 'TEAM_SESSION_STALE' });
    expect(await openTeamMembershipReview(port)).toMatchObject({ ok: false, code: 'TEAM_SESSION_STALE' });
    expect(port.readAuthenticated).toHaveBeenCalledTimes(2);
  });

  it('requires the current authenticated checkpoint on reopen, including after revocation', async () => {
    const store = fixture();
    const command = invite(1);
    await (await review(store.connect())).commit(command);
    const prior = store.bytes();
    await (await review(store.connect())).commit({ kind: 'revoke', memberFingerprint: command.memberFingerprint });
    const latest = store.bytes();
    for (const replacement of [prior, latest.replace('team-a', 'team-b')]) {
      store.replaceBytes(replacement);
      expect(await openTeamMembershipReview(store.connect())).toMatchObject({ ok: false, code: 'TEAM_STATE_UNAVAILABLE' });
    }
    store.replaceBytes(latest);
    expect((await review(store.connect())).snapshot).toMatchObject({ revision: 2, membershipEpoch: 2, members: [] });
  });

  it('rejects an unknown action, invalid clock and stale session before asking to commit', async () => {
    const port = fixture().connect();
    const active = await review(port);
    const command = invite(1);
    expect(await active.commit({ ...command, kind: 'unknown' } as unknown as typeof command))
      .toMatchObject({ ok: false, code: 'TEAM_CHANGE_INVALID' });
    port.nowMs.mockReturnValueOnce(NaN);
    expect(await active.commit(command)).toMatchObject({ ok: false, code: 'TEAM_SESSION_STALE' });
    port.isCurrent.mockReturnValueOnce(false);
    expect(await active.commit(command)).toMatchObject({ ok: false, code: 'TEAM_SESSION_STALE' });
    expect(port.compareAndSwapOwnerReviewed).not.toHaveBeenCalled();
  });

  it('suppresses success and forces a reread if the session locks after the write', async () => {
    const store = fixture();
    const port = store.connect();
    const swap = port.compareAndSwapOwnerReviewed.getMockImplementation()!;
    port.compareAndSwapOwnerReviewed.mockImplementationOnce(async (...args) => {
      const outcome = await swap(...args);
      port.isCurrent.mockReturnValue(false);
      return outcome;
    });
    const active = await review(port);
    const command = invite(1);
    expect(await active.commit(command)).toEqual({ ok: false, code: 'TEAM_COMMIT_UNCONFIRMED', retryable: false });
    expect((await review(store.connect())).snapshot.revision).toBe(1);
  });

  it('matches a revision and epoch model across writers, revocations and restarts', async () => {
    await fc.assert(fc.asyncProperty(fc.array(fc.tuple(fc.integer({ min: 1, max: 4 }),
      fc.boolean(), fc.boolean()), { minLength: 1, maxLength: 20 }), async steps => {
      const store = fixture();
      let revision = 0;
      let epoch = 1;
      const members = new Map<number, number>();
      for (const [id, revoke, oldInvite] of steps) {
        const active = await review(store.connect());
        const signedEpoch = oldInvite ? 1 : epoch;
        const invitation = invite(id, signedEpoch);
        const result = await active.commit(revoke
          ? { kind: 'revoke', memberFingerprint: invitation.memberFingerprint } : invitation);
        if (revoke && members.has(id)) {
          members.delete(id); revision++; epoch++;
          expect(result).toEqual({ ok: true, changed: true, revision });
        } else if (!revoke && signedEpoch === epoch && !members.has(id)) {
          members.set(id, epoch); revision++;
          expect(result).toEqual({ ok: true, changed: true, revision });
        } else if (!revoke && signedEpoch === epoch && members.get(id) === epoch) {
          expect(result).toEqual({ ok: true, changed: false, revision });
        } else {
          expect(result.ok).toBe(false);
        }
        const restored = (await review(store.connect())).snapshot;
        expect(restored).toMatchObject({ revision, membershipEpoch: epoch });
        expect(restored.members.map(m => m.memberFingerprint))
          .toEqual([...members.keys()].map(n => n.toString(16).padStart(64, '0')));
      }
    }), { numRuns: 200, seed: 112354 });
  });
});
