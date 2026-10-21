import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { OPTION_CATALOGUE, OPTION_GROUPS } from './catalogue.js';
import { CHAIN_RULES } from './chainRules.js';
import { ACK_KEYS, CHAIN_ERROR_KEYS, CHAIN_WARNING_KEYS, ERROR_KEYS, IMPLICIT_ERROR_KEYS, WARNING_KEYS } from './keys.js';
import { RULES } from './rules.js';
import { STEP_CATALOGUE } from './steps.js';
import { OPTION_IDS } from './types.js';
import { evaluate, honestLabel, explain } from './evaluate.js';
import { defaultSelection } from './resolve.js';
import { ctx } from './x.testutil.js';

const here = dirname(fileURLToPath(import.meta.url));
const DOCS = join(here, '../../../docs/remote');
const SRC = here;

const srcFiles = (): string[] =>
  readdirSync(SRC)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('.testutil.ts'))
    .map((f) => join(SRC, f));

describe('catalogue shape', () => {
  it('has every option id exactly once, grouped', () => {
    expect(Object.keys(OPTION_CATALOGUE).sort()).toEqual([...OPTION_IDS].sort());
    expect(OPTION_GROUPS.flatMap((g) => g.options).sort()).toEqual([...OPTION_IDS].sort());
  });
  it('PP-5: defaults are values, and match spec section 7 defaults', () => {
    const SPEC_DEFAULTS: Record<string, string> = {
      'sweep.destination': 'self-derived', 'sweep.verification': 'address-free', 'sweep.dust': 'on', 'sweep.knownWalletGuard': 'on',
      'sweep.delay': 'off', 'sweep.hops': '0', 'sweep.hopRelayers': 'rotate', 'sweep.exit': 'plain', 'sweep.poolAsp': 'none',
      'sweep.poolSubmit': 'relayer', 'sweep.poolAmountPlan': 'denominations',
      'pay.payerMode': 'direct', 'pay.source': 'wallet', 'pay.amountBlur': 'off', 'pay.amountVisibility': 'public',
      'pay.bufferRounding': 'grid125', 'pay.route': 'router', 'pay.amountNoise': 'off', 'pay.gasNormalise': 'off',
      'invoice.encrypt': 'off', 'invoice.padding': 'off', 'invoice.coarseTime': 'off', 'invoice.quoteRounding': 'on',
      'identity.perInvoiceMeta': 'off', 'identity.perChainKeys': 'off', 'announce.metadata': 'standard', 'announce.viewTag': 'keep',
      'announce.schemeId': '1', 'net.rpcProfile': 'direct', 'net.relayerProfile': 'direct', 'net.rpcMode': 'single',
      'net.endpointSeparation': 'off', 'net.scanMode': 'range', 'net.scanAlign': 'off', 'relayer.multi': 'off', 'relayer.padding': 'off',
      'btc.mode': 'silent-payment', 'btc.contributeFromSp': 'off', 'btc.change': 'on', 'btc.feeRateNormalise': 'off',
      'btc.locktime': 'zero', 'btc.rbf': 'on', 'btc.ordering': 'caller', 'btc.psbtStrip': 'off',
    };
    for (const id of OPTION_IDS) {
      const d = OPTION_CATALOGUE[id];
      expect(d.values.map((v) => v.value)).toContain(d.defaultValue);
      expect(new Set(d.values.map((v) => v.value)).size).toBe(d.values.length);
      if (SPEC_DEFAULTS[id] !== undefined) expect(d.defaultValue, id).toBe(SPEC_DEFAULTS[id]);
    }
    // documented deviation: exitGas default is today's behaviour (buffer), not permit-sponsored
    expect(OPTION_CATALOGUE['sweep.exitGas'].defaultValue).toBe('buffer');
  });
  it('lists values from the spec tables', () => {
    const vals = (id: (typeof OPTION_IDS)[number]): string[] => OPTION_CATALOGUE[id].values.map((v) => v.value);
    expect(vals('sweep.exit')).toEqual(['plain', 'privacy-pools', 'railgun', 'shielded-pool', 'mock-pool', 'tornado-fixed', 'aztec']);
    expect(vals('sweep.hops')).toEqual(['0', '1', '2', '3', '4']);
    expect(vals('net.rpcProfile')).toEqual(['direct', 'tor-browser', 'tor-socks', 'onion', 'i2p-outproxy', 'nym-mixfetch', 'nym-socks5', 'ohttp']);
    expect(vals('pay.payerMode')).toHaveLength(5);
    expect(vals('pay.amountVisibility')).toEqual(['public', 'ct1-zama', 'ct2-fhenix', 'ct3-inco', 'ctm-cleartext']);
    expect(vals('btc.mode')).toEqual(['silent-payment', 'plain', 'payjoin-v2', 'payjoin-v1']);
  });
  it('operator scope options are not selectable', () => {
    for (const id of OPTION_IDS.filter((i) => i.startsWith('ops.'))) {
      expect(OPTION_CATALOGUE[id].userSelectable).toBe(false);
      expect(['relayer-operator', 'deployment', 'build']).toContain(OPTION_CATALOGUE[id].scope);
    }
    expect(OPTION_IDS.filter((i) => !i.startsWith('ops.')).every((i) => OPTION_CATALOGUE[i].userSelectable)).toBe(true);
  });
  it('PP-7: non-default non-baseline values carry noAnonymity and non-empty doesNotHide; all carry testnetOnly', () => {
    for (const id of OPTION_IDS) {
      const d = OPTION_CATALOGUE[id];
      for (const v of d.values) {
        expect(v.warnings).toContain('privacy.warn.testnetOnly');
        if (v.value !== d.defaultValue && v.strength !== 'baseline') {
          expect(v.warnings, `${id}=${v.value}`).toContain('privacy.warn.noAnonymity');
          expect(v.doesNotHide.length, `${id}=${v.value}`).toBeGreaterThan(0);
        }
      }
    }
  });
  it('PP-8: no payer-identity leak hidden by payer modes; no deposit/depositor/ip hidden by pools', () => {
    for (const v of OPTION_CATALOGUE['pay.payerMode'].values) {
      for (const h of v.hides) expect(h).not.toMatch(/payer-address|payer-identity|payer-public/);
    }
    for (const id of ['sweep.exit', 'pay.source', 'sweep.poolAsp', 'sweep.poolSubmit', 'sweep.exitGas'] as const) {
      for (const v of OPTION_CATALOGUE[id].values)
        for (const h of v.hides) expect(h.split(/[:-]/)).not.toEqual(expect.arrayContaining(['deposit']));
    }
    for (const v of [...OPTION_CATALOGUE['sweep.exit'].values, ...OPTION_CATALOGUE['pay.source'].values])
      for (const h of v.hides) {
        const toks = h.split(/[:-]/);
        for (const bad of ['deposit', 'depositor', 'ip']) expect(toks).not.toContain(bad);
      }
  });
  it('default selection: ok, only testnetOnly warning, for all chains and envs, empty capabilities', () => {
    for (const chainId of [31337, 11155111, 84532])
      for (const env of ['web', 'web-onion', 'node'] as const)
        for (const action of ['settings', 'pay', 'sweep', 'scan', 'create-invoice'] as const) {
          const ev = evaluate(defaultSelection(), ctx({ chainId, env, action, capabilities: new Set() }));
          expect(ev.ok).toBe(true);
          expect(ev.warnings.map((w) => w.key)).toEqual(['privacy.warn.testnetOnly']);
        }
  });
  it('catalogue covers every option id named in the README index of the ten method specs', () => {
    const covered = new Set(OPTION_IDS.flatMap((i) => OPTION_CATALOGUE[i].values.flatMap((v) => v.specRef.ids)));
    const must = [
      'HY-DST', 'HY-VER', 'HY-BUF', 'HY-FUND', 'AB-ROUND', 'AB-SPLIT', 'AB-DENOM', 'AB-DELAY', 'HOP-0', 'HOP-N',
      'PH-0', 'PH-1', 'PH-2', 'PH-3', 'PH-4', 'SP-EXIT', 'SP-PAY', 'EP-0', 'EP-1', 'EP-2', 'EP-3', 'EP-4', 'EP-M',
      'CT-0', 'CT-1', 'CT-2', 'CT-3', 'CT-M', 'MH-FEE-1', 'MH-FEE-2', 'MH-ANN-1', 'MH-ANN-2', 'MH-ANN-3', 'MH-TAG-1', 'MH-TAG-2',
      'MH-AMT-1', 'MH-AMT-2', 'MH-WAL-1', 'MH-WAL-2', 'MH-REL-1', 'MH-REL-2', 'MH-REL-3', 'MH-REL-4', 'MH-REL-5',
      'MH-NET-1', 'MH-NET-2', 'MH-NET-3', 'MH-SCAN-1', 'MH-SCAN-2', 'MH-SCAN-3', 'MH-INV-1', 'MH-INV-2', 'MH-INV-3',
      'MH-WEB-1', 'MH-WEB-2', 'MH-WEB-3', 'MH-ID-1', 'MH-ID-2', 'MH-BTC-1', 'MH-BTC-2', 'MH-BTC-3', 'MH-BTC-4', 'MH-BTC-5',
      'MH-BTC-6', 'BPJ-V2-1', 'BPJ-GEN-1', 'BPJ-SP-1',
    ];
    for (const m of must) expect(covered.has(m), m).toBe(true);
  });
  it('honest label and explain expose trust, keys and copy keys, never prose', () => {
    const s = { preset: 'custom' as const, values: { 'pay.payerMode': 'permit-relay' }, acks: [] };
    const c = ctx({ action: 'pay', asset: 'erc20-permit' });
    const ev = evaluate(s, c);
    const lab = honestLabel(ev);
    expect(lab.headline).toBe('privacy.warn.noAnonymity');
    expect(lab.trusts).toEqual(['own-unaudited-contracts', 'payer-sponsor']);
    expect(lab.stillVisible).toContain('payer-hiding:payer-address-public');
    expect(lab.warnings).toContain('privacy.warn.payerStillPublic');
    expect(ev.specCopyKeys).toEqual(['PAYER_MODE_INFO']);
    const rows = explain(s, c);
    expect(rows.find((r) => r.option === 'pay.payerMode')?.def.value).toBe('permit-relay');
    expect(rows.some((r) => r.option === 'sweep.hops')).toBe(false);
  });
});

describe('PP-1 purity and PP-9 honest wording (grep over src)', () => {
  it('no I/O or nondeterminism in src', () => {
    for (const f of srcFiles()) {
      const t = readFileSync(f, 'utf8');
      expect(t, f).not.toMatch(/\bfetch\s*\(|from 'node:|require\(|\bDate\b|Math\.random|from 'crypto'|XMLHttpRequest|WebSocket|process\./);
    }
  });
  it('banned words absent, except the key noAnonymity', () => {
    const banned = /\b(anonymous|anonymity|untraceable|unlinkable|mix|mixing|launder|obfuscate)\b/i;
    for (const f of srcFiles()) {
      const t = readFileSync(f, 'utf8').replaceAll('privacy.warn.noAnonymity', '');
      expect(t.match(banned)?.[0], f).toBeUndefined();
    }
  });
});

describe('PP-6 spec cross-check', () => {
  const read = (file: string): string => {
    const p = file.startsWith('security-specs/') ? join(DOCS, file) : join(DOCS, 'privacy-specs', file);
    return readFileSync(p, 'utf8');
  };
  it('every cited id occurs in the cited file', () => {
    const refs: { file: string; ids: readonly string[]; who: string }[] = [];
    for (const id of OPTION_IDS) for (const v of OPTION_CATALOGUE[id].values) refs.push({ ...v.specRef, who: `${id}=${v.value}` });
    for (const r of RULES) if (r.specRef !== 'new') refs.push({ ...r.specRef, who: r.id });
    for (const r of CHAIN_RULES) if (r.specRef !== 'new') refs.push({ ...r.specRef, who: r.id });
    for (const s of Object.values(STEP_CATALOGUE)) refs.push({ ...s.specRef, who: s.kind });
    expect(refs.length).toBeGreaterThan(200);
    const missing: string[] = [];
    for (const r of refs) {
      const text = read(r.file);
      for (const id of r.ids) if (!text.includes(id)) missing.push(`${r.who}: ${id} in ${r.file}`);
    }
    expect(missing).toEqual([]);
  });
  it('spec dir is the one we read', () => {
    expect(statSync(join(DOCS, 'privacy-specs/profiles.md')).isFile()).toBe(true);
  });
});

describe('PP-14 key coverage', () => {
  it('every list key is used by a rule or a value; no duplicates', () => {
    const used = new Set<string>();
    for (const r of RULES) used.add(r.key);
    for (const r of CHAIN_RULES) {
      used.add(r.key);
      if (r.escalate) used.add(r.escalate.key);
    }
    for (const id of OPTION_IDS) for (const v of OPTION_CATALOGUE[id].values) v.warnings.forEach((w) => used.add(w));
    for (const w of WARNING_KEYS) expect(used.has(w), w).toBe(true);
    // emitted by the pipeline package's summary (emergent leaks E-2, E-3, E-6, E-7), not by a rule row here
    const pipelineOnly = ['longRun', 'appMustStayOpen', 'combinationFingerprint'].map((n) => `privacy.warn.chain.${n}`);
    for (const w of CHAIN_WARNING_KEYS) expect(used.has(w) || pipelineOnly.includes(w), w).toBe(true);
    for (const e of ERROR_KEYS) expect(used.has(e) || e === 'privacy.err.chain.layerChanged' || (IMPLICIT_ERROR_KEYS as readonly string[]).includes(e), e).toBe(true);
    for (const e of CHAIN_ERROR_KEYS) expect(used.has(e) || e === 'privacy.err.chain.layerChanged', e).toBe(true);
    expect(new Set(WARNING_KEYS).size).toBe(WARNING_KEYS.length);
    const vAcks = new Set(OPTION_IDS.flatMap((i) => OPTION_CATALOGUE[i].values.flatMap((v) => v.acks)));
    for (const a of ACK_KEYS) expect(vAcks.has(a) || used.has(a), a).toBe(true);
  });
  it('every value warning and ack is a known key', () => {
    for (const id of OPTION_IDS)
      for (const v of OPTION_CATALOGUE[id].values) {
        for (const w of v.warnings) expect(WARNING_KEYS as readonly string[]).toContain(w);
        for (const a of v.acks) expect(ACK_KEYS as readonly string[]).toContain(a);
      }
  });
});
