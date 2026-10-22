import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PluginError } from './errors.js';
import { DEFAULTS, FakeNetwork, INVOICE, never, plugin } from './fixtures.testutil.js';
import { isWeaker, tighten, validateSettings, type PrivacySettings } from './privacy.js';
import {
  MAX_OPTIONS_PER_PLUGIN,
  MAX_PLUGINS,
  PluginRegistry,
  applyPrivacySelection,
  type PluginModule,
  type PrivacyOptionInput,
} from './registry.js';
import type { PluginContext } from './sandbox.js';

function errPath(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    if (e instanceof PluginError) return `${e.code}:${e.path ?? ''}`;
    throw e;
  }
  return undefined;
}

const reg = (extra: Partial<ConstructorParameters<typeof PluginRegistry>[0]> = {}) =>
  new PluginRegistry({ defaults: DEFAULTS, hookTimeoutMs: 20, ...extra });

const delayPlugin = (
  id: string,
  options: PrivacyOptionInput[] = [],
  minDelaySeconds?: number,
): PluginModule =>
  plugin(
    { id, capabilities: ['privacy:delay'] },
    {
      privacyOptions: () => ({
        options,
        ...(minDelaySeconds === undefined ? {} : { restrictions: { minDelaySeconds } }),
      }),
    },
  );

describe('registration', () => {
  it('requires hooks to match declared capabilities exactly', () => {
    const r = reg();
    expect(errPath(() => r.register(plugin({}, {})))).toBe('REGISTRY:hooks.privacyOptions');
    expect(
      errPath(() =>
        r.register(plugin({}, { privacyOptions: () => undefined, onInvoiceCreate: () => undefined })),
      ),
    ).toBe('REGISTRY:hooks.onInvoiceCreate');
    expect(
      errPath(() =>
        r.register(plugin({ capabilities: ['hook:onInvoiceCreate'] }, { privacyOptions: () => undefined })),
      ),
    ).toBe('REGISTRY:hooks.onInvoiceCreate');
    expect(errPath(() => r.register(plugin({}, { privacyOptions: 'return 1' as never })))).toBe(
      'REGISTRY:hooks.privacyOptions',
    );
    expect(errPath(() => r.register(plugin({}, { onPayment: () => 1 } as never)))).toBe(
      'REGISTRY:hooks.onPayment',
    );
    expect(errPath(() => r.register({ manifest: {} } as never))).toBe('REGISTRY:hooks');
    expect(errPath(() => r.register(plugin({ id: 'BAD' }, {})))).toBe('MANIFEST:id');
  });

  it('rejects duplicate ids, registration after seal, and too many plugins', () => {
    const r = reg();
    r.register(delayPlugin('org.example.a'));
    expect(errPath(() => r.register(delayPlugin('org.example.a')))).toBe('REGISTRY:id');
    r.seal();
    expect(errPath(() => r.register(delayPlugin('org.example.b')))).toBe('REGISTRY:sealed');
    const r2 = reg();
    for (let i = 0; i < MAX_PLUGINS; i++) r2.register(delayPlugin(`org.example.p${i}`));
    expect(errPath(() => r2.register(delayPlugin('org.example.last')))).toBe('LIMIT:plugins');
  });

  it('grants are the intersection of request and host grant (deny by default)', () => {
    const r = reg();
    const info = r.register(
      plugin(
        {
          id: 'org.example.net',
          permissions: { network: ['a.example.com', 'b.example.com'], storage: true, downgrade: true },
        },
        { privacyOptions: () => undefined },
      ),
      { network: ['b.example.com', 'c.example.com'], storage: false },
    );
    expect(info.granted).toEqual({ network: ['b.example.com'], storage: false, downgrade: false });
    const none = r.register(
      plugin(
        {
          id: 'org.example.none',
          permissions: { network: ['a.example.com'], storage: true, downgrade: true },
        },
        { privacyOptions: () => undefined },
      ),
    );
    expect(none.granted).toEqual({ network: [], storage: false, downgrade: false });
  });

  it('validates host configuration', () => {
    expect(errPath(() => new PluginRegistry({ defaults: { ...DEFAULTS, batchSize: 0 } }))).toBe(
      'CONFIG:defaults.batchSize',
    );
    expect(errPath(() => new PluginRegistry({ defaults: DEFAULTS, hookTimeoutMs: 0 }))).toBe(
      'CONFIG:hookTimeoutMs',
    );
    expect(errPath(() => new PluginRegistry({ defaults: DEFAULTS, hookTimeoutMs: 10_001 }))).toBe(
      'CONFIG:hookTimeoutMs',
    );
    expect(errPath(() => validateSettings({ ...DEFAULTS, relay: 'yes' }))).toBe('CONFIG:defaults.relay');
  });
});

describe('evaluation', () => {
  it('runs plugins in id order regardless of registration order', async () => {
    const seen: string[] = [];
    const mk = (id: string): PluginModule =>
      plugin(
        { id, capabilities: ['hook:onInvoiceCreate', 'privacy:delay'] },
        {
          onInvoiceCreate: (ctx) => {
            seen.push(`${ctx.pluginId}:create`);
            return undefined;
          },
          privacyOptions: (ctx) => {
            seen.push(`${ctx.pluginId}:options`);
            return undefined;
          },
        },
      );
    const r = reg();
    for (const id of ['org.example.zeta', 'org.example.alpha', 'org.example.mid']) r.register(mk(id));
    await r.evaluateInvoice(INVOICE);
    expect(seen).toEqual([
      'org.example.alpha:create',
      'org.example.alpha:options',
      'org.example.mid:create',
      'org.example.mid:options',
      'org.example.zeta:create',
      'org.example.zeta:options',
    ]);
    expect(r.list().map((p) => p.manifest.id)).toEqual([
      'org.example.alpha',
      'org.example.mid',
      'org.example.zeta',
    ]);
  });

  it('restrictions only tighten; result is order-independent', async () => {
    const a = delayPlugin('org.example.a', [], 3600);
    const b = delayPlugin('org.example.b', [], 60); // below default 600: no effect
    const relay = plugin(
      {
        id: 'org.example.relay',
        capabilities: ['hook:onInvoiceCreate', 'privacy:relay', 'privacy:batching'],
      },
      {
        onInvoiceCreate: () => ({ restrictions: { relayRequired: true, minBatchSize: 32 } }),
        privacyOptions: () => undefined,
      },
    );
    const r1 = reg();
    [a, b, relay].forEach((p) => r1.register(p));
    const r2 = reg();
    [relay, b, a].forEach((p) => r2.register(p));
    const e1 = await r1.evaluateInvoice(INVOICE);
    const e2 = await r2.evaluateInvoice(INVOICE);
    expect(e1.effective).toEqual({ delaySeconds: 3600, relay: true, batchSize: 32 });
    expect(e2).toEqual(e1);
    expect(e1.defaults).toEqual(DEFAULTS);
  });

  it('rejects restrictions outside declared capabilities and attempts to weaken', async () => {
    const r = reg();
    r.register(
      plugin(
        { id: 'org.example.sneaky', capabilities: ['privacy:delay'] },
        { privacyOptions: () => ({ restrictions: { minBatchSize: 2 } }) },
      ),
    );
    r.register(
      plugin(
        { id: 'org.example.relayoff', capabilities: ['privacy:relay'] },
        { privacyOptions: () => ({ restrictions: { relayRequired: false as never } }) },
      ),
    );
    r.register(
      plugin(
        { id: 'org.example.extra', capabilities: ['hook:onInvoiceCreate'] },
        { onInvoiceCreate: () => ({ options: [] }) as never },
      ),
    );
    const e = await r.evaluateInvoice(INVOICE);
    expect(e.effective).toEqual(DEFAULTS);
    expect(e.failures).toEqual([
      { pluginId: 'org.example.extra', hook: 'onInvoiceCreate', code: 'BAD_OUTPUT' },
      { pluginId: 'org.example.relayoff', hook: 'privacyOptions', code: 'BAD_OUTPUT' },
      { pluginId: 'org.example.sneaky', hook: 'privacyOptions', code: 'BAD_OUTPUT' },
    ]);
  });

  it('accepts stronger options and rejects silent downgrades', async () => {
    const r = reg();
    r.register(
      delayPlugin('org.example.d', [
        { id: 'one-hour', kind: 'delay', label: 'Wait 1 hour', value: 3600 },
        { id: 'fast', kind: 'delay', label: 'No delay', value: 0 },
        { id: 'fake-flag', kind: 'delay', label: 'Long', value: 7200, downgrade: true },
        { id: 'relay-off', kind: 'relay', label: 'Direct', value: false },
        { id: 'BAD ID', kind: 'delay', label: 'x', value: 900 },
        { id: 'one-hour', kind: 'delay', label: 'Dup', value: 3600 },
        { id: 'neg', kind: 'delay', label: 'Neg', value: -1 },
        { id: 'k', kind: 'teleport' as never, label: 'k', value: 1 },
      ]),
    );
    const e = await r.evaluateInvoice(INVOICE);
    expect(e.options.map((o) => o.key)).toEqual(['org.example.d/one-hour']);
    expect(e.downgrades).toEqual([]);
    expect(e.rejectedOptions.map((x) => x.reason)).toEqual([
      'SILENT_DOWNGRADE',
      'FALSE_DOWNGRADE_FLAG',
      'UNDECLARED_KIND',
      'MALFORMED',
      'DUPLICATE_ID',
      'MALFORMED',
      'BAD_KIND',
    ]);
  });

  it('a flagged downgrade needs the granted permission and a reason, and is surfaced', async () => {
    const opts: PrivacyOptionInput[] = [
      {
        id: 'fast',
        kind: 'delay',
        label: 'Pay out now',
        value: 0,
        downgrade: true,
        downgradeReason: 'Faster payout; timing is linkable',
      },
      { id: 'no-reason', kind: 'delay', label: 'Now', value: 0, downgrade: true },
      { id: 'reason-on-strong', kind: 'delay', label: 'Slow', value: 9000, downgradeReason: 'x' },
    ];
    const mk = () =>
      plugin(
        { id: 'org.example.fast', permissions: { network: [], storage: false, downgrade: true } },
        { privacyOptions: () => ({ options: opts }) },
      );
    const denied = reg();
    denied.register(mk()); // requested, not granted
    const e1 = await denied.evaluateInvoice(INVOICE);
    expect(e1.options).toEqual([]);
    expect(e1.rejectedOptions.map((x) => x.reason)).toEqual([
      'DOWNGRADE_NOT_PERMITTED',
      'DOWNGRADE_NOT_PERMITTED',
      'MALFORMED',
    ]);

    const granted = reg();
    granted.register(mk(), { downgrade: true });
    const e2 = await granted.evaluateInvoice(INVOICE);
    expect(e2.downgrades.map((o) => [o.key, o.downgradeReason])).toEqual([
      ['org.example.fast/fast', 'Faster payout; timing is linkable'],
    ]);
    expect(e2.rejectedOptions.map((x) => x.reason)).toEqual(['MISSING_DOWNGRADE_REASON', 'MALFORMED']);
    // Effective settings are untouched by the mere existence of a downgrade option.
    expect(e2.effective).toEqual(DEFAULTS);
  });

  it('downgrade is judged against effective settings, not just defaults', async () => {
    const r = reg();
    r.register(delayPlugin('org.example.a', [], 3600));
    r.register(
      delayPlugin('org.example.b', [{ id: 'twenty-min', kind: 'delay', label: '20 min', value: 1200 }]),
    );
    const e = await r.evaluateInvoice(INVOICE);
    expect(e.options).toEqual([]);
    expect(e.rejectedOptions).toEqual([{ pluginId: 'org.example.b', index: 0, reason: 'SILENT_DOWNGRADE' }]);
  });

  it('bounds options per plugin', async () => {
    const r = reg();
    const opts = Array.from({ length: MAX_OPTIONS_PER_PLUGIN + 1 }, (_, i) => ({
      id: `o${i}`,
      kind: 'delay' as const,
      label: 'x',
      value: 3600 + i,
    }));
    r.register(delayPlugin('org.example.many', opts));
    const e = await r.evaluateInvoice(INVOICE);
    expect(e.failures).toEqual([
      { pluginId: 'org.example.many', hook: 'privacyOptions', code: 'BAD_OUTPUT' },
    ]);
  });
});

describe('isolation', () => {
  it('isolates throws and timeouts; other plugins still contribute; errors are not echoed', async () => {
    const r = reg();
    r.register(
      plugin(
        { id: 'org.example.boom' },
        {
          privacyOptions: () => {
            throw new Error('secret-internal-detail');
          },
        },
      ),
    );
    r.register(plugin({ id: 'org.example.hang' }, { privacyOptions: () => never() }));
    r.register(
      plugin({ id: 'org.example.reject' }, { privacyOptions: () => Promise.reject(new Error('x')) }),
    );
    r.register(delayPlugin('org.example.ok', [], 1800));
    const e = await r.evaluateInvoice(INVOICE);
    expect(e.effective.delaySeconds).toBe(1800);
    expect(e.failures).toEqual([
      { pluginId: 'org.example.boom', hook: 'privacyOptions', code: 'THREW' },
      { pluginId: 'org.example.hang', hook: 'privacyOptions', code: 'TIMEOUT' },
      { pluginId: 'org.example.reject', hook: 'privacyOptions', code: 'THREW' },
    ]);
    expect(JSON.stringify(e)).not.toContain('secret-internal-detail');
  });

  it('a required plugin failure fails the evaluation closed', async () => {
    const r = reg();
    r.register(plugin({ id: 'org.example.hang' }, { privacyOptions: () => never() }), {}, { required: true });
    await expect(r.evaluateInvoice(INVOICE)).rejects.toThrow(/required plugin/);
  });

  it('revokes the context when the hook times out', async () => {
    let captured: PluginContext | undefined;
    const net = new FakeNetwork();
    const r = reg({ network: net });
    r.register(
      plugin(
        {
          id: 'org.example.late',
          permissions: { network: ['api.example.com'], storage: false, downgrade: false },
        },
        {
          privacyOptions: (ctx) => {
            captured = ctx;
            return never();
          },
        },
      ),
      { network: ['api.example.com'] },
    );
    await r.evaluateInvoice(INVOICE);
    await expect(captured!.network!.fetch('https://api.example.com/')).rejects.toThrow(/permission/);
    expect(net.calls).toEqual([]);
  });

  it('uses the injected scheduler and clears timers', async () => {
    const log: string[] = [];
    const r = reg({
      scheduler: {
        setTimeout: (fn, ms) => {
          log.push(`set:${ms}`);
          return globalThis.setTimeout(fn, ms);
        },
        clearTimeout: (h) => {
          log.push('clear');
          globalThis.clearTimeout(h as ReturnType<typeof setTimeout>);
        },
      },
      clock: () => 42,
    });
    let now = 0;
    r.register(
      plugin(
        { id: 'org.example.t' },
        {
          privacyOptions: (ctx) => {
            now = ctx.now();
            return undefined;
          },
        },
      ),
    );
    await r.evaluateInvoice(INVOICE);
    expect(log).toEqual(['set:20', 'clear']);
    expect(now).toBe(42);
  });

  it('gives plugins a frozen copy of the invoice, never the host object', async () => {
    const host = { ...INVOICE };
    const r = reg();
    r.register(
      plugin(
        { id: 'org.example.mut' },
        {
          privacyOptions: (_ctx, inv) => {
            (inv as { amount: string }).amount = '1';
            return undefined;
          },
        },
      ),
    );
    const e = await r.evaluateInvoice(host);
    expect(e.failures[0]?.code).toBe('THREW');
    expect(host.amount).toBe('250000000');
    await expect(r.evaluateInvoice({ ...INVOICE, amount: '1.5' })).rejects.toThrow(/invoice.amount/);
    await expect(r.evaluateInvoice({ ...INVOICE, memo: 'x' } as never)).rejects.toThrow(PluginError);
  });

  it('default scheduler and clock work', async () => {
    const r = new PluginRegistry({ defaults: DEFAULTS });
    r.register(delayPlugin('org.example.ok', [], 900));
    expect((await r.evaluateInvoice(INVOICE)).effective.delaySeconds).toBe(900);
  });
});

describe('applyPrivacySelection', () => {
  async function evaluation() {
    const r = reg();
    r.register(
      plugin(
        {
          id: 'org.example.p',
          capabilities: ['privacy:delay', 'privacy:relay'],
          permissions: { network: [], storage: false, downgrade: true },
        },
        {
          privacyOptions: () => ({
            options: [
              { id: 'slow', kind: 'delay', label: 'Slow', value: 7200 },
              { id: 'slower', kind: 'delay', label: 'Slower', value: 14_400 },
              {
                id: 'direct',
                kind: 'relay',
                label: 'Direct',
                value: false,
                downgrade: true,
                downgradeReason: 'Reveals IP to RPC',
              },
            ],
          }),
        },
      ),
      { downgrade: true },
    );
    return r.evaluateInvoice(INVOICE);
  }

  it('applies stronger options without acknowledgement', async () => {
    const e = await evaluation();
    const a = applyPrivacySelection(e, { optionKeys: ['org.example.p/slow'], acknowledgedDowngrades: [] });
    expect(a.settings).toEqual({ delaySeconds: 7200, relay: true, batchSize: 8 });
    expect(a.appliedDowngrades).toEqual([]);
    expect(applyPrivacySelection(e, { optionKeys: [], acknowledgedDowngrades: [] }).settings).toEqual(
      DEFAULTS,
    );
  });

  it('never applies a downgrade without explicit acknowledgement', async () => {
    const e = await evaluation();
    expect(
      errPath(() =>
        applyPrivacySelection(e, { optionKeys: ['org.example.p/direct'], acknowledgedDowngrades: [] }),
      ),
    ).toBe('SELECTION:acknowledgedDowngrades');
    const a = applyPrivacySelection(e, {
      optionKeys: ['org.example.p/direct'],
      acknowledgedDowngrades: ['org.example.p/direct'],
    });
    expect(a.settings.relay).toBe(false);
    expect(a.appliedDowngrades).toEqual(['org.example.p/direct']);
  });

  it('rejects unknown keys, conflicting kinds and tampered evaluations', async () => {
    const e = await evaluation();
    expect(
      errPath(() =>
        applyPrivacySelection(e, { optionKeys: ['org.example.p/nope'], acknowledgedDowngrades: [] }),
      ),
    ).toBe('SELECTION:optionKeys');
    expect(
      errPath(() =>
        applyPrivacySelection(e, {
          optionKeys: ['org.example.p/slow', 'org.example.p/slower'],
          acknowledgedDowngrades: [],
        }),
      ),
    ).toBe('SELECTION:kind');
    const tampered = { ...e, options: e.options.map((o) => (o.id === 'slow' ? { ...o, value: 0 } : o)) };
    expect(
      errPath(() =>
        applyPrivacySelection(tampered, { optionKeys: ['org.example.p/slow'], acknowledgedDowngrades: [] }),
      ),
    ).toBe('SELECTION:kind');
  });
});

describe('privacy merge properties', () => {
  const settings = fc.record({
    delaySeconds: fc.integer({ min: 0, max: 604_800 }),
    relay: fc.boolean(),
    batchSize: fc.integer({ min: 1, max: 1000 }),
  });
  const restr = fc.record(
    {
      minDelaySeconds: fc.integer({ min: 0, max: 604_800 }),
      relayRequired: fc.constant(true as const),
      minBatchSize: fc.integer({ min: 1, max: 1000 }),
    },
    { requiredKeys: [] },
  );

  it('tighten never weakens any field and is commutative', () => {
    fc.assert(
      fc.property(settings, restr, restr, (base: PrivacySettings, r1, r2) => {
        const t = tighten(base, r1);
        expect(isWeaker('delay', t.delaySeconds, base)).toBe(false);
        expect(isWeaker('relay', t.relay, base)).toBe(false);
        expect(isWeaker('batching', t.batchSize, base)).toBe(false);
        expect(tighten(tighten(base, r1), r2)).toEqual(tighten(tighten(base, r2), r1));
      }),
      { numRuns: 500, seed: 42 },
    );
  });
});
