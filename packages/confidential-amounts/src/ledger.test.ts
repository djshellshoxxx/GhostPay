import { describe, expect, it } from 'vitest';
import { encodeFunctionData, getAddress, type Address, type Hex } from 'viem';
import { ROUTER_ABI, TOKEN_ABI, UINT64_MAX } from './abi.js';
import { CleartextBackend } from './backends/cleartext.js';
import { CleartextLedger } from './backends/ledger.js';
import { CtError } from './errors.js';
import { DEST, FEE_RECIPIENT, NOW, OTHER, PAYER, ROUTER, TOKEN, counterRandom } from './fixtures.testutil.js';

/**
 * Regression tests for divergences between `CleartextLedger` and the Solidity it simulates
 * (`GhostPayConfidentialRouter.sol`, OpenZeppelin `ERC7984` / `ERC7984ERC20Wrapper`).
 */

const ZERO: Address = '0x0000000000000000000000000000000000000000';

function setup(balance = 5_000n) {
  const ledger = new CleartextLedger(counterRandom());
  ledger.deployToken(TOKEN);
  ledger.deployRouter(ROUTER, FEE_RECIPIENT, [TOKEN]);
  ledger.wrap(TOKEN, PAYER, balance);
  return { ledger, backend: new CleartextBackend(ledger) };
}

function revertOf(fn: () => unknown): string {
  try {
    fn();
  } catch (e) {
    if (e instanceof CtError) return `${e.code}:${e.message}`;
    return `raw:${String(e)}`;
  }
  return 'no-revert';
}

const tokenTx = (data: Hex, value = 0n) => ({ to: TOKEN, data, value });

describe('B6a: finalizeUnwrap verifies the proof before consuming the request', () => {
  it('a bad proof reverts and leaves the request intact (as the on-chain revert would)', async () => {
    const { ledger, backend } = setup();
    const bal = ledger.confidentialBalanceOf(TOKEN, PAYER);
    const r = ledger.execute(backend.buildUnwrap({ chainId: 31337, token: TOKEN, from: PAYER, to: DEST, amountHandle: bal }), PAYER, NOW);
    const id = r.returned as Hex;
    const good = await backend.finalizeUnwrap({ chainId: 31337, token: TOKEN, requestId: id });
    const forged = tokenTx(encodeFunctionData({ abi: TOKEN_ABI, functionName: 'finalizeUnwrap', args: [id, 5_000n, '0xdead'] }));
    expect(revertOf(() => ledger.execute(forged, OTHER, NOW))).toBe('LEDGER_REVERT:invalid decryption proof');
    const wrongAmount = tokenTx(encodeFunctionData({ abi: TOKEN_ABI, functionName: 'finalizeUnwrap', args: [id, 4_999n, '0xdead'] }));
    expect(revertOf(() => ledger.execute(wrongAmount, OTHER, NOW))).toBe('LEDGER_REVERT:invalid decryption proof');
    ledger.execute(good, OTHER, NOW + 1);
    expect(ledger.underlyingOf(TOKEN, DEST)).toBe(5_000n);
    expect(revertOf(() => ledger.execute(good, OTHER, NOW + 2))).toBe('LEDGER_REVERT:InvalidUnwrapRequest');
  });
});

describe('B6b: zero receivers revert like ERC7984InvalidReceiver', () => {
  it('confidentialTransfer to the zero address reverts and moves nothing', () => {
    const { ledger } = setup();
    const bal = ledger.confidentialBalanceOf(TOKEN, PAYER);
    const tx = tokenTx(encodeFunctionData({ abi: TOKEN_ABI, functionName: 'confidentialTransfer', args: [ZERO, bal] }));
    expect(revertOf(() => ledger.execute(tx, PAYER, NOW))).toBe('LEDGER_REVERT:ERC7984InvalidReceiver');
    expect(ledger.balanceOf(TOKEN, PAYER)).toBe(5_000n);
  });

  it('the ACL check still comes first, as in OZ', () => {
    const { ledger } = setup();
    const bal = ledger.confidentialBalanceOf(TOKEN, PAYER);
    const tx = tokenTx(encodeFunctionData({ abi: TOKEN_ABI, functionName: 'confidentialTransfer', args: [ZERO, bal] }));
    expect(revertOf(() => ledger.execute(tx, OTHER, NOW))).toBe('LEDGER_REVERT:ERC7984UnauthorizedUseOfEncryptedAmount');
  });

  it('unwrap to the zero address reverts and burns nothing', () => {
    const { ledger } = setup();
    const bal = ledger.confidentialBalanceOf(TOKEN, PAYER);
    const tx = tokenTx(encodeFunctionData({ abi: TOKEN_ABI, functionName: 'unwrap', args: [PAYER, ZERO, bal] }));
    expect(revertOf(() => ledger.execute(tx, PAYER, NOW))).toBe('LEDGER_REVERT:ERC7984InvalidReceiver');
    expect(ledger.balanceOf(TOKEN, PAYER)).toBe(5_000n);
  });
});

describe('B6c: wrap enforces the uint64 total-supply cap (ERC7984TotalSupplyOverflow)', () => {
  it('refuses a wrap that would take the wrapped supply over 2^64-1, and to the zero address', () => {
    const ledger = new CleartextLedger(counterRandom());
    ledger.deployToken(TOKEN);
    ledger.wrap(TOKEN, PAYER, UINT64_MAX - 10n);
    expect(revertOf(() => ledger.wrap(TOKEN, OTHER, 11n))).toBe('LEDGER_REVERT:ERC7984TotalSupplyOverflow');
    expect(ledger.balanceOf(TOKEN, OTHER)).toBe(0n);
    ledger.wrap(TOKEN, OTHER, 10n);
    expect(ledger.balanceOf(TOKEN, OTHER)).toBe(10n);
    expect(revertOf(() => ledger.wrap(TOKEN, OTHER, 1n))).toBe('LEDGER_REVERT:ERC7984TotalSupplyOverflow');
    expect(revertOf(() => ledger.wrap(TOKEN, ZERO, 0n))).toBe('LEDGER_REVERT:ERC7984InvalidReceiver');
  });

  it('a finalized unwrap releases underlying and makes room again; a pending one does not', async () => {
    const ledger = new CleartextLedger(counterRandom());
    ledger.deployToken(TOKEN);
    const backend = new CleartextBackend(ledger);
    ledger.wrap(TOKEN, PAYER, UINT64_MAX);
    const bal = ledger.confidentialBalanceOf(TOKEN, PAYER);
    const r = ledger.execute(backend.buildUnwrap({ chainId: 31337, token: TOKEN, from: PAYER, to: DEST, amountHandle: bal }), PAYER, NOW);
    // the wrapper still holds the underlying until finalizeUnwrap (OZ inferredTotalSupply)
    expect(revertOf(() => ledger.wrap(TOKEN, OTHER, 1n))).toBe('LEDGER_REVERT:ERC7984TotalSupplyOverflow');
    ledger.execute(await backend.finalizeUnwrap({ chainId: 31337, token: TOKEN, requestId: r.returned as Hex }), OTHER, NOW + 1);
    ledger.wrap(TOKEN, OTHER, 1n);
    expect(ledger.balanceOf(TOKEN, OTHER)).toBe(1n);
  });
});

describe('B6d: non-payable functions revert on a non-zero value', () => {
  it('every token function and flushFees refuse ETH; payConfidential stays payable', () => {
    const { ledger } = setup();
    const bal = ledger.confidentialBalanceOf(TOKEN, PAYER);
    const calls: Hex[] = [
      encodeFunctionData({ abi: TOKEN_ABI, functionName: 'setOperator', args: [ROUTER, NOW + 100] }),
      encodeFunctionData({ abi: TOKEN_ABI, functionName: 'confidentialTransfer', args: [DEST, bal] }),
      encodeFunctionData({ abi: TOKEN_ABI, functionName: 'unwrap', args: [PAYER, DEST, bal] }),
      encodeFunctionData({ abi: TOKEN_ABI, functionName: 'finalizeUnwrap', args: [bal, 1n, '0x'] }),
    ];
    for (const data of calls) {
      expect(revertOf(() => ledger.execute(tokenTx(data, 1n), PAYER, NOW)), data.slice(0, 10)).toBe('LEDGER_REVERT:non-payable function');
    }
    expect(ledger.balanceOf(TOKEN, PAYER)).toBe(5_000n);
    const flush = { to: ROUTER, value: 1n, data: encodeFunctionData({ abi: ROUTER_ABI, functionName: 'flushFees', args: [TOKEN] }) };
    expect(revertOf(() => ledger.execute(flush, OTHER, NOW))).toBe('LEDGER_REVERT:non-payable function');
  });

  it('plain ETH and unknown selectors revert with LEDGER_REVERT, never a raw decoder error', () => {
    const { ledger } = setup();
    expect(revertOf(() => ledger.execute({ to: ROUTER, value: 1n, data: '0x' }, PAYER, NOW))).toBe('LEDGER_REVERT:NoDirectETH');
    expect(revertOf(() => ledger.execute({ to: ROUTER, value: 0n, data: '0x12345678' }, PAYER, NOW))).toBe('LEDGER_REVERT:NoDirectETH');
    expect(revertOf(() => ledger.execute({ to: TOKEN, value: 0n, data: '0x12345678' }, PAYER, NOW))).toBe('LEDGER_REVERT:unsupported token function');
    const view = encodeFunctionData({ abi: TOKEN_ABI, functionName: 'confidentialBalanceOf', args: [PAYER] });
    expect(revertOf(() => ledger.execute(tokenTx(view), PAYER, NOW))).toBe('LEDGER_REVERT:unsupported token function');
  });
});

describe('B6e: deployRouter mirrors the router constructor checks', () => {
  const ledger = new CleartextLedger(counterRandom());
  const tokens = (n: number): Address[] => Array.from({ length: n }, (_, i) => getAddress(`0x${(0x100 + i).toString(16).padStart(40, '0')}`));

  it.each([
    ['zero fee recipient', () => ledger.deployRouter(ROUTER, ZERO, [TOKEN]), 'ZeroAddress'],
    ['fee recipient is the router', () => ledger.deployRouter(ROUTER, ROUTER, [TOKEN]), 'InvalidStealth'],
    ['empty token list', () => ledger.deployRouter(ROUTER, FEE_RECIPIENT, []), 'InvalidTokenList'],
    ['more than MAX_TOKENS (8)', () => ledger.deployRouter(ROUTER, FEE_RECIPIENT, tokens(9)), 'InvalidTokenList'],
    ['zero token', () => ledger.deployRouter(ROUTER, FEE_RECIPIENT, [TOKEN, ZERO]), 'ZeroAddress'],
    ['duplicate token (any case)', () => ledger.deployRouter(ROUTER, FEE_RECIPIENT, [TOKEN, TOKEN.toLowerCase() as Address]), 'InvalidTokenList'],
  ] as const)('%s reverts', (_name, fn, error) => {
    expect(revertOf(fn)).toBe(`LEDGER_REVERT:${error}`);
  });

  it('accepts 1..8 distinct tokens', () => {
    expect(() => ledger.deployRouter(ROUTER, FEE_RECIPIENT, tokens(8))).not.toThrow();
    expect(() => ledger.deployRouter(OTHER, FEE_RECIPIENT, [TOKEN])).not.toThrow();
  });
});
