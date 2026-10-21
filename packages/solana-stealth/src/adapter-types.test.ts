import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SOURCE_PATH = fileURLToPath(new URL('../../chain-adapters/src/adapter.ts', import.meta.url));
const MINE_PATH = fileURLToPath(new URL('./adapter-types.ts', import.meta.url));

function interfaceBody(source: string, name: string): string {
  const m = new RegExp(
    `export interface ${name}(?:<[^>]*>)?(?: extends [^{]+)? \\{\\n([\\s\\S]*?)\\n\\}`,
  ).exec(source);
  if (m === null) throw new Error(`interface ${name} not found`);
  return m[1] as string;
}

function memberNames(body: string): string[] {
  const names: string[] = [];
  for (const line of body.split('\n')) {
    const m = /^ {2}(?:readonly )?([A-Za-z_]\w*)\??\s*[(:<]/.exec(line);
    if (m !== null) names.push(m[1] as string);
  }
  return names.sort();
}

function unionMembers(source: string, name: string): string[] {
  const m = new RegExp(`export type ${name} = ([^;]+);`).exec(source);
  if (m === null) throw new Error(`type ${name} not found`);
  return (m[1] as string)
    .split('|')
    .map((s) => s.trim().replaceAll("'", ''))
    .sort();
}

const real = readFileSync(SOURCE_PATH, 'utf8');
const mine = readFileSync(MINE_PATH, 'utf8');

describe('adapter-types.ts has not drifted from packages/chain-adapters/src/adapter.ts', () => {
  it('ChainAdapter has the same members', () => {
    const r = memberNames(interfaceBody(real, 'ChainAdapter'));
    expect(r).toEqual(['buildPaymentRequest', 'chainId', 'family', 'fees', 'parseRecipient', 'scan']);
    expect(memberNames(interfaceBody(mine, 'ChainAdapterShape'))).toEqual(r);
  });
  it.each(['RecipientAddress', 'FeeCapability', 'ScanRange', 'RequestOptions', 'ViewCapability'])(
    '%s has the same members',
    (name) => {
      expect(memberNames(interfaceBody(mine, name))).toEqual(memberNames(interfaceBody(real, name)));
    },
  );
  it('PaymentRequestCommon is PaymentRequest minus EVM-only members', () => {
    const r = memberNames(interfaceBody(real, 'PaymentRequest'));
    const m = memberNames(interfaceBody(mine, 'PaymentRequestCommon'));
    expect(r.filter((n) => !m.includes(n)).sort()).toEqual(['build', 'feeRecipient', 'router']);
    expect(m.filter((n) => !r.includes(n))).toEqual([]);
  });
  it('ChainFamily and FeeStatus unions match and include solana', () => {
    expect(unionMembers(mine, 'ChainFamily')).toEqual(unionMembers(real, 'ChainFamily'));
    expect(unionMembers(mine, 'ChainFamily')).toContain('solana');
    expect(unionMembers(mine, 'FeeStatus')).toEqual(unionMembers(real, 'FeeStatus'));
  });
});
