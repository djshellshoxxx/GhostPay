import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CT_COPY, NOT_PROTECTED_KEYS, findForbiddenWording } from './copy.js';
import { classifyPayment, wrapWarnings } from './payment.js';
import { BACKEND_INFOS, getBackend } from './registry.js';
import { CleartextLedger } from './backends/ledger.js';
import { CT1_INFO } from './backends/zama.js';
import { CTM_INFO } from './backends/cleartext.js';
import * as pkg from './index.js';

const here = dirname(fileURLToPath(import.meta.url));

describe('payment classification (CT-PAY-6)', () => {
  it('is unconfirmed until decrypted, then confirmed / underpaid / failed', () => {
    expect(classifyPayment(100n, undefined)).toBe('unconfirmed');
    expect(classifyPayment(100n, 0n)).toBe('failed_insufficient_balance');
    expect(classifyPayment(100n, 99n)).toBe('underpaid');
    expect(classifyPayment(100n, 100n)).toBe('confirmed');
    expect(classifyPayment(100n, 101n)).toBe('confirmed');
  });
});

describe('wrap warnings (CT-UX-2, CT-UX-4)', () => {
  it('always warns that the wrap is public', () => {
    expect(wrapWarnings(5_000_000n)).toEqual(['CT_WRAP_PUBLIC']);
  });
  it('flags wrapping exactly the gross and non-round sums', () => {
    expect(wrapWarnings(1_234_567n, 1_234_567n)).toEqual(['CT_WRAP_PUBLIC', 'CT_WRAP_EQUALS_GROSS', 'CT_WRAP_NOT_ROUND']);
    expect(wrapWarnings(5_000_000n, 1_234_567n)).toEqual(['CT_WRAP_PUBLIC']);
    expect(wrapWarnings(7n, undefined, 0n)).toEqual(['CT_WRAP_PUBLIC']);
  });
});

describe('copy (T10)', () => {
  it('contains no forbidden wording in any string', () => {
    for (const [k, v] of Object.entries(CT_COPY)) expect(findForbiddenWording(v), k).toBeNull();
    for (const b of [CT1_INFO, CTM_INFO]) {
      expect(findForbiddenWording(`${b.licence} ${b.trust} ${b.whatItHides.join(' ')}`)).toBeNull();
    }
  });
  it('detects forbidden wording', () => {
    for (const w of ['anonymous', 'Untraceable', 'a mixer', 'private transfer', 'mixing', 'tumbler', 'unlinkable', 'anonymity']) {
      expect(findForbiddenWording(`this is ${w} okay`), w).not.toBeNull();
    }
    expect(findForbiddenWording('Amount hidden on-chain from the public.')).toBeNull();
  });
  it('has copy for every NOT-protected key and every key the specs name', () => {
    for (const k of NOT_PROTECTED_KEYS) expect(CT_COPY[k], k).toBeTruthy();
    for (const k of ['CT_HIDES_AMOUNT_ONLY', 'CT_WRAP_PUBLIC', 'CT_TRUST_ZAMA', 'CT_TESTNET_ONLY', 'CT_UNWRAP_PUBLIC', 'CT_OTHER_CHAIN', 'CT_TRUST_FHENIX', 'CT_TRUST_INCO_TEE']) {
      expect(CT_COPY[k], k).toBeTruthy();
    }
    expect(CT_COPY['CT_HIDES_AMOUNT_ONLY']).toContain('encryption operator');
  });
  it('every info key resolves to copy', () => {
    for (const b of Object.values(BACKEND_INFOS)) {
      for (const k of [...b.whatItHides, ...b.whatItDoesNotHide]) expect(CT_COPY[k], k).toBeTruthy();
    }
  });
});

describe('registry', () => {
  it('never auto-selects and refuses missing dependencies and spike-gated backends', async () => {
    await expect(getBackend('ct1-zama')).rejects.toMatchObject({ code: 'BACKEND_UNAVAILABLE' });
    await expect(getBackend('ctm-cleartext')).rejects.toMatchObject({ code: 'BACKEND_UNAVAILABLE' });
    await expect(getBackend('ct2-fhenix')).rejects.toMatchObject({ code: 'BACKEND_UNAVAILABLE' });
    await expect(getBackend('ct3-inco')).rejects.toMatchObject({ code: 'BACKEND_UNAVAILABLE' });
    await expect(getBackend('nope' as never)).rejects.toMatchObject({ code: 'BACKEND_UNAVAILABLE' });
  });
  it('loads the built backends', async () => {
    const m = await getBackend('ctm-cleartext', { ledger: new CleartextLedger() });
    expect(m.info.id).toBe('ctm-cleartext');
    const z = await getBackend('ct1-zama', { zamaPort: { open: () => Promise.reject(new Error('unused')) } });
    expect(z.info.id).toBe('ct1-zama');
  });
});

describe('bundle hygiene (CT-SUP-1)', () => {
  it('no source file imports @zama-fhe statically (type imports and dynamic import() only)', () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) walk(join(d, e.name));
        else if (e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') && !e.name.endsWith('.testutil.ts')) files.push(join(d, e.name));
      }
    };
    walk(here);
    expect(files.length).toBeGreaterThan(8);
    for (const f of files) {
      const text = readFileSync(f, 'utf8');
      const staticImports = [...text.matchAll(/^\s*(import|export)\s+(?!type\b)[^;]*?from\s+['"]@zama-fhe[^'"]*['"]/gm)];
      expect(staticImports.map((m) => m[0]), f).toEqual([]);
      const sideEffect = [...text.matchAll(/^\s*import\s+['"]@zama-fhe/gm)];
      expect(sideEffect, f).toEqual([]);
    }
  });

  it('the public index exposes the documented surface', () => {
    for (const name of ['getBackend', 'DecryptScheduler', 'parseConfidentialMetadata', 'buildConfidentialMetadata', 'CleartextLedger', 'ZamaBackend', 'assertCtChain', 'createZamaSdkPort', 'classifyPayment']) {
      expect(name in pkg, name).toBe(true);
    }
  });
});
