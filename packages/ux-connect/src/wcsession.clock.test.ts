import { describe, expect, it } from 'vitest';
import { buildRequest, emptyPending, sweepExpired, type Session } from './wcsession.js';

const session: Session = {
  topic: 'a'.repeat(64),
  origin: 'https://pay.example',
  peerOrigin: null,
  chains: ['eip155:1'],
  accounts: ['eip155:1:0x' + 'a'.repeat(40)],
  methods: ['eth_chainId'],
  createdAtSec: 1000,
  expirySec: 1001,
};

const requestAt = (nowMs: number) =>
  buildRequest({
    session,
    origin: session.origin,
    chain: 'eip155:1',
    method: 'eth_chainId',
    params: [],
    id: 1,
    nowMs,
    pending: emptyPending,
  });

describe('WalletConnect request clock boundary', () => {
  it('rejects malformed clocks before producing a pending request', () => {
    const invalid: unknown[] = [
      NaN,
      Infinity,
      -Infinity,
      -1,
      -0.5,
      0.5,
      1_000_000.25,
      Number.MAX_SAFE_INTEGER + 1,
      '1000000',
      null,
      undefined,
    ];
    for (const clock of invalid) {
      expect(requestAt(clock as number), String(clock)).toEqual({
        ok: false,
        error: { code: -32602, message: 'bad request clock' },
      });
    }
    expect(emptyPending.size).toBe(0);
  });

  it('creates a finite request for a valid millisecond clock and expires it normally', () => {
    for (const nowMs of [0, 999_999, 1_000_000, 1_000_999]) {
      const built = requestAt(nowMs);
      expect(built.ok, String(nowMs)).toBe(true);
      if (!built.ok) continue;
      expect(built.value.request.createdAtMs).toBe(nowMs);
      expect(built.value.request.expiresAtMs).toBe(Math.min(nowMs + 300_000, 1_001_000));
      expect(sweepExpired(built.value.pending, 1_001_000)).toMatchObject({
        expired: [1],
        pending: new Map(),
      });
    }
  });

  it('does not create a pending request at or after session expiry', () => {
    for (const nowMs of [1_001_000, 1_001_001, 1_002_000]) {
      expect(requestAt(nowMs)).toMatchObject({ ok: false });
    }
  });
});
