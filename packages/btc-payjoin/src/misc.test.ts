import { describe, expect, it } from 'vitest';
import { PayjoinError, mapRemoteError, toRemoteErrorCode } from './errors.js';
import { BTC_MODE_INFO } from './modes.js';
import { addressToScript, assertNetwork, netParams } from './network.js';
import { DEFAULT_PARAMS, parseParams, serializeParams, withDefaults } from './params.js';
import { secureUnit } from './rng.js';
import { estimateInputVsize, inputOutpoint, parsePsbt, sameBytes, MAX_PSBT_BASE64 } from './psbt.js';
import { addressFor, key } from './fixtures.testutil.js';

const codeOf = (f: () => unknown): string => {
  try {
    f();
    return 'none';
  } catch (e) {
    return (e as { code?: string }).code ?? 'other';
  }
};

describe('errors', () => {
  it('maps remote codes; unknown text never passes through', () => {
    expect(mapRemoteError('unavailable')).toBe('unavailable');
    expect(mapRemoteError('not-enough-money')).toBe('not_enough_money');
    expect(mapRemoteError('version-unsupported')).toBe('version_unsupported');
    expect(mapRemoteError('original-psbt-rejected')).toBe('original_psbt_rejected');
    expect(mapRemoteError('Send all your funds to bc1...')).toBe('unknown_remote_error');
    expect(mapRemoteError(42)).toBe('unknown_remote_error');
  });
  it('maps local codes to well-known remote ones', () => {
    expect(toRemoteErrorCode('rate_limited')).toBe('unavailable');
    expect(toRemoteErrorCode('session_expired')).toBe('unavailable');
    expect(toRemoteErrorCode('unavailable')).toBe('unavailable');
    expect(toRemoteErrorCode('not_enough_money')).toBe('not-enough-money');
    expect(toRemoteErrorCode('version_unsupported')).toBe('version-unsupported');
    expect(toRemoteErrorCode('input_seen')).toBe('original-psbt-rejected');
  });
  it('PayjoinError carries code and optional static detail', () => {
    expect(new PayjoinError('uri_invalid').message).toBe('uri_invalid');
    expect(new PayjoinError('uri_invalid', 'why').message).toBe('uri_invalid: why');
    expect(new PayjoinError('uri_invalid').name).toBe('PayjoinError');
  });
});

describe('network (BPJ-GEN-1)', () => {
  it('allows only testnet-class networks', () => {
    for (const n of ['testnet', 'signet', 'regtest']) expect(() => assertNetwork(n)).not.toThrow();
    for (const n of ['mainnet', 'main', '', undefined, 1, null]) expect(codeOf(() => assertNetwork(n))).toBe('network_not_allowed');
    expect(netParams('regtest').bech32).toBe('bcrt');
    expect(netParams('signet').bech32).toBe('tb');
  });
  it('addressToScript guards', () => {
    const a = addressFor(key('n'), 'wpkh');
    expect(addressToScript(a, 'testnet')).toHaveLength(22);
    expect(codeOf(() => addressToScript('', 'testnet'))).toBe('uri_invalid');
    expect(codeOf(() => addressToScript('x'.repeat(300), 'testnet'))).toBe('uri_invalid');
    expect(codeOf(() => addressToScript('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy', 'testnet'))).toBe('network_not_allowed');
    expect(codeOf(() => addressToScript(a, 'mainnet' as never))).toBe('network_not_allowed');
    for (const sp of ['sp1qqgste7k9hx0qftg6qmwlkqtwuy6cycyavzmzj85c6qdfhjdpdichy6y', 'tsp1qqgste7k9hx0qftg6qmwlkqtwuy6cycyavzmzj85c6qdfhjdpdichy6y', 'sprt1qq']) {
      expect(codeOf(() => addressToScript(sp, 'testnet'))).toBe('uri_conflict');
    }
  });
});

describe('modes', () => {
  it('has no mainnet and states limits on payjoin rows', () => {
    expect(Object.keys(BTC_MODE_INFO).sort()).toEqual(['payjoin-v1', 'payjoin-v2', 'plain', 'silent-payment']);
    expect(JSON.stringify(BTC_MODE_INFO).toLowerCase()).not.toContain('mainnet,');
    for (const m of ['payjoin-v1', 'payjoin-v2'] as const) {
      expect(BTC_MODE_INFO[m].limits.some((l) => l.startsWith('N1'))).toBe(true);
      expect(BTC_MODE_INFO[m].limits.some((l) => l.startsWith('N3'))).toBe(true);
    }
    expect(BTC_MODE_INFO['payjoin-v2'].limits.some((l) => l.startsWith('N4'))).toBe(true);
    expect(Object.isFrozen(BTC_MODE_INFO)).toBe(true);
    const text = JSON.stringify(BTC_MODE_INFO).toLowerCase();
    for (const banned of ['anonymous', 'untraceable', 'mixing', 'mixer service']) expect(text.includes(banned)).toBe(false);
  });
});

describe('params', () => {
  it('serialises and parses', () => {
    const q = serializeParams({ v: 1, additionalFeeOutputIndex: 1, maxAdditionalFeeContributionSats: 182n, minFeeRateSatPerVb: 1.5, disableOutputSubstitution: true });
    expect(q).toBe('v=1&additionalfeeoutputindex=1&maxadditionalfeecontribution=182&minfeerate=1.5&disableoutputsubstitution=true');
    expect(parseParams(q)).toEqual({ v: 1, additionalFeeOutputIndex: 1, maxAdditionalFeeContributionSats: 182n, minFeeRateSatPerVb: 1.5, disableOutputSubstitution: true });
  });
  it('emits the fee pair only when both are present', () => {
    expect(serializeParams({ v: 1, additionalFeeOutputIndex: 1, disableOutputSubstitution: false })).toBe('v=1');
    expect(serializeParams(withDefaults())).toBe('v=1');
    expect(DEFAULT_PARAMS.v).toBe(1);
  });
  it('rejects nonsense on serialise', () => {
    expect(codeOf(() => serializeParams({ v: 1, additionalFeeOutputIndex: -1, maxAdditionalFeeContributionSats: 1n, disableOutputSubstitution: false }))).toBe('uri_invalid');
    expect(codeOf(() => serializeParams({ v: 1, additionalFeeOutputIndex: 1, maxAdditionalFeeContributionSats: -1n, disableOutputSubstitution: false }))).toBe('uri_invalid');
    expect(codeOf(() => serializeParams({ v: 1, minFeeRateSatPerVb: -1, disableOutputSubstitution: false }))).toBe('uri_invalid');
    expect(codeOf(() => serializeParams({ v: 1, minFeeRateSatPerVb: Number.NaN, disableOutputSubstitution: false }))).toBe('uri_invalid');
  });
  it('parse: defaults, ignores malformed optional values, rejects other versions', () => {
    expect(parseParams('')).toEqual({ v: 1, disableOutputSubstitution: false });
    expect(parseParams('v=1&additionalfeeoutputindex=x&maxadditionalfeecontribution=-5&minfeerate=-1&disableoutputsubstitution=maybe')).toEqual({ v: 1, disableOutputSubstitution: false });
    expect(parseParams('additionalfeeoutputindex=1')).toEqual({ v: 1, disableOutputSubstitution: false });
    expect(codeOf(() => parseParams('v=2'))).toBe('version_unsupported');
    expect(codeOf(() => parseParams('v=abc'))).toBe('version_unsupported');
  });
});

describe('psbt helpers', () => {
  it('estimates input vsize by type', () => {
    expect(estimateInputVsize(new Uint8Array([0, 20, ...new Array<number>(20).fill(1)]))).toBe(68);
    expect(estimateInputVsize(new Uint8Array([0x51, 0x20, ...new Array<number>(32).fill(1)]))).toBe(58);
    expect(estimateInputVsize(new Uint8Array([0xa9, 0x14, ...new Array<number>(20).fill(1), 0x87]))).toBe(91);
    expect(estimateInputVsize(new Uint8Array([0x76, 0xa9, 0x14, ...new Array<number>(20).fill(1), 0x88, 0xac]))).toBe(148);
    expect(estimateInputVsize(new Uint8Array([1, 2, 3]))).toBe(110);
  });
  it('parsePsbt bounds', () => {
    expect(codeOf(() => parsePsbt('A'.repeat(MAX_PSBT_BASE64 + 1)))).toBe('psbt_invalid');
    expect(codeOf(() => parsePsbt('AAAA'))).toBe('psbt_invalid');
    expect(codeOf(() => parsePsbt(5 as never))).toBe('psbt_invalid');
    expect(sameBytes(new Uint8Array([1]), new Uint8Array([1]))).toBe(true);
    expect(sameBytes(new Uint8Array([1]), new Uint8Array([2]))).toBe(false);
    expect(typeof inputOutpoint).toBe('function');
  });
  it('secureUnit is in [0,1)', () => {
    for (let i = 0; i < 50; i++) {
      const x = secureUnit();
      expect(x >= 0 && x < 1).toBe(true);
    }
  });
});
