import {
  D1, S1, makeRequest, makeSeed, parseManifest, stubTransport, type AssetId, type ExitTransport, type PoolManifest, type PoolNote, type RouteRequest,
} from '@ghostpay/external-pools';
import { keccak256 } from 'viem';
import { PrivacyPoolsAdapter, decodeNoteData, type PrivacyPoolsDeps } from './adapter.js';
import { ENTRYPOINT, ENTRY_CODE, POOL, POOL_CODE, PoolEnv, TOKEN, TOKEN_POOL, TOKEN_POOL_CODE, relayerHandler, type RelayerOpts } from './fakes.testutil.js';

export const RELAYER = 'http://127.0.0.1:3000';
export const DIGESTS = {
  'commitment.wasm': 'a'.repeat(64),
  'commitment.zkey': 'b'.repeat(64),
  'commitment.vkey': 'c'.repeat(64),
  'withdraw.wasm': 'd'.repeat(64),
  'withdraw.zkey': 'e'.repeat(64),
  'withdraw.vkey': 'f'.repeat(64),
};

export function manifestFor(over: Record<string, unknown> = {}): PoolManifest {
  return parseManifest({
    schema: 1,
    retrieved: '2026-10-21',
    entries: [
      {
        route: 'privacy-pools',
        chainId: 31337,
        status: 'verified',
        contracts: { entrypoint: ENTRYPOINT, 'pool:native': POOL, [`pool:${TOKEN.toLowerCase()}`]: TOKEN_POOL },
        codeHashes: { entrypoint: keccak256(ENTRY_CODE), 'pool:native': keccak256(POOL_CODE), [`pool:${TOKEN.toLowerCase()}`]: keccak256(TOKEN_POOL_CODE) },
        artifactSha256: DIGESTS,
        relayers: [RELAYER],
        deploymentBlock: 0,
        sources: ['test'],
        ...over,
      },
    ],
  });
}

export interface Rig {
  env: PoolEnv;
  adapter: PrivacyPoolsAdapter;
  req: RouteRequest;
  transport: ExitTransport;
  calls: ReturnType<typeof stubTransport>['calls'];
  clock: { now: number };
  setRelayer(o: RelayerOpts): void;
  enter(over?: Partial<RouteRequest>, confirmations?: number): Promise<PoolNote>;
}

export function rig(opts: { manifest?: PoolManifest; deps?: Partial<PrivacyPoolsDeps>; relayer?: RelayerOpts } = {}): Rig {
  const env = new PoolEnv();
  env.crypto.digests = { ...DIGESTS };
  env.fund(S1, 10n ** 12n);
  const clock = { now: 1_700_000_000_000 };
  let ro = opts.relayer ?? {};
  const st = stubTransport((c) => relayerHandler(env, () => clock.now, ro)(c), clock);
  const adapter = new PrivacyPoolsAdapter({
    manifest: opts.manifest ?? manifestFor(),
    chain: env.reader(),
    transport: st.transport,
    crypto: env.crypto,
    asp: env,
    clock: () => clock.now,
    ...opts.deps,
  });
  const req = makeRequest({ amount: 1_000_000n, rootSeed: makeSeed(3), destination: D1 });
  const r: Rig = {
    env, adapter, req, transport: st.transport, calls: st.calls, clock,
    setRelayer: (o) => { ro = o; },
    async enter(over = {}, confirmations = 5) {
      const rq = { ...req, ...over };
      const q = await adapter.quoteEntry(rq);
      const txs = await adapter.prepareEntry(rq, q);
      let receipt;
      for (const tx of txs) receipt = env.execute(tx, confirmations);
      if (receipt === undefined) throw new Error('no tx');
      const note = await adapter.recordEntry(rq, q, receipt);
      if (note.state === 'confirmed') env.aspLeaves.push(decodeNoteData(note.adapterData).label);
      return note;
    },
  };
  return r;
}

export const TOKEN_ASSET: AssetId = TOKEN;
