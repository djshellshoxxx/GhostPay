import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { TESTNET_CHAIN_IDS as CLIENT_TESTNETS } from '@ghostpay/scan-source';
import { describe, expect, it } from 'vitest';
import { ANNOUNCEMENT_TOPIC, TESTNET_CHAIN_IDS, WIRE_ERRORS, assertQueryLimits, parseLogsQuery, type QueryLimits } from './wire.js';

const L: QueryLimits = { chainId: 31337, alignBlocks: 1000, maxWindowBlocks: 2000, maxPageSize: 1000, defaultPageSize: 500, maxResponseBytes: 8 << 20 };
const code = (s: string, l: QueryLimits = L): string => {
  const r = parseLogsQuery(s, l);
  return r.ok ? 'ok' : r.code;
};

describe('wire contract v1', () => {
  it('topic 0 is keccak256 of the ERC-5564 Announcement signature', () => {
    expect(ANNOUNCEMENT_TOPIC).toBe(`0x${bytesToHex(keccak_256(utf8ToBytes('Announcement(uint256,address,address,bytes,bytes)')))}`);
  });
  it('testnet chain ids equal the reference client list', () => {
    expect([...TESTNET_CHAIN_IDS]).toEqual([...CLIENT_TESTNETS]);
  });
  it('accepts exactly the reference client request shape', () => {
    expect(parseLogsQuery('chainId=31337&from=1000&to=1999&pageSize=1000', L)).toEqual({ ok: true, query: { chainId: 31337, from: 1000n, to: 1999n, pageSize: 1000 } });
    expect(parseLogsQuery('to=2999&from=1000&chainId=31337', L)).toEqual({ ok: true, query: { chainId: 31337, from: 1000n, to: 2999n, pageSize: 500 } });
    expect(parseLogsQuery('chainId=31337&from=1000&to=1999&cursor=1500', L)).toEqual({ ok: true, query: { chainId: 31337, from: 1000n, to: 1999n, pageSize: 500, cursor: 1500n } });
  });
  it('rejects unknown parameters, including per-user filters, before anything else', () => {
    for (const p of ['viewTag=ab', 'address=0x00', 'stealthAddress=1', 'schemeId=1', 'caller=1', 'key=1', 'tag']) {
      expect(code(`chainId=31337&from=0&to=999&${p}`), p).toBe('UNKNOWN_PARAMETER');
    }
    expect(code('chainId=31337&from=0&to=999&')).toBe('UNKNOWN_PARAMETER'); // empty key
    expect(code('chainId=31337&from=0&to=999&chainId')).toBe('BAD_REQUEST'); // duplicate
    expect(code('chainid=31337&from=0&to=999')).toBe('UNKNOWN_PARAMETER');
  });
  it('rejects malformed values: empty, duplicate, encoded, signed, non-canonical, oversized', () => {
    for (const s of [
      '',
      'chainId=31337&from=0',
      'chainId=31337&from=0&to=',
      'chainId=31337&from=0&from=0&to=999',
      'chainId=31337&from=0&to=%39%39%39',
      'chainId=31337&from=+0&to=999',
      'chainId=31337&from=-0&to=999',
      'chainId=31337&from=00&to=999',
      'chainId=31337&from=0x0&to=999',
      'chainId=31337&from=0&to=999&pageSize=1e3',
      'chainId=31337&from=0&to=999999999999999999999',
      'chainId=31337&from=1000&to=999',
      'chainId=31337&from=0&to=18446744073709551615',
      'chainId=31337&from=0&to=999&cursor=0',
      'chainId=31337&from=0&to=999&cursor=1000',
    ]) {
      expect(code(s), s).toBe('BAD_REQUEST');
    }
  });
  it('rejects another chain, oversized and misaligned windows, and out-of-range page sizes', () => {
    expect(code('chainId=1&from=0&to=999')).toBe('CHAIN_NOT_SERVED');
    expect(code('chainId=84532&from=0&to=999')).toBe('CHAIN_NOT_SERVED');
    expect(code('chainId=31337&from=0&to=2999')).toBe('WINDOW_TOO_LARGE');
    expect(code('chainId=31337&from=1000&to=99999')).toBe('WINDOW_TOO_LARGE');
    expect(code('chainId=31337&from=1200&to=1999')).toBe('WINDOW_NOT_ALIGNED');
    expect(code('chainId=31337&from=1000&to=1700')).toBe('WINDOW_NOT_ALIGNED');
    expect(code('chainId=31337&from=0&to=999&pageSize=0')).toBe('PAGE_SIZE_OUT_OF_RANGE');
    expect(code('chainId=31337&from=0&to=999&pageSize=1001')).toBe('PAGE_SIZE_OUT_OF_RANGE');
    expect(code('chainId=31337&from=5&to=5', { ...L, alignBlocks: 1 })).toBe('ok');
  });
  it('every error code has a fixed message and a 4xx/5xx status', () => {
    for (const [k, v] of Object.entries(WIRE_ERRORS)) {
      expect(v.status, k).toBeGreaterThanOrEqual(400);
      expect(v.message).not.toMatch(/[0-9]{3,}|0x/);
    }
  });
  it('limit validation', () => {
    expect(() => assertQueryLimits(L)).not.toThrow();
    for (const bad of [
      { chainId: 1 },
      { alignBlocks: 0 },
      { maxWindowBlocks: 999 },
      { maxPageSize: 0 },
      { defaultPageSize: 1001 },
      { maxResponseBytes: 1024 },
      { alignBlocks: 1.5 },
    ]) {
      expect(() => assertQueryLimits({ ...L, ...bad }), JSON.stringify(bad)).toThrow(RangeError);
    }
  });
});
