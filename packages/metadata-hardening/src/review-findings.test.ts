/** Regression tests for findings from the independent AI review of commit 97cbaa6f. */
import { describe, expect, it } from 'vitest';
import { roundGross } from './amounts.js';
import { stripPsbtFingerprints, planChange } from './btc.js';
import { assertHardening, parseHardeningJson } from './catalogue.js';
import { deriveInvoiceKeyRange, deriveInvoiceKeys } from './derive.js';
import { assertOnlyAllowedTxFields, bucketGasLimit } from './gas.js';
import { MetadataHardeningError, parseEndpoint } from './guard.js';
import { RelayerPinning, validateRelayerUrls } from './release.js';
import { assertNoUserAddressFilter, roleForRequest } from './scan.js';
import { SEED, seededRng } from './testutil.testutil.js';
import { sriDigest, verifySri } from './web.js';

function codeOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof MetadataHardeningError) return e.code;
    throw e;
  }
  return 'NO_THROW';
}

const HEX40 = 'ab'.repeat(20);
const ME = `0x${HEX40}`;
const TOPIC = `${'0'.repeat(24)}${HEX40}`;

describe('review 1: the address filter fails closed on any non-canonical form', () => {
  it('detects an address or topic written with a 0X prefix', () => {
    expect(codeOf(() => assertNoUserAddressFilter({ address: `0X${HEX40}` }, [ME]))).toBe('POLICY_REJECTED');
    expect(codeOf(() => assertNoUserAddressFilter({ topics: [null, null, `0X${TOPIC}`] }, [ME]))).toBe('POLICY_REJECTED');
    expect(codeOf(() => assertNoUserAddressFilter({ address: ME }, [`0X${HEX40}`]))).toBe('POLICY_REJECTED');
    expect(roleForRequest('eth_getLogs', { address: `0X${HEX40}` }, [ME])).toBe('query');
  });
  it('rejects, instead of skipping, an address or topic that is not hex', () => {
    for (const address of [HEX40, 'not-an-address', `0x${HEX40}00`, `0x${HEX40.slice(2)}`, '']) {
      expect(codeOf(() => assertNoUserAddressFilter({ address }, [ME])), address).toBe('INVALID_INPUT');
      expect(roleForRequest('eth_getLogs', { address }, [ME])).toBe('query');
    }
    for (const topic of [TOPIC, 'not-hex', `0x${'g'.repeat(64)}`, `0x${'0'.repeat(65)}`]) {
      expect(codeOf(() => assertNoUserAddressFilter({ topics: [topic] }, [ME])), topic).toBe('INVALID_INPUT');
    }
    expect(codeOf(() => assertNoUserAddressFilter({ topics: ['0x01', '0xaa', null] }, [ME]))).toBe('NO_THROW');
  });
});

describe('review 2: results stay inside the value range of their type', () => {
  it('roundGross never returns more than uint256 max', () => {
    const max = (1n << 256n) - 1n;
    const r = roundGross(max, { chainId: 31337, amountPolicyMode: 'fiat_quote', maxSlippageBps: 10_000 });
    expect(r.amount <= max).toBe(true);
    expect(r.amount).toBe(max);
    const near = roundGross(max - 5n, { chainId: 31337, amountPolicyMode: 'fiat_quote', maxSlippageBps: 10_000 });
    expect(near.amount <= max && near.amount >= max - 5n).toBe(true);
  });
  it('bucketGasLimit refuses a result above 2^64-1', () => {
    expect(codeOf(() => bucketGasLimit((1n << 64n) - 1n, { chainId: 31337, headroomBps: 10_000 }))).toBe('LIMIT_EXCEEDED');
    expect(bucketGasLimit(10_000n, { chainId: 31337, headroomBps: 10_000 })).toBe(20_000n);
  });
});

describe('review 3: a malformed SRI token can never match', () => {
  it('rejects a token with text after the hash value', () => {
    const b = new Uint8Array([1, 2, 3]);
    const d = sriDigest(b);
    expect(verifySri(b, d)).toBe(true);
    expect(verifySri(b, `${d}-garbage`)).toBe(false);
    expect(verifySri(b, `${d}-`)).toBe(false);
    expect(verifySri(b, `${d}?ct=x`)).toBe(true);
  });
});

describe('review 4: optional arrays are not silently disabled by null', () => {
  it('planChange rejects inputAddresses: null', () => {
    const base = { network: 'regtest', inputTotalSats: 100_000n, amountSats: 1000n, feeSats: 100n, changeAddress: 'bcrt1qabc' };
    expect(codeOf(() => planChange({ ...base, inputAddresses: null as never }))).toBe('INVALID_INPUT');
    expect(codeOf(() => planChange({ ...base, inputAddresses: ['bcrt1qabc'] }))).toBe('INVALID_INPUT');
    expect(codeOf(() => planChange(base))).toBe('NO_THROW');
  });
});

describe('review 5: failover leaves no trace when it fails', () => {
  it('does not pin an unknown id when only one relayer exists', () => {
    const pin = new RelayerPinning(['https://a.example'], seededRng(1));
    for (let i = 0; i < 5000; i++) expect(codeOf(() => pin.failover(`s${i}`, true))).toBe('CONFLICT');
    expect(pin.assign('legit')).toBe('https://a.example');
  });
  it('refuses to pin a new id past the limit and changes nothing', () => {
    const pin = new RelayerPinning(['https://a.example', 'https://b.example'], seededRng(3));
    for (let i = 0; i < 4096; i++) pin.assign(`s${i}`);
    expect(codeOf(() => pin.failover('one-too-many', true))).toBe('LIMIT_EXCEEDED');
    expect(codeOf(() => pin.assign('one-too-many'))).toBe('LIMIT_EXCEEDED');
    expect(codeOf(() => pin.failover('s5', true))).toBe('NO_THROW'); // an existing pin can still move
  });
  it('fails over an id that was never assigned by pinning a random relayer, within the pin limit', () => {
    const pin = new RelayerPinning(['https://a.example', 'https://b.example'], seededRng(2));
    const first = pin.failover('new', true);
    expect(['https://a.example', 'https://b.example']).toContain(first);
    expect(pin.assign('new')).toBe(first);
  });
});

describe('review 6: byte arrays cannot be faked with a toStringTag', () => {
  it('rejects a Float64Array or DataView that claims to be a Uint8Array', () => {
    const fake = new Float64Array(32).fill(7.9);
    Object.defineProperty(fake, Symbol.toStringTag, { value: 'Uint8Array' });
    expect(codeOf(() => deriveInvoiceKeys(fake as never, 0))).toBe('INVALID_INPUT');
    const view = new DataView(new ArrayBuffer(48));
    Object.defineProperty(view, Symbol.toStringTag, { value: 'Uint8Array' });
    expect(codeOf(() => sriDigest(view as never))).toBe('INVALID_INPUT');
    expect(codeOf(() => deriveInvoiceKeys(new Uint8Array(32).fill(1), 0))).toBe('NO_THROW');
    expect(codeOf(() => deriveInvoiceKeys(Buffer.alloc(32, 1), 0))).toBe('NO_THROW');
  });
});

describe('review 7: deriveInvoiceKeyRange validates even for an empty range', () => {
  it('checks seed, chain and signer mode when count is 0', () => {
    expect(codeOf(() => deriveInvoiceKeyRange('nope' as never, 0, 0))).toBe('INVALID_INPUT');
    expect(codeOf(() => deriveInvoiceKeyRange(SEED, 0, 0, { chainId: 1 }))).toBe('UNSUPPORTED_CHAIN');
    expect(codeOf(() => deriveInvoiceKeyRange(SEED, 0, 0, { signerMode: 'x' as never }))).toBe('INVALID_INPUT');
    expect(codeOf(() => deriveInvoiceKeyRange(SEED, 0, 0, { signerMode: 'per-chain' }))).toBe('INVALID_INPUT');
    expect(deriveInvoiceKeyRange(SEED, 0, 0, { chainId: 31337 })).toEqual([]);
  });
});

describe('review 9-10: settings loading is explicit about "nothing" and consistent about codes', () => {
  it('parseHardeningJson requires a JSON object (null is not "no settings")', () => {
    expect(codeOf(() => parseHardeningJson('null'))).toBe('INVALID_INPUT');
    expect(codeOf(() => parseHardeningJson('{}'))).toBe('NO_THROW');
  });
  it('a malformed tagMode is INVALID_INPUT everywhere, not CONFLICT in one path', () => {
    expect(codeOf(() => assertHardening({ enabled: {} as never, tagMode: 'banana' }))).toBe('INVALID_INPUT');
  });
});

describe('review 11: a rejected tx field is named only when it is a known transaction field', () => {
  it('echoes known fee/type fields and withholds everything else', () => {
    for (const f of ['maxFeePerGas', 'maxPriorityFeePerGas', 'gasPrice', 'nonce', 'type', 'accessList', 'authorizationList', 'blobVersionedHashes']) {
      expect(() => assertOnlyAllowedTxFields({ [f]: 1 })).toThrow(`tx field not allowed: ${f}`);
    }
    for (const f of ['a1b2c3d4e5f60718293a4b5c6d7e8f90', 'mySecretToken', 'x']) {
      try {
        assertOnlyAllowedTxFields({ [f]: 1 });
        expect.unreachable();
      } catch (e) {
        expect((e as Error).message).toBe('tx field not allowed: (name withheld)');
      }
    }
  });
});

describe('review (smaller): strictness and compatibility', () => {
  it('parseEndpoint rejects an empty query or fragment marker', () => {
    expect(codeOf(() => parseEndpoint('https://rpc.example/key?'))).toBe('INVALID_INPUT');
    expect(codeOf(() => parseEndpoint('https://rpc.example/key#'))).toBe('INVALID_INPUT');
  });
  it('arrays with holes are rejected', () => {
    // eslint-disable-next-line no-sparse-arrays
    expect(codeOf(() => validateRelayerUrls([, 'https://a.example'] as never))).toBe('INVALID_INPUT');
    expect(codeOf(() => stripPsbtFingerprints('regtest', { global: [], inputs: new Array(2) as never, outputs: [] }))).toBe('INVALID_INPUT');
  });
  it('PSBT: any compact-size key type is accepted (unknown ones are dropped); key and value must be hex', () => {
    const r = stripPsbtFingerprints('regtest', { global: [{ keyType: 300, key: '', value: '' }, { keyType: 0xfc, key: 'aabb', value: '' }, { keyType: 0, key: '', value: 'aa' }], inputs: [], outputs: [] });
    expect(r.psbt.global.map((x) => x.keyType)).toEqual([0]);
    expect(r.removed).toBe(2);
    for (const bad of [{ keyType: 0x1_0000_0000, key: '', value: '' }, { keyType: 0, key: 'zz<>', value: '' }, { keyType: 0, key: '', value: 'abc' }]) {
      expect(codeOf(() => stripPsbtFingerprints('regtest', { global: [bad], inputs: [], outputs: [] }))).toBe('INVALID_INPUT');
    }
  });
});
