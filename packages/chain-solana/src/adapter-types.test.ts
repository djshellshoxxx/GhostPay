import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SOURCE_PATH = fileURLToPath(new URL('../../chain-adapters/src/adapter.ts', import.meta.url));
const MINE_PATH = fileURLToPath(new URL('./adapter-types.ts', import.meta.url));

/** Body of `export interface Name ... { ... }` (up to the first line that is exactly `}`). */
function interfaceBody(source: string, name: string): string {
  const m = new RegExp(
    `export interface ${name}(?:<[^>]*>)?(?: extends [^{]+)? \\{\\n([\\s\\S]*?)\\n\\}`,
  ).exec(source);
  if (m === null) throw new Error(`interface ${name} not found`);
  return m[1] as string;
}

/** Top-level member names of an interface body (properties and methods). */
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

  it('PaymentRequestCommon is exactly PaymentRequest minus its EVM-only members', () => {
    const r = memberNames(interfaceBody(real, 'PaymentRequest'));
    const common = memberNames(interfaceBody(mine, 'PaymentRequestCommon'));
    expect(r.filter((n) => !common.includes(n))).toEqual(['build', 'feeRecipient', 'router']);
    expect(common.filter((n) => !r.includes(n))).toEqual([]);
  });

  it("ChainFamily and FeeStatus unions are identical and include 'solana'", () => {
    expect(unionMembers(mine, 'ChainFamily')).toEqual(unionMembers(real, 'ChainFamily'));
    expect(unionMembers(real, 'ChainFamily')).toContain('solana');
    expect(unionMembers(mine, 'FeeStatus')).toEqual(unionMembers(real, 'FeeStatus'));
  });

  it('the extractor itself detects members (self-test)', () => {
    const body = interfaceBody(
      'export interface X {\n  readonly a: string;\n  b(x: number): void;\n  /** doc */\n  readonly c?: number;\n}\n',
      'X',
    );
    expect(memberNames(body)).toEqual(['a', 'b', 'c']);
    expect(() => interfaceBody('nothing', 'X')).toThrow();
    expect(() => unionMembers('nothing', 'Y')).toThrow();
  });
});
