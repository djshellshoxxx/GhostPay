import { describe, it } from 'vitest';
import { appendFileSync } from 'node:fs';
import { SyntheticChain } from '../test/disclosureChain';
import { memoryCheckpoints, newSeller, runDisclosureScenario, sellerLog, strangerLog } from '../test/disclosureHarness';
import { addedSignatures, renderReport, summarize, WireFault } from '../test/rpcDisclosure';
const log = (...a: unknown[]): void => appendFileSync('/tmp/explore/out.txt', a.map(String).join(' ') + '\n');
const dump = (id: string, rows: readonly import('../test/rpcDisclosure').RpcDisclosureRecord[]): void => log(id, '\n  ' + rows.map((x) => `${x.role}:${x.method.replace('eth_', '')}${x.attempt ? '#r' + x.attempt : ''}[${x.classes.join('+')}]${x.blockRangeSize ?? ''}${x.revealsScanProgress ? '!P' : ''}${x.relatedToMatchedPayment ? '!M' : ''}${x.outcome === 'error' ? '!E' : ''}`).join('\n  '));

describe('explore', () => {
  it('prints', async () => {
    const s = newSeller();
    const mk = (logs: ReturnType<typeof sellerLog>[], head = 2500) => new SyntheticChain({ chainId: 84532, head, logs: logs.map((l) => l.log) });
    const sums = [];
    // D
    const m1 = sellerLog(s, { block: 120, index: 0 }), m2 = sellerLog(s, { block: 1500, index: 1 }), m3 = sellerLog(s, { block: 2100, index: 2 });
    const D = await runDisclosureScenario({ id: 'D-multi', seller: s, chain: mk([m1, m2, m3, strangerLog({ block: 130, index: 1 })]), matched: [m1, m2, m3], checkpoints: memoryCheckpoints() });
    sums.push(summarize('D', D.rec.records)); dump('D', D.rec.records); log('D matches', D.matches.length, D.error ?? '');
    // E
    const bad = sellerLog(s, { block: 150, index: 0, wrongTag: true });
    const unver = sellerLog(s, { block: 600, index: 1 });
    const chE = mk([bad, unver, strangerLog({ block: 130, index: 1 })]);
    chE.intercept = (m, p) => ((m === 'eth_getTransactionReceipt' || m === 'eth_getTransactionByHash') && String(p[0]).toLowerCase() === unver.log.transactionHash!.toLowerCase() ? null : undefined);
    const E = await runDisclosureScenario({ id: 'E-invalid', seller: s, chain: chE, rejected: [bad], matched: [], checkpoints: memoryCheckpoints() });
    sums.push(summarize('E', E.rec.records)); dump('E', E.rec.records); log('E matches', E.matches.map((m) => m.receipt), E.error ?? '');
    // G/H: reorg & resume
    const cp = memoryCheckpoints();
    const mine = sellerLog(s, { block: 120, index: 0 });
    const chG = mk([mine, strangerLog({ block: 2200, index: 1 })], 5000);
    const first = await runDisclosureScenario({ id: 'H-first', seller: s, chain: chG, matched: [mine], checkpoints: cp, maxPages: 1 });
    log('H first progress', first.progress.map((p) => `${p.nextBlock}/${p.caughtUp}`), first.cursor?.nextBlock, 'saved', cp.saved.length);
    sums.push(summarize('H-first', first.rec.records)); dump('H-first', first.rec.records);
    const resume = await runDisclosureScenario({ id: 'H-resume', seller: s, chain: chG, matched: [mine], checkpoints: cp, cursor: cp.load(1, 'x') ?? { nextBlock: 0n } });
    sums.push(summarize('H-resume', resume.rec.records)); dump('H-resume', resume.rec.records); log('resume err', resume.error ?? '');
    chG.fork(100);
    const reorg = await runDisclosureScenario({ id: 'G-reorg', seller: s, chain: chG, matched: [mine], checkpoints: cp, cursor: cp.load(1, 'x') ?? { nextBlock: 0n } });
    sums.push(summarize('G-reorg', reorg.rec.records)); dump('G-reorg', reorg.rec.records); log('reorg err', reorg.error ?? '', 'clears', cp.clears);
    // I: disagreement
    const prim = mk([mine, strangerLog({ block: 130, index: 1 })]);
    const sec = mk([strangerLog({ block: 130, index: 1 })]);
    const I = await runDisclosureScenario({ id: 'I-disagree', seller: s, chain: prim, secondary: sec, matched: [mine], checkpoints: memoryCheckpoints() });
    sums.push(summarize('I', I.rec.records)); dump('I', I.rec.records); log('I disc', I.discrepancies, I.error ?? '');
    const primOk = mk([mine, strangerLog({ block: 130, index: 1 })]);
    const secOk = mk([mine, strangerLog({ block: 130, index: 1 })]);
    const I2 = await runDisclosureScenario({ id: 'I-agree', seller: s, chain: primOk, secondary: secOk, matched: [mine], checkpoints: memoryCheckpoints() });
    sums.push(summarize('I2', I2.rec.records)); dump('I2', I2.rec.records);
    // J
    const chJ = mk([mine, strangerLog({ block: 5300, index: 1 })], 12000);
    chJ.failNext('eth_getLogs', new WireFault('http', 503), 1);
    const J = await runDisclosureScenario({ id: 'J-large', seller: s, chain: chJ, matched: [mine], checkpoints: memoryCheckpoints() });
    sums.push(summarize('J', J.rec.records)); log('J', J.error ?? '', J.progress.length); dump('J', J.rec.records);
    log(renderReport('explore', sums));
    const A = await runDisclosureScenario({ id: 'A', seller: s, chain: mk([]), checkpoints: memoryCheckpoints() });
    const B = await runDisclosureScenario({ id: 'B', seller: s, chain: mk([strangerLog({ block: 130, index: 1 })]), checkpoints: memoryCheckpoints() });
    log('B-A', JSON.stringify([...addedSignatures(A.rec.records, B.rec.records)]));
  });
});
