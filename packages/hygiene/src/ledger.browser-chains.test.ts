import { describe, expect, it } from 'vitest';
import { CHAINS } from '@ghostpay/chain-adapters';
import { DestLedger } from './ledger.js';
import { assertTestnetChain } from './testnet.js';
import { HygieneError } from './errors.js';
import { A1, A2, A3 } from './fixtures.testutil.js';

/**
 * GP-BUG-06 / CC-01: the browser offers seven EVM testnets, but the
 * sweep destination history previously accepted only Sepolia and Base.
 * Keep the ledger policy bound to enabled testnet chain metadata without
 * widening the smaller PoC-only RPC helper allowlist.
 */
const enabledBrowserTestnets = CHAINS.filter((c) => c.enabled && c.testnet).map((c) => c.chainId);

describe('GP-BUG-06: destination history follows the enabled browser testnets', () => {
  it('pins the supported seven EVM testnets to detect chain policy drift', () => {
    expect([...enabledBrowserTestnets].sort((a, b) => a - b)).toEqual(
      [97, 80002, 43113, 421614, 84532, 11155111, 11155420].sort((a, b) => a - b),
    );
  });

  it.each(enabledBrowserTestnets)('records, retrieves and protects reuse on testnet %i', (chainId) => {
    const ledger = new DestLedger();
    expect(ledger.canUse(chainId, A1, A2)).toEqual({ ok: true });
    ledger.record(chainId, A1, A2, 0);
    expect(ledger.linkedSources(chainId, A1)).toEqual([A2]);
    expect(ledger.canUse(chainId, A1, A3)).toEqual({ ok: false, reason: 'DEST_HAS_OTHER_SOURCE' });
    expect(() => ledger.record(chainId, A1, A3)).toThrow(HygieneError);

    // A session restoring its encrypted ledger must retain the advisory.
    const restored = DestLedger.from(JSON.parse(JSON.stringify(ledger.toJSON())) as unknown);
    expect(restored.linkedSources(chainId, A1)).toEqual([A2]);
    expect(restored.canUse(chainId, A1, A3)).toEqual({ ok: false, reason: 'DEST_HAS_OTHER_SOURCE' });
  });

  it('preserves Anvil for local testing without enabling other networks', () => {
    const ledger = new DestLedger();
    ledger.record(31337, A1, A2);
    expect(ledger.linkedSources(31337, A1)).toEqual([A2]);
    expect(DestLedger.from(ledger.toJSON()).linkedSources(31337, A1)).toEqual([A2]);
  });

  it('rejects every listed mainnet, unknown chain and malformed chain ID', () => {
    const bad = [...CHAINS.filter((c) => !c.enabled || !c.testnet).map((c) => c.chainId), 0, -1, 9999999, 1.5, Number.NaN, Number.POSITIVE_INFINITY];
    for (const id of bad) {
      const ledger = new DestLedger();
      expect(() => ledger.canUse(id, A1, A2)).toThrow(HygieneError);
      expect(() => ledger.record(id, A1, A2)).toThrow(HygieneError);
      expect(() => ledger.linkedSources(id, A1)).toThrow(HygieneError);
      expect(() => DestLedger.from([{ chainId: id, destination: A1, sources: [A2] }])).toThrow(HygieneError);
    }
  });

  it('keeps the narrower experimental hygiene RPC helper guard unchanged', () => {
    expect(() => assertTestnetChain(11155111)).not.toThrow();
    expect(() => assertTestnetChain(84532)).not.toThrow();
    expect(() => assertTestnetChain(31337)).not.toThrow();
    for (const id of [97, 80002, 43113, 421614, 11155420]) {
      expect(() => assertTestnetChain(id)).toThrow(HygieneError);
    }
  });

  it('does not mix one chain\'s source history with another', () => {
    const ledger = new DestLedger();
    ledger.record(11155111, A1, A2);
    expect(ledger.linkedSources(84532, A1)).toEqual([]);
    expect(ledger.canUse(84532, A1, A3)).toEqual({ ok: true });
  });
});
