import { describe, expect, it } from 'vitest';
import { addStep, defaultLayers, moveStep, newPipeline, nextKinds, removeStep } from './build.js';
import { PipelineError } from './errors.js';
import { checkJoin } from './join.js';
import { ANVIL, BTC_SIGNET, SEPOLIA, fullCtx, pipe, step as s } from './fixtures.testutil.js';

describe('builders', () => {
  const c = fullCtx();
  it('newPipeline validates id and chain', () => {
    expect(() => newPipeline({ id: '', role: 'payer', chain: SEPOLIA, asset: 'erc20' })).toThrow(
      PipelineError,
    );
    expect(() => newPipeline({ id: 'a b', role: 'payer', chain: SEPOLIA, asset: 'erc20' })).toThrow(
      PipelineError,
    );
    expect(() => newPipeline({ id: 'x'.repeat(65), role: 'payer', chain: SEPOLIA, asset: 'erc20' })).toThrow(
      PipelineError,
    );
    const p = newPipeline({
      id: 'ok-1',
      role: 'payer',
      chain: SEPOLIA,
      asset: 'erc20',
      ctBackend: 'ct1-zama',
      invoiceGross: '5',
      layers: defaultLayers(),
    });
    expect(p).toMatchObject({ v: 1, ctBackend: 'ct1-zama', invoiceGross: '5' });
  });
  it('addStep / removeStep / moveStep return new pipelines with live validation', () => {
    let p = pipe('payer', []);
    let b = addStep(p, s('src.wallet'), c);
    expect(b.pipeline.steps).toHaveLength(1);
    expect(p.steps).toHaveLength(0);
    b = addStep(b.pipeline, s('pay.submit'), c);
    expect(b.validation.ok).toBe(true);
    b = addStep(b.pipeline, s('amount.shape'), c, 1);
    expect(b.pipeline.steps.map((x) => x.kind)).toEqual(['src.wallet', 'amount.shape', 'pay.submit']);
    b = moveStep(b.pipeline, 1, 0, c);
    expect(b.validation.ok).toBe(false);
    b = moveStep(b.pipeline, 0, 1, c);
    expect(b.validation.ok).toBe(true);
    b = removeStep(b.pipeline, 1, c);
    expect(b.pipeline.steps.map((x) => x.kind)).toEqual(['src.wallet', 'pay.submit']);
    p = b.pipeline;
    for (const fn of [
      () => addStep(p, s('src.wallet'), c, 9),
      () => addStep(p, s('src.wallet'), c, -1),
      () => addStep(p, s('src.wallet'), c, 0.5),
      () => removeStep(p, 2, c),
      () => removeStep(p, -1, c),
      () => moveStep(p, 5, 0, c),
      () => moveStep(p, 0, 5, c),
      () => moveStep(p, 0.2, 0, c),
    ]) {
      expect(fn).toThrow(PipelineError);
    }
  });
  it('nextKinds lists only steps whose input matches the tail', () => {
    expect(nextKinds(pipe('payer', []))).toEqual(['src.wallet']);
    expect(nextKinds(pipe('seller', []))).toEqual(['recv.stealth']);
    expect(nextKinds(pipe('payer', [], { chain: BTC_SIGNET, asset: 'btc' }))).toEqual(['btc.send']);
    expect(nextKinds(pipe('seller', [], { chain: BTC_SIGNET, asset: 'btc' }))).toEqual(['btc.recv']);
    expect(nextKinds(pipe('payer', [s('src.wallet')]))).toEqual([
      'payer.fresh-wallet',
      'ct.wrap',
      'amount.shape',
      'pool.deposit',
      'pay.submit',
    ]);
    expect(nextKinds(pipe('seller', [s('recv.stealth')]))).toEqual([
      'pool.deposit',
      'sweep.delay',
      'hops.forward',
      'hygiene.sweep',
    ]);
    expect(nextKinds(pipe('seller', [s('recv.stealth'), s('hygiene.sweep')]))).toEqual([]);
    expect(nextKinds(pipe('payer', [s('src.wallet'), s('pay.submit')]))).toEqual([]);
    expect(nextKinds(pipe('payer', [s('bogus' as never)]))).toEqual([]);
    expect(nextKinds(pipe('payer', [s('pay.submit')]))).toEqual([]);
  });
});

describe('checkJoin (payment edge between two pipelines, C-31)', () => {
  const payerStd = pipe('payer', [s('src.wallet'), s('pay.submit')]);
  const sellerStd = pipe('seller', [s('recv.stealth'), s('hygiene.sweep')]);
  const keys = (a: ReturnType<typeof checkJoin>): (string | undefined)[] => a.map((i) => i.detail ?? i.key);
  it('standard pair is consistent', () => {
    expect(checkJoin(payerStd, sellerStd)).toEqual([]);
  });
  it('origin must match: pool payer needs a pool-origin seller; router payer a router seller', () => {
    const payerPool = pipe('payer', [s('src.wallet'), s('pool.deposit'), s('pay.from-pool')]);
    expect(keys(checkJoin(payerPool, sellerStd))).toEqual(['origin']);
    expect(
      checkJoin(payerPool, pipe('seller', [s('recv.stealth', { origin: 'pool' }), s('hygiene.sweep')])),
    ).toEqual([]);
    expect(
      keys(checkJoin(payerStd, pipe('seller', [s('recv.stealth', { origin: 'pool' }), s('hygiene.sweep')]))),
    ).toEqual(['origin']);
  });
  it('confidential payer needs a confidential seller; asset must match', () => {
    const payerCt = pipe('payer', [s('src.wallet'), s('ct.wrap'), s('pay.submit')], { asset: 'erc20' });
    const sellerCt = pipe('seller', [s('recv.stealth', { origin: 'confidential-router' }), s('ct.sweep')], {
      asset: 'confidential',
    });
    expect(checkJoin(payerCt, sellerCt)).toEqual([]);
    expect(keys(checkJoin(payerCt, sellerStd))).toEqual(expect.arrayContaining(['origin']));
    expect(
      keys(checkJoin(payerStd, pipe('seller', [s('recv.stealth'), s('hygiene.sweep')], { asset: 'native' }))),
    ).toEqual(['asset']);
  });
  it('C-31: payer pool exit and seller deposit into the same pool warns', () => {
    const payerPool = pipe('payer', [s('src.wallet'), s('pool.deposit'), s('pay.from-pool')]);
    const sellerPool = pipe('seller', [
      s('recv.stealth', { origin: 'pool' }),
      s('pool.deposit'),
      s('pool.dwell'),
      s('pool.exit'),
    ]);
    const r = checkJoin(payerPool, sellerPool);
    expect(r.map((i) => i.ruleId)).toEqual(['C-31']);
    const other = pipe('seller', [
      s('recv.stealth', { origin: 'pool' }),
      s('pool.deposit', { pool: 'railgun' }),
      s('pool.dwell'),
      s('pool.exit'),
    ]);
    expect(checkJoin(payerPool, other)).toEqual([]);
  });
  it('btc: one mode per payment (BPJ-URI-2)', () => {
    const payerBtc = pipe('payer', [s('btc.send', { mode: 'payjoin-v2' })], {
      chain: BTC_SIGNET,
      asset: 'btc',
    });
    const sellerBtc = pipe('seller', [s('btc.recv', { mode: 'payjoin-v2' })], {
      chain: BTC_SIGNET,
      asset: 'btc',
    });
    expect(checkJoin(payerBtc, sellerBtc)).toEqual([]);
    expect(
      keys(checkJoin(payerBtc, pipe('seller', [s('btc.recv')], { chain: BTC_SIGNET, asset: 'btc' }))),
    ).toEqual(['btc.mode']);
    expect(keys(checkJoin(payerBtc, sellerStd))).toEqual(expect.arrayContaining(['chain']));
  });
  it('role, chain and structure problems', () => {
    expect(keys(checkJoin(sellerStd, payerStd))).toEqual(['role']);
    expect(
      keys(checkJoin(payerStd, pipe('seller', [s('recv.stealth'), s('hygiene.sweep')], { chain: ANVIL }))),
    ).toEqual(['chain']);
    expect(keys(checkJoin(pipe('payer', [s('src.wallet')]), sellerStd))).toEqual(['payer-not-paid']);
    expect(keys(checkJoin(pipe('payer', []), sellerStd))).toEqual(['payer-not-paid']);
    expect(keys(checkJoin({ ...payerStd, steps: [{ kind: 'x' as never }] }, sellerStd))).toEqual([
      'structure',
    ]);
    expect(checkJoin(payerStd, pipe('seller', []))).toEqual([]);
  });
});
