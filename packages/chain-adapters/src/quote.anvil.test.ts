import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getAddress, toHex } from 'viem/utils';
import { SEPOLIA } from './fixtures.testutil.js';
import { createAggregatorReader, readPrice, type AggregatorReader, type RoundData } from './quote.js';
import { createClient, type RpcClient } from './rpc.js';
import type { Address } from './types.js';

const ANVIL = process.env['ANVIL_BIN'] ?? 'anvil';
const SOLC = process.env['SOLC_BIN'] ?? 'solc';
const installed = (binary: string): boolean => binary.includes('/') ? existsSync(binary)
  : (process.env['PATH'] ?? '').split(':').some((directory) => existsSync(`${directory}/${binary}`));
const available = installed(ANVIL) && installed(SOLC);
const PRIMARY = getAddress('0x00000000000000000000000000000000000000f1');
const REFERENCE = getAddress('0x00000000000000000000000000000000000000f2');
const SEQUENCER = getAddress('0x00000000000000000000000000000000000000f3');
const NOW = 1_800_000_000n;
const options = { now: NOW, maxAgeSeconds: 300n, expectedDecimals: 8 };

// Test-only aggregator installed at disposable Anvil addresses. No real deployment or feed provenance is asserted.
const MOCK = `pragma solidity 0.8.28;
contract MockQuoteAggregator {
  function decimals() external view returns (uint8 result) { assembly { result := sload(5) } }
  function latestRoundData() external view returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound) {
    assembly { roundId := sload(0) answer := sload(1) startedAt := sload(2) updatedAt := sload(3) answeredInRound := sload(4) }
  }
}`;

describe('price guards against a compiled local aggregator (anvil)', () => {
  it('requires Anvil and solc when REQUIRE_ANVIL=1', () => {
    if (process.env['REQUIRE_ANVIL'] === '1') expect(available, 'REQUIRE_ANVIL=1 needs anvil and solc').toBe(true);
  });

  describe.skipIf(!available)('real ABI reads from the isolated EVM', () => {
    let process: ChildProcess | undefined;
    let rpc: RpcClient;
    let reader: AggregatorReader;

    beforeAll(async () => {
      const compiled = JSON.parse(execFileSync(SOLC, ['--standard-json'], {
        input: JSON.stringify({ language: 'Solidity', sources: { 'MockQuoteAggregator.sol': { content: MOCK } },
          settings: { outputSelection: { '*': { '*': ['evm.deployedBytecode.object'] } } } }),
        encoding: 'utf8', timeout: 20_000, maxBuffer: 1_000_000,
      })) as { contracts: Record<string, Record<string, { evm: { deployedBytecode: { object: string } } }>> };
      const runtime = compiled.contracts['MockQuoteAggregator.sol']?.['MockQuoteAggregator']?.evm.deployedBytecode.object;
      if (runtime === undefined || runtime.length === 0) throw new Error('mock aggregator compilation failed');
      const url = await new Promise<string>((resolve, reject) => {
        const child = spawn(ANVIL, ['--port', '0', '--host', '127.0.0.1', '--chain-id', String(SEPOLIA.chainId)], { stdio: ['ignore', 'pipe', 'pipe'] });
        process = child;
        let output = '';
        const fail = (): void => { clearTimeout(timer); child.kill('SIGKILL'); reject(new Error('local quote Anvil failed to start')); };
        const timer = setTimeout(fail, 20_000);
        child.stdout?.on('data', (chunk: Buffer) => {
          output = (output + chunk.toString()).slice(-65_536);
          const match = /Listening on (127\.0\.0\.1:[0-9]+)/.exec(output);
          if (match?.[1] !== undefined) { clearTimeout(timer); resolve(`http://${match[1]}`); }
        });
        child.once('error', fail);
        child.once('exit', () => { clearTimeout(timer); reject(new Error('local quote Anvil exited')); });
      });
      rpc = await createClient(SEPOLIA, url, { allowInsecureLocalhost: true, retries: 0 });
      reader = createAggregatorReader(rpc);
      for (const address of [PRIMARY, REFERENCE, SEQUENCER]) await rpc.request('anvil_setCode', [address, `0x${runtime}`]);
    });

    afterAll(() => { process?.kill('SIGKILL'); });

    async function setRound(address: Address, overrides: Partial<RoundData> = {}, decimals = 8): Promise<void> {
      const round: RoundData = { roundId: 1n, answer: 100_000_000n, startedAt: NOW - 10n, updatedAt: NOW - 10n, answeredInRound: 1n, ...overrides };
      const values = [round.roundId, round.answer, round.startedAt, round.updatedAt, round.answeredInRound, BigInt(decimals)];
      for (const [index, value] of values.entries()) await rpc.request('anvil_setStorageAt', [address, toHex(index, { size: 32 }), toHex(BigInt.asUintN(256, value), { size: 32 })]);
    }

    it('accepts matching fresh prices and an up sequencer after grace', async () => {
      await setRound(PRIMARY);
      await setRound(REFERENCE, { answer: 10n ** 18n }, 18);
      await setRound(SEQUENCER, { answer: 0n, startedAt: NOW - 3601n });
      await expect(readPrice(reader, PRIMARY, { ...options, sequencerFeed: SEQUENCER, enforceUsdPeg: true,
        reference: { reader, feed: REFERENCE, expectedDecimals: 18, maxAgeSeconds: 300n } })).resolves.toMatchObject({ answer: 100_000_000n, decimals: 8 });
    });

    it('refuses stale, negative, zero, round regression and unexpected precision from the EVM', async () => {
      for (const [overrides, reason] of [
        [{ updatedAt: NOW - 301n }, /stale/], [{ answer: -1n }, /non-positive/], [{ answer: 0n }, /non-positive/],
        [{ roundId: 2n, answeredInRound: 1n }, /earlier round/],
      ] as const) {
        await setRound(PRIMARY, overrides);
        await expect(readPrice(reader, PRIMARY, options)).rejects.toThrow(reason);
      }
      await setRound(PRIMARY, {}, 18);
      await expect(readPrice(reader, PRIMARY, options)).rejects.toThrow(/configured decimals/);
    });

    it('refuses sequencer outage and the exact 3600-second recovery boundary', async () => {
      await setRound(PRIMARY);
      for (const overrides of [{ answer: 1n, startedAt: NOW - 3601n }, { answer: 0n, startedAt: NOW - 3600n }]) {
        await setRound(SEQUENCER, overrides);
        await expect(readPrice(reader, PRIMARY, { ...options, sequencerFeed: SEQUENCER })).rejects.toThrow(/sequencer/);
      }
    });

    it('refuses reference divergence and a depegged USD price', async () => {
      await setRound(PRIMARY);
      await setRound(REFERENCE, { answer: 101_000_001n });
      await expect(readPrice(reader, PRIMARY, { ...options, reference: { reader, feed: REFERENCE, expectedDecimals: 8, maxAgeSeconds: 300n } })).rejects.toThrow(/price deviation/);
      await setRound(PRIMARY, { answer: 97_999_999n });
      await expect(readPrice(reader, PRIMARY, { ...options, enforceUsdPeg: true })).rejects.toThrow(/USD peg/);
    });
  });
});
