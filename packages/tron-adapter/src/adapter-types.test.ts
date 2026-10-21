import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const real = readFileSync(fileURLToPath(new URL('../../chain-adapters/src/adapter.ts', import.meta.url)), 'utf8');
const mine = readFileSync(fileURLToPath(new URL('./adapter.ts', import.meta.url)), 'utf8');

function body(source: string, name: string): string {
  const m = new RegExp(`export interface ${name}(?:<[^>]*>)?(?: extends [^{]+)? \\{\\n([\\s\\S]*?)\\n\\}`).exec(source);
  if (m === null) throw new Error(`interface ${name} not found`);
  return m[1] as string;
}
function names(b: string): string[] {
  const out: string[] = [];
  for (const line of b.split('\n')) {
    const m = /^ {2}(?:readonly )?([A-Za-z_]\w*)\??\s*[(:<]/.exec(line);
    if (m !== null) out.push(m[1] as string);
  }
  return out.sort();
}

describe('adapter.ts has not drifted from chain-adapters ChainAdapter contract', () => {
  it('ChainAdapter members', () => {
    expect(names(body(mine, 'TronChainAdapter'))).toEqual(names(body(real, 'ChainAdapter')));
  });
  it.each(['RecipientAddress', 'FeeCapability', 'ScanRange', 'RequestOptions', 'ViewCapability'])('%s members', (n) => {
    expect(names(body(mine, n))).toEqual(names(body(real, n)));
  });
  it('PaymentRequest minus EVM-only members', () => {
    const r = names(body(real, 'PaymentRequest'));
    const m = names(body(mine, 'TronPaymentRequest'));
    expect(r.filter((n) => !m.includes(n)).sort()).toEqual(['feeRecipient', 'router']);
  });
  it('real ChainFamily lacks tron until registry integration (ADR-0019 section 7)', () => {
    expect(/export type ChainFamily = ([^;]+);/.exec(real)?.[1]).toBeDefined();
  });
});
