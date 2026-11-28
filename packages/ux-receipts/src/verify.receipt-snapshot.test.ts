import { describe, expect, it } from 'vitest';
import { digestBody } from './digest.js';
import { verifyReceipt, type ChainLookupResult } from './verify.js';

const originalHash = `0x${'11'.repeat(32)}`;
const replacementHash = `0x${'22'.repeat(32)}`;

async function fixture() {
  const body = {
    v: 1,
    type: 'ghostpay.receipt',
    createdAt: '2026-01-01T00:00:00.000Z',
    chain: 'eip155:11155111',
    asset: { symbol: 'ETH', decimals: 18 },
    amount: '100',
    txHash: originalHash,
    redacted: ['memo', 'sender', 'recipient'],
  };
  return { ...body, digest: { alg: 'SHA-256', hex: await digestBody(body) } };
}

describe('verifyReceipt receipt snapshot', () => {
  it('queries the transaction whose receipt was digested', async () => {
    const receipt = await fixture();
    const queried: string[] = [];
    const result = verifyReceipt(receipt, {
      verifier: {
        lookup: ({ txHash }) => {
          queried.push(txHash);
          return Promise.resolve<ChainLookupResult>(txHash === originalHash
            ? { status: 'not_found' }
            : { status: 'found', facts: { confirmed: true, amountBase: '100' } });
        },
      },
    });
    receipt.txHash = replacementHash;
    expect((await result).verdict).toBe('chain_problem');
    expect(queried).toEqual([originalHash]);
  });

  it('compares the original amount even if the input changes during lookup', async () => {
    const receipt = await fixture();
    const report = await verifyReceipt(receipt, {
      verifier: {
        lookup: () => {
          receipt.amount = '200';
          return Promise.resolve<ChainLookupResult>({ status: 'found', facts: { confirmed: true, amountBase: '200' } });
        },
      },
    });
    expect(report.chain.status).toBe('mismatch');
    expect(report.chain.mismatches).toContain('amount');
  });

  it('compares the original nested asset symbol during lookup', async () => {
    const receipt = await fixture();
    const report = await verifyReceipt(receipt, {
      verifier: {
        lookup: () => {
          receipt.asset.symbol = 'USDC';
          return Promise.resolve<ChainLookupResult>({ status: 'found', facts: { confirmed: true, assetSymbol: 'USDC' } });
        },
      },
    });
    expect(report.chain.status).toBe('mismatch');
    expect(report.chain.mismatches).toContain('asset');
  });

  it('does not accept an invalid initial digest replaced while hashing', async () => {
    const receipt = await fixture();
    const correct = receipt.digest.hex;
    receipt.digest.hex = '00'.repeat(32);
    const result = verifyReceipt(receipt);
    receipt.digest.hex = correct;
    expect((await result).verdict).toBe('invalid');
  });

  it('preserves ordinary object and JSON verification', async () => {
    const receipt = await fixture();
    expect((await verifyReceipt(receipt, {
      verifier: {
        lookup: () => Promise.resolve<ChainLookupResult>({ status: 'found', facts: { confirmed: true, amountBase: '100', assetSymbol: 'ETH' } }),
      },
    })).verdict).toBe('chain_confirmed');
    expect((await verifyReceipt(JSON.stringify(receipt))).verdict).toBe('self_consistent_unverified');
  });

  it('preserves the distinction between absent and explicitly undefined asset', async () => {
    const body = {
      v: 1,
      type: 'ghostpay.receipt',
      redacted: ['time', 'chain', 'amount', 'memo', 'txHash', 'sender', 'recipient'],
    };
    const receipt = { ...body, digest: { alg: 'SHA-256', hex: await digestBody(body) } };
    expect((await verifyReceipt(receipt)).verdict).toBe('self_consistent_unverified');
    await expect(verifyReceipt({ ...receipt, asset: undefined })).rejects.toThrow('unsupported value type');
  });

  it('never queries a chain for an invalid digest', async () => {
    const receipt = await fixture();
    receipt.amount = '999';
    let called = false;
    const report = await verifyReceipt(receipt, {
      verifier: { lookup: () => { called = true; return Promise.resolve<ChainLookupResult>({ status: 'not_found' }); } },
    });
    expect(report.verdict).toBe('invalid');
    expect(called).toBe(false);
  });
});
