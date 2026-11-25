import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ScanSourceError, createIndexerSource, type HeadSource, type IndexerSourceOptions } from '@ghostpay/scan-source';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decodeAnnouncementLog } from './abi.js';
import { encodeAnnounceCall, fetchTransport, get, hx, serve } from './fake.testutil.js';
import { Indexer } from './ingest.js';
import { JsonRpcChainReader } from './rpc.js';
import { LogStore } from './store.js';
import type { Hex } from './wire.js';

// Contract tests on a disposable local anvil: the compiled ERC5564Announcer (packages/contracts/out, `forge build`),
// real JSON-RPC ingestion, the service over loopback HTTP and the unmodified scan-source `createIndexerSource` client
// with anvil as its independent second source. Skips without anvil or artifacts unless REQUIRE_ANVIL=1 (CI), which
// turns a missing toolchain into a failure. A skip is not a pass. All data is synthetic; chain id 31337 only.
const ANVIL = process.env['ANVIL_BIN'] ?? (existsSync('/root/.foundry/bin/anvil') ? '/root/.foundry/bin/anvil' : 'anvil');
const ARTIFACT = resolve(import.meta.dirname, '../../contracts/out/ERC5564Announcer.sol/ERC5564Announcer.json');
const onPath = (bin: string): boolean => (bin.includes('/') ? existsSync(bin) : (process.env['PATH'] ?? '').split(':').some((d) => existsSync(`${d}/${bin}`)));
const available = onPath(ANVIL) && existsSync(ARTIFACT);
const FROM = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266'; // anvil default account 0 (unlocked, test-only)

function startAnvil(): Promise<{ proc: ChildProcess; url: string }> {
  return new Promise((ok, fail) => {
    const proc = spawn(ANVIL, ['--port', '0', '--host', '127.0.0.1', '--chain-id', '31337'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      fail(new Error('anvil did not start'));
    }, 20_000);
    const onData = (c: Buffer): void => {
      out = (out + c.toString()).slice(-65_536);
      const m = /Listening on (127\.0\.0\.1:[0-9]+)/.exec(out);
      if (m?.[1] !== undefined) {
        clearTimeout(timer);
        ok({ proc, url: `http://${m[1]}` });
      }
    };
    proc.stdout?.on('data', onData);
    proc.stderr?.on('data', onData);
    proc.once('error', (e) => {
      clearTimeout(timer);
      fail(e);
    });
  });
}

describe('contract on anvil: createIndexerSource against the light-indexer service', () => {
  it('has anvil and the announcer artifact when REQUIRE_ANVIL=1', () => {
    if (process.env['REQUIRE_ANVIL'] === '1') expect(available, 'REQUIRE_ANVIL=1 needs ANVIL_BIN and packages/contracts/out (forge build)').toBe(true);
  });

  describe.skipIf(!available)('live anvil', () => {
    let anvil: { proc: ChildProcess; url: string };
    let announcer: Hex;
    let selector: string;
    let store: LogStore;
    let ix: Indexer;
    let svc: Awaited<ReturnType<typeof serve>>;
    let reader: JsonRpcChainReader;
    let id = 0;

    const rpc = async (method: string, params: unknown[] = []): Promise<unknown> => {
      const res = await fetch(anvil.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) });
      const j = (await res.json()) as { result?: unknown; error?: { message: string } };
      if (j.error) throw new Error(j.error.message);
      return j.result;
    };
    const receipt = async (tx: unknown): Promise<{ blockNumber: string; contractAddress: string | null; status: string }> => {
      for (let i = 0; i < 200; i++) {
        const r = (await rpc('eth_getTransactionReceipt', [tx])) as { blockNumber: string; contractAddress: string | null; status: string } | null;
        if (r !== null) {
          if (r.status !== '0x1') throw new Error('transaction reverted');
          return r;
        }
        await new Promise((ok) => setTimeout(ok, 10));
      }
      throw new Error('transaction not mined');
    };
    const sendAnnounce = (stealth: Hex, pk: Hex, meta: Hex): Promise<unknown> =>
      rpc('eth_sendTransaction', [{ from: FROM, to: announcer, data: encodeAnnounceCall(selector, 1n, stealth, pk, meta), gas: '0x2dc6c0' }]);
    /** Calls ERC5564Announcer.announce; with automine on, one block per call. */
    const announce = async (stealth: Hex, pk: Hex, meta: Hex): Promise<bigint> => BigInt((await receipt(await sendAnnounce(stealth, pk, meta))).blockNumber);
    const sync = async (): Promise<string[]> => {
      const kinds: string[] = [];
      for (;;) {
        const k = (await ix.syncOnce()).kind;
        kinds.push(k);
        if (k === 'idle') return kinds;
        if (k === 'halted') throw new Error('halted');
      }
    };
    const head = (): HeadSource => ({
      head: async () => {
        const n = await reader.blockNumber();
        const h = await reader.header(n);
        return { number: n, hash: (h as { hash: Hex }).hash };
      },
      blockHash: async (n) => (await reader.header(n))?.hash ?? Promise.reject(new Error('no block')),
    });
    const client = (extra: Partial<IndexerSourceOptions> = {}, rewrite?: (b: Record<string, unknown>) => void) =>
      createIndexerSource({ chainId: 31337, baseUrl: svc.url, transport: fetchTransport([], rewrite), secondSource: head(), ...extra });
    const code = async (p: Promise<unknown>): Promise<string> => {
      try {
        await p;
        return 'ok';
      } catch (e) {
        return e instanceof ScanSourceError ? e.code : `other:${String(e)}`;
      }
    };
    /** Canonical announcer logs straight from anvil, decoded independently of the service. */
    const canonical = async (to: bigint): Promise<string[]> => {
      const logs = await reader.announcerLogs(0n, to, announcer);
      return logs.filter((l) => decodeAnnouncementLog(l) !== undefined).map((l) => `${l.blockHash}:${String(l.logIndex)}`);
    };
    const REQ = (to: bigint) => ({ chainId: 31337, fromBlock: 0n, toBlock: to });

    beforeAll(async () => {
      anvil = await startAnvil();
      const art = JSON.parse(readFileSync(ARTIFACT, 'utf8')) as { bytecode: { object: Hex }; methodIdentifiers: Record<string, string> };
      selector = art.methodIdentifiers['announce(uint256,address,bytes,bytes)'] as string;
      const deployed = await receipt(await rpc('eth_sendTransaction', [{ from: FROM, data: art.bytecode.object, gas: '0x2dc6c0' }]));
      announcer = (deployed.contractAddress as string).toLowerCase() as Hex;
      reader = new JsonRpcChainReader({ url: anvil.url });
      store = LogStore.open(':memory:', { chainId: 31337, announcer, indexedFrom: 0n });
      ix = new Indexer({ store, reader, chainId: 31337, announcer, batchBlocks: 7 });
      await ix.verifyChain();
      svc = await serve({ store, chainId: 31337, announcer });
      for (let i = 0; i < 6; i++) await announce(hx(0x10 + i, 20), `0x02${hx(0x20 + i, 32).slice(2)}`, hx(0x30 + i, 1 + i));
      await rpc('evm_mine');
      await announce(hx(0x40, 20), `0x03${hx(0x41, 32).slice(2)}`, hx(0x42, 5000)); // over the v1 metadata limit: omitted
      // two announcements in one block
      await rpc('evm_setAutomine', [false]);
      const a = await sendAnnounce(hx(0x50, 20), `0x02${hx(0x51, 32).slice(2)}`, '0xab');
      const b = await sendAnnounce(hx(0x52, 20), `0x02${hx(0x53, 32).slice(2)}`, '0xcd');
      await rpc('evm_mine');
      await rpc('evm_setAutomine', [true]);
      await receipt(a);
      await receipt(b);
    });
    afterAll(async () => {
      await svc?.close();
      store?.close();
      anvil?.proc.kill('SIGKILL');
    });

    it('serves exactly the canonical announcer logs; the reference client accepts them with hash cross-checks', async () => {
      await sync();
      const tip = await reader.blockNumber();
      const r = await client().fetch(REQ(tip));
      expect(r.coverage).toEqual({ fromBlock: 0n, toBlock: tip });
      expect(r.announcements.map((x) => x.id)).toEqual(await canonical(tip));
      expect(r.announcements).toHaveLength(8);
      expect(new Set(r.announcements.map((x) => x.blockNumber)).size).toBe(7); // two share a block
      expect(r.announcements[0]).toMatchObject({ schemeId: 1n, stealthAddress: hx(0x10, 20), caller: FROM, ephemeralPublicKey: `0x02${hx(0x20, 32).slice(2)}`, metadata: hx(0x30, 1) });
      const page = await get(`${svc.url}/v1/logs?chainId=31337&from=0&to=999`);
      expect(page.json['omitted']).toBe(1);
    });

    it('reorg fixture: same-height fork is rejected while stale, then rolled back to the common ancestor', async () => {
      await sync();
      const snap = await rpc('evm_snapshot');
      const ancestor = await reader.blockNumber();
      for (let i = 0; i < 3; i++) await announce(hx(0x60 + i, 20), `0x02${hx(0x61, 32).slice(2)}`, '0x01');
      await sync();
      const oldTip = await reader.blockNumber();
      const oldIds = (await client().fetch(REQ(oldTip))).announcements.map((x) => x.id);
      expect(oldIds).toHaveLength(11);

      await rpc('evm_revert', [snap]);
      await rpc('evm_mine'); // shift timestamps so the fork differs even in empty fields
      for (let i = 0; i < 2; i++) await announce(hx(0x70 + i, 20), `0x03${hx(0x71, 32).slice(2)}`, '0x02');
      expect(await reader.blockNumber()).toBe(oldTip); // same height, different blocks
      expect(await code(client().fetch(REQ(oldTip)))).toBe('HEAD_MISMATCH');

      expect(await ix.syncOnce()).toEqual({ kind: 'rolledBack', ancestor });
      await sync();
      const r = await client().fetch(REQ(oldTip));
      expect(r.announcements.map((x) => x.id)).toEqual(await canonical(oldTip));
      expect(r.announcements).toHaveLength(10);
      expect(r.announcements.some((x) => oldIds.slice(8).includes(x.id))).toBe(false);
      expect(r.announcements.slice(-2).map((x) => x.stealthAddress)).toEqual([hx(0x70, 20), hx(0x71, 20)]);
    });

    it('header gap, malformed request and oversized window fail closed', async () => {
      await sync();
      const tip = await reader.blockNumber();
      const dropOne = (b: Record<string, unknown>): void => {
        b['headers'] = (b['headers'] as { number: string }[]).filter((h) => h.number !== '3');
      };
      expect(await code(client({}, dropOne).fetch(REQ(tip)))).toBe('CONTINUITY');
      const bad = await get(`${svc.url}/v1/logs?chainId=31337&from=0&to=999&stealthAddress=${hx(0x10, 20)}`);
      expect([bad.status, (bad.json['error'] as { code: string }).code]).toEqual([400, 'UNKNOWN_PARAMETER']);
      expect(await code(client({ windowBlocks: 3000 }).fetch(REQ(tip)))).toBe('TRANSPORT');
    });
  });
});
