import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  acceptResponse,
  allowedMethods,
  buildProposal,
  buildRequest,
  CURRENT_DISCLOSURE_VERSION,
  emptyPending,
  isAllowedMethod,
  isSessionExpired,
  parseAccount,
  parseChainId,
  parseOrigin,
  parsePairingUri,
  redactPairingUri,
  relayGate,
  settleSession,
  sweepExpired,
  validateParams,
  type PendingTable,
  type RelaySettings,
  type Session,
} from './wcsession.js';
import { ADDR_A, ADDR_B, KEY, SIG, TOPIC } from './fixtures.testutil.js';

const ORIGIN = 'https://pay.example';
const NOW = 1_000_000; // seconds
const NOW_MS = NOW * 1000;
const CHAIN = 'eip155:1';

const proposal = (): ReturnType<typeof buildProposal> extends infer R
  ? R extends { ok: true; value: infer V }
    ? V
    : never
  : never => {
  const p = buildProposal(1);
  if (!p.ok) throw new Error('x');
  return p.value;
};
const settled = (o: Record<string, unknown> = {}): unknown => ({
  eip155: {
    chains: [CHAIN],
    methods: [...allowedMethods, 'eth_sign'],
    events: ['chainChanged'],
    accounts: [`${CHAIN}:${ADDR_A.toUpperCase().replace('0X', '0x')}`],
    ...o,
  },
});
function session(over: Record<string, unknown> = {}): Session {
  const r = settleSession({
    topic: TOPIC,
    origin: ORIGIN,
    requested: proposal(),
    settled: settled(),
    peerUrl: 'https://wallet.example/app',
    nowSec: NOW,
    expirySec: NOW + 3600,
    ...over,
  });
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
}
const req = (
  s: Session,
  method: unknown,
  params: unknown,
  id = 1,
  pending: PendingTable = emptyPending,
  extra: Record<string, unknown> = {},
) =>
  buildRequest({
    session: s,
    origin: ORIGIN,
    chain: CHAIN,
    method,
    params,
    id,
    nowMs: NOW_MS,
    pending,
    ...extra,
  });

describe('primitives', () => {
  it('chain / account parsing', () => {
    expect(parseChainId('eip155:1')).toBe(1);
    for (const x of ['eip155:0', 'eip155:01', 'eip155:1:2', 'solana:1', 'eip155:99999999999999999', 7, null])
      expect(parseChainId(x)).toBeNull();
    expect(parseAccount(`eip155:1:${ADDR_A}`)).toEqual({ chain: 'eip155:1', address: ADDR_A });
    for (const x of ['nocolon', 'eip155:1:0x12', `bad:${ADDR_A}`, 5]) expect(parseAccount(x)).toBeNull();
  });
  it('origin parsing', () => {
    expect(parseOrigin('https://pay.example/path?q=1')).toBe(ORIGIN);
    expect(parseOrigin('http://pay.example')).toBeNull();
    expect(parseOrigin('http://localhost:5173')).toBeNull();
    expect(parseOrigin('http://localhost:5173', { allowInsecureLocalhost: true })).toBe(
      'http://localhost:5173',
    );
    expect(parseOrigin('http://127.0.0.1:1', { allowInsecureLocalhost: true })).toBe('http://127.0.0.1:1');
    expect(parseOrigin('http://evil.example', { allowInsecureLocalhost: true })).toBeNull();
    for (const x of [
      'https://u:p@pay.example',
      'javascript:alert(1)',
      'not a url',
      'https://a.example/' + 'x'.repeat(3000),
      5,
    ])
      expect(parseOrigin(x)).toBeNull();
  });
  it('allowlist is exact', () => {
    expect(allowedMethods).toHaveLength(5);
    expect(isAllowedMethod('eth_sendTransaction')).toBe(true);
    for (const m of [
      'eth_sign',
      'personal_sign',
      'ETH_CHAINID',
      'eth_sendRawTransaction',
      'eth_signTypedData',
      'eth_signTypedData_v3',
      '',
      null,
      'constructor',
      '__proto__',
    ])
      expect(isAllowedMethod(m)).toBe(false);
  });
  it('buildProposal', () => {
    expect(proposal().eip155.methods).toEqual([...allowedMethods]);
    expect(buildProposal(0).ok).toBe(false);
  });
});

describe('settleSession', () => {
  it('normalises accounts, strips unrequested methods, pins peer origin', () => {
    const s = session();
    expect(s.accounts).toEqual([`${CHAIN}:${ADDR_A}`]);
    expect(s.methods).not.toContain('eth_sign' as never);
    expect(s.methods).toHaveLength(5);
    expect(s.peerOrigin).toBe('https://wallet.example');
  });
  it('no or invalid peerUrl -> null', () => {
    const r1 = settleSession({
      topic: TOPIC,
      origin: ORIGIN,
      requested: proposal(),
      settled: settled(),
      nowSec: NOW,
      expirySec: NOW + 10,
    });
    expect(r1.ok && r1.value.peerOrigin).toBeNull();
    expect(session({ peerUrl: 'http://wallet.example' }).peerOrigin).toBeNull();
  });
  const fail = (o: Record<string, unknown>, code: number) => {
    const r = settleSession({
      topic: TOPIC,
      origin: ORIGIN,
      requested: proposal(),
      settled: settled(),
      nowSec: NOW,
      expirySec: NOW + 10,
      ...o,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe(code);
  };
  it('rejects bad topic/origin/expiry', () => {
    fail({ topic: 'xyz' }, -32602);
    fail({ topic: 5 }, -32602);
    fail({ origin: 'http://evil.example' }, -32602);
    fail({ expirySec: NOW }, -32602);
    fail({ expirySec: 'soon' }, -32602);
    fail({ expirySec: NOW + 8 * 24 * 3600 }, -32602);
  });
  it('rejects bad namespaces', () => {
    fail({ settled: {} }, 5100);
    fail({ settled: { eip155: { chains: [CHAIN], methods: 'x', accounts: [] } } }, 5100);
    fail({ settled: settled({ chains: ['eip155:137'] }) }, 5100);
    fail({ settled: settled({ chains: [] }) }, 5100);
    fail({ settled: settled({ chains: [CHAIN, 'eip155:10'] }) }, 5100);
    fail({ settled: settled({ chains: [5] }) }, 5100);
    fail({ settled: settled({ methods: ['eth_chainId'] }) }, 5101);
    fail({ settled: settled({ methods: ['eth_sendTransaction'] }) }, 5101);
    fail({ settled: settled({ accounts: [] }) }, 5102);
    fail({ settled: settled({ accounts: ['junk'] }) }, 5102);
    fail({ settled: settled({ accounts: [`eip155:10:${ADDR_A}`] }) }, 5102);
  });
  it('expiry', () => {
    const s = session();
    expect(isSessionExpired(s, NOW + 3599)).toBe(false);
    expect(isSessionExpired(s, NOW + 3600)).toBe(true);
  });
});

describe('buildRequest', () => {
  const s = session();
  const tx = { from: ADDR_A, to: ADDR_B, value: '0x10', data: '0x', chainId: '0x1' };
  it('T-1: eth_sign and other unknown methods rejected with 4200', () => {
    for (const m of [
      'eth_sign',
      'personal_sign',
      'wallet_addEthereumChain',
      'eth_signTransaction',
      5,
      undefined,
    ]) {
      const r = req(s, m, []);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.error).toEqual({ code: 4200, message: 'method not allowed' });
    }
  });
  it('accepts valid tx, tracks pending, caps expiry at session expiry', () => {
    const r = req(s, 'eth_sendTransaction', [tx]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.request.expiresAtMs).toBe(NOW_MS + 300_000);
    expect(r.value.pending.size).toBe(1);
    expect(emptyPending.size).toBe(0); // input not mutated
    const short = session({ expirySec: NOW + 60 });
    const r2 = req(short, 'eth_chainId', undefined);
    expect(r2.ok && r2.value.request.expiresAtMs).toBe((NOW + 60) * 1000);
  });
  it('origin binding', () => {
    const r = buildRequest({
      session: s,
      origin: 'https://evil.example',
      chain: CHAIN,
      method: 'eth_chainId',
      id: 1,
      nowMs: NOW_MS,
      pending: emptyPending,
    });
    expect(r).toEqual({ ok: false, error: { code: -32602, message: 'origin mismatch' } });
  });
  it('expired session, wrong chain, ungranted method, ids, ttl', () => {
    expect(
      buildRequest({
        session: s,
        origin: ORIGIN,
        chain: CHAIN,
        method: 'eth_chainId',
        id: 1,
        nowMs: (NOW + 3600) * 1000,
        pending: emptyPending,
      }).ok,
    ).toBe(false);
    expect(
      buildRequest({
        session: s,
        origin: ORIGIN,
        chain: 'eip155:10',
        method: 'eth_chainId',
        id: 1,
        nowMs: NOW_MS,
        pending: emptyPending,
      }).ok,
    ).toBe(false);
    const narrow = { ...s, methods: ['eth_chainId'] as Session['methods'] };
    expect(
      buildRequest({
        session: narrow,
        origin: ORIGIN,
        chain: CHAIN,
        method: 'eth_accounts',
        id: 1,
        nowMs: NOW_MS,
        pending: emptyPending,
      }),
    ).toMatchObject({ error: { code: 5101 } });
    for (const id of [0, -1, 1.5, NaN]) expect(req(s, 'eth_chainId', [], id).ok).toBe(false);
    const first = req(s, 'eth_chainId', []);
    if (!first.ok) throw new Error('x');
    expect(req(s, 'eth_chainId', [], 1, first.value.pending).ok).toBe(false);
    expect(req(s, 'eth_chainId', [], 2, emptyPending, { ttlMs: 0 }).ok).toBe(false);
    expect(req(s, 'eth_chainId', [], 2, emptyPending, { ttlMs: 10 }).ok).toBe(true);
  });
  const bad = (method: Parameters<typeof validateParams>[2], params: unknown) =>
    expect(validateParams(s, CHAIN, method, params).ok).toBe(false);
  it('validateParams: read methods', () => {
    expect(validateParams(s, CHAIN, 'eth_accounts', []).ok).toBe(true);
    bad('eth_accounts', [1]);
    bad('eth_chainId', 'x');
    bad('eth_chainId', {});
  });
  it('validateParams: switch chain only inside session', () => {
    expect(validateParams(s, CHAIN, 'wallet_switchEthereumChain', [{ chainId: '0x1' }]).ok).toBe(true);
    expect(validateParams(s, CHAIN, 'wallet_switchEthereumChain', [{ chainId: '0x89' }])).toMatchObject({
      error: { code: 5100 },
    });
    bad('wallet_switchEthereumChain', [{ chainId: '0x1', extra: 1 }]);
    bad('wallet_switchEthereumChain', [{ chainId: '1' }]);
    bad('wallet_switchEthereumChain', []);
  });
  it('validateParams: tx strictness', () => {
    expect(validateParams(s, CHAIN, 'eth_sendTransaction', [{ from: ADDR_A, to: ADDR_B }]).ok).toBe(true);
    expect(
      validateParams(s, CHAIN, 'eth_sendTransaction', [
        { ...tx, from: ADDR_A.toUpperCase().replace('0X', '0x') },
      ]).ok,
    ).toBe(true);
    bad('eth_sendTransaction', [{ ...tx, from: ADDR_B }]);
    bad('eth_sendTransaction', [{ ...tx, from: 'junk' }]);
    bad('eth_sendTransaction', [{ from: ADDR_A, value: '0x1' }]); // creation
    bad('eth_sendTransaction', [{ ...tx, to: '0x12' }]);
    bad('eth_sendTransaction', [{ ...tx, data: '0xabc' }]);
    bad('eth_sendTransaction', [{ ...tx, value: '16' }]);
    bad('eth_sendTransaction', [{ ...tx, value: '0x010' }]);
    bad('eth_sendTransaction', [{ ...tx, chainId: '0x89' }]);
    bad('eth_sendTransaction', [{ ...tx, gasPrice2: '0x1' }]);
    bad('eth_sendTransaction', [{ ...tx, authorizationList: [] }]);
    bad('eth_sendTransaction', [tx, tx]);
    bad('eth_sendTransaction', ['str']);
  });
  const td = (chainId: unknown) =>
    JSON.stringify({ domain: { chainId }, primaryType: 'Permit', types: { Permit: [] }, message: {} });
  it('validateParams: typed data', () => {
    expect(validateParams(s, CHAIN, 'eth_signTypedData_v4', [ADDR_A, td(1)]).ok).toBe(true);
    expect(validateParams(s, CHAIN, 'eth_signTypedData_v4', [ADDR_A, td('0x1')]).ok).toBe(true);
    bad('eth_signTypedData_v4', [ADDR_A, td(5)]);
    bad('eth_signTypedData_v4', [ADDR_A, td('zz')]);
    bad('eth_signTypedData_v4', [ADDR_B, td(1)]);
    bad('eth_signTypedData_v4', [ADDR_A]);
    bad('eth_signTypedData_v4', [ADDR_A, { not: 'string' }]);
    bad('eth_signTypedData_v4', [ADDR_A, 'x'.repeat(70_000)]);
    bad('eth_signTypedData_v4', [ADDR_A, '{bad']);
    bad('eth_signTypedData_v4', [ADDR_A, '[]']);
    bad('eth_signTypedData_v4', [ADDR_A, JSON.stringify({ domain: { chainId: 1 }, types: {}, message: {} })]);
  });
});

describe('acceptResponse', () => {
  const s = session();
  const mk = (method: string, params: unknown, id = 1) => {
    const r = req(s, method, params, id);
    if (!r.ok) throw new Error(r.error.message);
    return r.value.pending;
  };
  const acc = (
    pending: PendingTable,
    response: unknown,
    nowMs = NOW_MS + 1,
    over: Record<string, unknown> = {},
  ) => acceptResponse({ session: s, topic: TOPIC, response, pending, nowMs, ...over });
  const H = '0x' + 'AB'.repeat(32);

  it('T-2 send tx returns lowercase hash and clears pending', () => {
    const p = mk('eth_sendTransaction', [{ from: ADDR_A, to: ADDR_B }]);
    const r = acc(p, { id: 1, result: H });
    expect(r.ok && r.value.outcome).toEqual({
      kind: 'result',
      id: 1,
      method: 'eth_sendTransaction',
      value: H.toLowerCase(),
    });
    expect(r.ok && r.value.pending.size).toBe(0);
    expect(p.size).toBe(1);
  });
  it('rejects non-hash results', () => {
    const p = mk('eth_sendTransaction', [{ from: ADDR_A, to: ADDR_B }]);
    for (const result of ['0x12', null, 5, { hash: H }]) expect(acc(p, { id: 1, result }).ok).toBe(false);
  });
  it('T-3 chain mismatch', () => {
    const p = mk('eth_chainId', []);
    expect(acc(p, { id: 1, result: '0x1' }).ok).toBe(true);
    expect(acc(p, { id: 1, result: '0x89' })).toMatchObject({
      ok: false,
      error: { message: 'chain-mismatch' },
    });
    expect(acc(p, { id: 1, result: 1 }).ok).toBe(false);
  });
  it('accounts must stay inside session', () => {
    const p = mk('eth_accounts', []);
    const ok1 = acc(p, { id: 1, result: [ADDR_A.toUpperCase().replace('0X', '0x')] });
    expect(ok1.ok && ok1.value.outcome).toMatchObject({ value: [ADDR_A] });
    expect(acc(p, { id: 1, result: [ADDR_B] }).ok).toBe(false);
    expect(acc(p, { id: 1, result: [] }).ok).toBe(false);
    expect(acc(p, { id: 1, result: 'x' }).ok).toBe(false);
  });
  it('typed-data signature and switch chain', () => {
    const p = mk('eth_signTypedData_v4', [
      ADDR_A,
      JSON.stringify({ domain: { chainId: 1 }, primaryType: 'P', types: { P: [] }, message: {} }),
    ]);
    expect(acc(p, { id: 1, result: SIG }).ok).toBe(true);
    expect(acc(p, { id: 1, result: '0x' + '11'.repeat(32) })).toMatchObject({ ok: false });
    const q = mk('wallet_switchEthereumChain', [{ chainId: '0x1' }]);
    expect(acc(q, { id: 1, result: null }).ok).toBe(true);
    expect(acc(q, { id: 1, result: true }).ok).toBe(false);
  });
  it('errors map to rejected; messages truncated; defaults', () => {
    const p = mk('eth_chainId', []);
    const r = acc(p, { id: 1, error: { code: 5000, message: 'x'.repeat(500) } });
    expect(r.ok && r.value.outcome.kind === 'rejected' && r.value.outcome.error.message.length).toBe(200);
    expect(acc(p, { id: 1, error: 'str' })).toMatchObject({
      value: { outcome: { kind: 'rejected', error: { code: 4001, message: 'rejected' } } },
    });
  });
  it('expired pending is reported and removed', () => {
    const p = mk('eth_chainId', []);
    const r = acc(p, { id: 1, result: '0x1' }, NOW_MS + 300_000);
    expect(r.ok && r.value.outcome).toEqual({ kind: 'expired', id: 1 });
    expect(r.ok && r.value.pending.size).toBe(0);
  });
  it('rejects wrong topic, unknown id, replay, malformed, peer origin change', () => {
    const p = mk('eth_chainId', []);
    expect(acc(p, { id: 1, result: '0x1' }, NOW_MS, { topic: 'ff'.repeat(32) }).ok).toBe(false);
    expect(acc(p, { id: 2, result: '0x1' }).ok).toBe(false);
    const first = acc(p, { id: 1, result: '0x1' });
    if (!first.ok) throw new Error('x');
    expect(acc(first.value.pending, { id: 1, result: '0x1' }).ok).toBe(false); // replay
    for (const bad of [null, 'x', [], { id: '1' }, {}]) expect(acc(p, bad).ok).toBe(false);
    expect(acc(p, { id: 1, result: '0x1' }, NOW_MS, { peerUrl: 'https://other.example' })).toMatchObject({
      error: { message: 'peer origin changed' },
    });
    expect(acc(p, { id: 1, result: '0x1' }, NOW_MS, { peerUrl: 'https://wallet.example/x' }).ok).toBe(true);
  });
  it('peer check is skipped when no origin was pinned', () => {
    const s2 = session({ peerUrl: undefined });
    const r = buildRequest({
      session: s2,
      origin: ORIGIN,
      chain: CHAIN,
      method: 'eth_chainId',
      id: 1,
      nowMs: NOW_MS,
      pending: emptyPending,
    });
    if (!r.ok) throw new Error('x');
    expect(
      acceptResponse({
        session: s2,
        topic: TOPIC,
        response: { id: 1, result: '0x1' },
        pending: r.value.pending,
        nowMs: NOW_MS,
        peerUrl: 'https://anything.example',
      }).ok,
    ).toBe(true);
  });
  it('sweepExpired', () => {
    const a = mk('eth_chainId', [], 1);
    const b = buildRequest({
      session: s,
      origin: ORIGIN,
      chain: CHAIN,
      method: 'eth_chainId',
      id: 2,
      nowMs: NOW_MS + 200_000,
      pending: a,
    });
    if (!b.ok) throw new Error('x');
    const r = sweepExpired(b.value.pending, NOW_MS + 300_000);
    expect(r.expired).toEqual([1]);
    expect([...r.pending.keys()]).toEqual([2]);
  });
});

describe('pairing URI', () => {
  const uri = `wc:${TOPIC}@2?relay-protocol=irn&symKey=${KEY}`;
  it('parses and redacts', () => {
    expect(parsePairingUri(uri)).toEqual({
      ok: true,
      value: { topic: TOPIC, version: 2, relayProtocol: 'irn', symKey: KEY, expiryTimestamp: null },
    });
    const e = parsePairingUri(uri + '&expiryTimestamp=1900000000');
    expect(e.ok && e.value.expiryTimestamp).toBe(1_900_000_000);
    expect(redactPairingUri(uri)).not.toContain(KEY);
    expect(redactPairingUri(uri)).toContain('symKey=REDACTED');
  });
  it('rejects malformed', () => {
    for (const u of [
      5,
      'x'.repeat(2000),
      `wc:${TOPIC}@1?relay-protocol=irn&symKey=${KEY}`,
      `wc:xyz@2?relay-protocol=irn&symKey=${KEY}`,
      `wc:${TOPIC}@2?relay-protocol=evil&symKey=${KEY}`,
      `wc:${TOPIC}@2?relay-protocol=irn&symKey=short`,
      `wc:${TOPIC}@2?relay-protocol=irn`,
      `${uri}&symKey=${KEY}`,
      `${uri}&callback=https://evil.example`,
      `${uri}&expiryTimestamp=abc`,
      `https://x.example/?${uri}`,
    ])
      expect(parsePairingUri(u).ok).toBe(false);
    expect(parsePairingUri(`${uri}&methods=eth_sign`).ok).toBe(true); // informational, ignored
  });
  it('property: arbitrary strings never throw', () => {
    fc.assert(
      fc.property(fc.string(), (x) => {
        parsePairingUri(x);
        parseOrigin(x);
        return true;
      }),
    );
  });
});

describe('relayGate (WALLE-3/4, T-4)', () => {
  const good: RelaySettings = {
    optedIn: true,
    disclosureAcked: CURRENT_DISCLOSURE_VERSION,
    relayUrl: 'wss://relay.example:443/path',
    projectId: 'a'.repeat(32),
  };
  it('ok only when everything is set', () => {
    expect(relayGate(good)).toBe('ok');
  });
  it('default off and each missing piece blocks', () => {
    expect(relayGate({ optedIn: false, disclosureAcked: null, relayUrl: null, projectId: null })).toBe(
      'not-opted-in',
    );
    expect(relayGate({ ...good, optedIn: false })).toBe('not-opted-in');
    expect(relayGate({ ...good, disclosureAcked: null })).toBe('disclosure-required');
    expect(relayGate({ ...good, disclosureAcked: CURRENT_DISCLOSURE_VERSION - 1 })).toBe(
      'disclosure-required',
    );
    expect(relayGate({ ...good, relayUrl: null })).toBe('relay-not-configured');
    expect(relayGate({ ...good, projectId: null })).toBe('relay-not-configured');
    expect(relayGate({ ...good, relayUrl: 'ws://relay.example' })).toBe('bad-relay-url');
    expect(relayGate({ ...good, relayUrl: 'wss://user:pw@relay.example' })).toBe('bad-relay-url');
    expect(relayGate({ ...good, relayUrl: 'wss://relay.example?x=1' })).toBe('bad-relay-url');
    expect(relayGate({ ...good, projectId: 'nothex' })).toBe('bad-project-id');
  });
});
