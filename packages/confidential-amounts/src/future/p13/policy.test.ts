import { describe, expect, it } from 'vitest';
import { NOT_PROTECTED_KEYS, findForbiddenWording } from '../../copy.js';
import { P13_COPY, copyText, isKnownCopyKey } from './copy.js';
import { buildDisclosure, classifyRoute, disclosureDigest, disclosureLines, type RouteKind } from './disclosure.js';
import { P13_GATE_DEFAULT, checkFeeRequest, decideOperation, p13Capabilities, type P13Operation } from './gate.js';

const CTM_CONSENT = disclosureDigest(buildDisclosure('ctm-cleartext'));
const ENABLED = { enabled: true, protocolId: 'ctm-cleartext', allowFixture: true, consentDigest: CTM_CONSENT };
const codeOf = (r: { ok: boolean; code?: string }): string => (r.ok ? 'ok' : (r.code ?? '?'));

describe('route classification (P13-A01, A02)', () => {
  it.each<RouteKind>(['transparent-native', 'transparent-erc20', 'ui-mask', 'ctm-cleartext', 'commitment-zk'])(
    '%s makes no confidential-amount claim',
    (kind) => {
      expect(classifyRoute(kind).confidentialClaimAllowed).toBe(false);
    },
  );

  it('transparent and screen-masked routes keep the amount public on-chain', () => {
    for (const kind of ['transparent-native', 'transparent-erc20', 'ui-mask'] as const) {
      const r = classifyRoute(kind);
      expect(r.visibility).toBe('public-onchain');
      expect(r.publicFields).toContain('amount');
    }
    expect(classifyRoute('ui-mask').copyKeys).toContain('P13_UI_MASK_ONLY');
  });

  it('CT-1 hides only the amount; addresses, timing, wrap/unwrap, ACL and handles stay public', () => {
    const r = classifyRoute('ct1-zama');
    expect(r.visibility).toBe('encrypted-onchain-fhe');
    expect(r.confidentialClaimAllowed).toBe(true);
    expect(r.publicFields).not.toContain('amount');
    for (const f of ['payer-address', 'stealth-address', 'block-time', 'wrap-amount', 'unwrap-amount', 'acl-grants', 'ciphertext-handle'] as const) {
      expect(r.publicFields).toContain(f);
    }
    for (const k of NOT_PROTECTED_KEYS) expect(r.copyKeys).toContain(k);
  });

  it('the cleartext fixture is labelled fixture-only and exposes the amount', () => {
    const r = classifyRoute('ctm-cleartext');
    expect(r.visibility).toBe('plaintext-fixture');
    expect(r.publicFields).toContain('amount');
    expect(r.copyKeys).toEqual(expect.arrayContaining(['CT_M_NO_PRIVACY', 'P13_FIXTURE_ONLY']));
  });

  it('refuses unknown routes', () => {
    expect(() => classifyRoute('magic' as RouteKind)).toThrow(expect.objectContaining({ code: 'P13_UNSUPPORTED' }));
  });
});

describe('disclosures and copy', () => {
  it('every P13 copy entry passes the forbidden-wording check and never claims review or deployment', () => {
    for (const [key, text] of Object.entries(P13_COPY)) {
      expect(findForbiddenWording(text), key).toBeNull();
      expect(text).not.toMatch(/\baudited\b|\bdeployed\b|\bmainnet[- ]ready\b|\bsecure\b/i);
    }
    expect(isKnownCopyKey('CT_TRUST_ZAMA')).toBe(true);
    expect(isKnownCopyKey('NOPE')).toBe(false);
    expect(copyText('NOPE')).toBeUndefined();
    expect(copyText('toString')).toBeUndefined();
  });

  it('builds complete disclosures for both built backends', () => {
    for (const id of ['ct1-zama', 'ctm-cleartext'] as const) {
      const d = buildDisclosure(id);
      expect(d.settlement).toBe('disabled');
      expect(d.review).toBe('none-independent');
      for (const k of [...NOT_PROTECTED_KEYS, 'P13_SETTLEMENT_OFF', 'P13_NOT_REVIEWED', 'P13_RECORD_KEY']) {
        expect(d.doesNotHide).toContain(k);
      }
      expect(new Set(d.doesNotHide).size).toBe(d.doesNotHide.length);
      for (const line of disclosureLines(d)) expect(line.text.length).toBeGreaterThan(0);
    }
    expect(buildDisclosure('ctm-cleartext').hides).toEqual([]);
    expect(buildDisclosure('ct1-zama').relayerOrigin).toBe('https://relayer.testnet.zama.org');
  });

  it('the consent digest covers the displayed wording, not only the keys', () => {
    const copy = P13_COPY as Record<string, string>;
    const original = copy['P13_SETTLEMENT_OFF'] ?? '';
    try {
      copy['P13_SETTLEMENT_OFF'] = `${original} Edited.`;
      expect(disclosureDigest(buildDisclosure('ctm-cleartext'))).not.toBe(CTM_CONSENT);
    } finally {
      copy['P13_SETTLEMENT_OFF'] = original;
    }
    expect(disclosureDigest(buildDisclosure('ctm-cleartext'))).toBe(CTM_CONSENT);
  });

  it('the consent digest changes whenever the disclosure changes', () => {
    const d = buildDisclosure('ctm-cleartext');
    expect(disclosureDigest(d)).toBe(CTM_CONSENT);
    expect(disclosureDigest({ ...d, doesNotHide: d.doesNotHide.slice(1) })).not.toBe(CTM_CONSENT);
    expect(disclosureDigest(buildDisclosure('ct1-zama'))).not.toBe(CTM_CONSENT);
  });
});

describe('feature gate (default off; settlement always refused)', () => {
  it('is off by default', () => {
    expect(codeOf(decideOperation('prepare', P13_GATE_DEFAULT, 31337))).toBe('P13_DISABLED');
  });

  it('keeps inspection, export and recovery available while off, even with a malformed configuration', () => {
    for (const op of ['inspect', 'export', 'recover'] as const) {
      expect(decideOperation(op, P13_GATE_DEFAULT, 31337)).toEqual({ ok: true, value: { mode: 'read-only' } });
      expect(decideOperation(op, { enabled: 'yes', junk: 1 }, 31337)).toEqual({ ok: true, value: { mode: 'read-only' } });
      expect(decideOperation(op, null, 1)).toEqual({ ok: true, value: { mode: 'read-only' } });
    }
  });

  it.each<P13Operation>(['authorize', 'sign', 'submit', 'wrap', 'unwrap', 'decrypt', 'transfer'])(
    'refuses %s in every configuration',
    (op) => {
      expect(codeOf(decideOperation(op, ENABLED, 31337))).toBe('P13_SETTLEMENT_DISABLED');
      expect(codeOf(decideOperation(op, { ...ENABLED, protocolId: 'ct1-zama' }, 11155111))).toBe('P13_SETTLEMENT_DISABLED');
      expect(codeOf(decideOperation(op, P13_GATE_DEFAULT, 31337))).toBe('P13_SETTLEMENT_DISABLED');
    },
  );

  it('allows local preparation and review only on the fixture with current consent', () => {
    expect(decideOperation('prepare', ENABLED, 31337)).toEqual({
      ok: true,
      value: { mode: 'local', protocolId: 'ctm-cleartext', evidence: 'fixture-only' },
    });
    expect(codeOf(decideOperation('review', ENABLED, 31337))).toBe('ok');
  });

  it.each<[string, unknown, number, string]>([
    ['CT-1 (unpinned manifest, mock-only evidence)', { ...ENABLED, protocolId: 'ct1-zama' }, 11155111, 'P13_UNSUPPORTED'],
    ['CT-2', { ...ENABLED, protocolId: 'ct2-fhenix' }, 31337, 'P13_UNSUPPORTED'],
    ['commitment-zk', { ...ENABLED, protocolId: 'commitment-zk' }, 31337, 'P13_UNSUPPORTED'],
    ['no protocol named', { enabled: true, allowFixture: true, consentDigest: CTM_CONSENT }, 31337, 'P13_UNSUPPORTED'],
    ['fixture not allowed', { ...ENABLED, allowFixture: false }, 31337, 'P13_UNSUPPORTED'],
    ['fixture on Sepolia', ENABLED, 11155111, 'P13_NETWORK_REFUSED'],
    ['fixture on mainnet', ENABLED, 1, 'P13_NETWORK_REFUSED'],
    ['missing consent', { enabled: true, protocolId: 'ctm-cleartext', allowFixture: true }, 31337, 'P13_CONSENT_REQUIRED'],
    ['consent to another disclosure', { ...ENABLED, consentDigest: disclosureDigest(buildDisclosure('ct1-zama')) }, 31337, 'P13_CONSENT_REQUIRED'],
    ['malformed consent', { ...ENABLED, consentDigest: 'yes' }, 31337, 'P13_INVALID_ASSET'],
    ['unknown key (typo)', { ...ENABLED, enable: true }, 31337, 'P13_UNSUPPORTED'],
    ['truthy non-boolean', { ...ENABLED, enabled: 'true' }, 31337, 'P13_UNSUPPORTED'],
    ['bad allowFixture', { ...ENABLED, allowFixture: 1 }, 31337, 'P13_UNSUPPORTED'],
    ['bad protocolId', { ...ENABLED, protocolId: 7 }, 31337, 'P13_UNSUPPORTED'],
    ['not an object', 'enabled', 31337, 'P13_UNSUPPORTED'],
  ])('refuses %s', (_name, cfg, chainId, code) => {
    expect(codeOf(decideOperation('prepare', cfg, chainId))).toBe(code);
  });

  it('refuses unknown operations', () => {
    expect(codeOf(decideOperation('mint' as P13Operation, ENABLED, 31337))).toBe('P13_UNSUPPORTED');
  });
});

describe('capabilities and fees (P13-A10)', () => {
  it('reports no qualified or testnet capability', () => {
    const caps = p13Capabilities();
    expect(caps.map((c) => [c.protocolId, c.evidence])).toEqual([
      ['ctm-cleartext', 'fixture-only'],
      ['ct1-zama', 'unavailable'],
      ['commitment-zk', 'unavailable'],
    ]);
    for (const c of caps) {
      expect(c.requires).toEqual(['P06']);
      expect(c.chainsAndAssets.every((n) => n === 'eip155:31337' || n === 'eip155:11155111')).toBe(true);
    }
  });

  it('refuses any additional module fee and allows the plain router fee', () => {
    expect(checkFeeRequest({})).toEqual({ ok: true, value: 'router-fee-only' });
    expect(checkFeeRequest({ moduleFees: [] })).toEqual({ ok: true, value: 'router-fee-only' });
    expect(codeOf(checkFeeRequest({ moduleFees: [{ id: 'P13', bps: 10 }] }))).toBe('P13_FEE_UNSUPPORTED');
  });
});
