/**
 * TEST-ONLY harness: runs the real scanner (`runScan`) against a `SyntheticChain` through the real `createClient`,
 * `createWindowedScanClient` and an instrumented transport, and returns the sanitized disclosure records.
 */
import {
  ANNOUNCEMENT_TOPIC,
  CHAINS,
  createClient,
  RpcHttpError,
  type RpcClient,
  type ScanCursor,
} from '@ghostpay/chain-adapters';
import { encodeMetaAddress, generateKeySet, unsafeRevealSecret } from '@ghostpay/core-crypto';
import { makeLog, TOKEN_84532, type MadeLog } from './announcements';
import { SyntheticChain, TRANSFER_TOPIC } from './disclosureChain';
import { DisclosureRecorder, handlerTransport, instrumentRpcTransport, type DisclosureContext } from './rpcDisclosure';
import { FAKE_ANNOUNCER, FAKE_ROUTER, fakeManifest } from './fakeManifest';
import { InlineWorker } from './inlineWorker';
import { checkpointKeyId, runScan, type CheckpointStore, type ScanMatch, type ScanProgress } from '../lib/scanClient';
import { createWindowedScanClient } from '../lib/scanPrivacy';

export const CHAIN = CHAINS.find((c) => c.chainId === 84532)!;
export const MANIFEST = fakeManifest(84532);
export const KEY_ID = checkpointKeyId('02aa', '03bb');
export const GRID = 1000;
const hexOf = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

/** A synthetic seller plus helpers to build announcements for the seller and for strangers. */
export interface Seller {
  readonly keys: ReturnType<typeof generateKeySet>;
  readonly meta: string;
}
export function newSeller(): Seller {
  const keys = generateKeySet();
  return { keys, meta: encodeMetaAddress(keys) };
}

export interface LogSpec {
  readonly block: number;
  readonly index: number;
  readonly caller?: `0x${string}`;
  readonly wrongTag?: boolean;
  /** ERC-20 named in the router metadata (default: the supported test token). */
  readonly token?: `0x${string}`;
}

export function sellerLog(s: Seller, spec: LogSpec): MadeLog {
  return makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: s.meta, block: spec.block, index: spec.index, caller: spec.caller ?? FAKE_ROUTER, ...(spec.wrongTag === true ? { wrongTag: true } : {}) });
}
export function strangerLog(spec: LogSpec): MadeLog {
  return makeLog({ announcer: FAKE_ANNOUNCER, metaAddress: newSeller().meta, block: spec.block, index: spec.index, caller: spec.caller ?? FAKE_ROUTER, ...(spec.token === undefined ? {} : { token: spec.token }) });
}

export interface ScenarioInput {
  readonly id: string;
  readonly seller: Seller;
  readonly chain: SyntheticChain;
  readonly secondary?: SyntheticChain;
  /** Logs whose payment is genuinely the seller's: ground truth for classification only (the observer does not know it). */
  readonly matched?: readonly MadeLog[];
  /** Logs addressed to the seller that should be rejected (still sensitive for classification). */
  readonly rejected?: readonly MadeLog[];
  readonly cursor?: ScanCursor;
  readonly checkpoints?: CheckpointStore;
  readonly windowBlocks?: number;
  readonly maxPages?: number;
  readonly signal?: AbortSignal;
  /** Recorder to continue (resume scenarios keep one recorder per scenario id). */
  readonly recorder?: DisclosureRecorder;
  /** Cover lookups for matched router payments (`runScan`'s `matchCover`); absent: off. */
  readonly matchCover?: boolean;
}

export interface ScenarioOutput {
  readonly rec: DisclosureRecorder;
  readonly matches: readonly ScanMatch[];
  readonly progress: readonly ScanProgress[];
  readonly cursor: ScanCursor | undefined;
  readonly error: unknown;
  readonly discrepancies: number;
  readonly clients: { readonly primary: RpcClient };
}

export function contextFor(i: Pick<ScenarioInput, 'matched' | 'rejected'>): DisclosureContext {
  const mine = [...(i.matched ?? []), ...(i.rejected ?? [])].map((m) => m.stealthAddress);
  return {
    publicContracts: [FAKE_ANNOUNCER, FAKE_ROUTER],
    tokenContracts: [TOKEN_84532],
    sensitiveAddresses: mine,
    eventTopics: [ANNOUNCEMENT_TOPIC, TRANSFER_TOPIC],
    gridBlocks: GRID,
  };
}

const noSleep = (): Promise<void> => Promise.resolve();

async function open(c: SyntheticChain, rec: DisclosureRecorder, role: string): Promise<RpcClient> {
  const wire = handlerTransport(c.handler, (f) => (f.kind === 'http' ? new RpcHttpError(f.status) : new Error('network')));
  return createClient(CHAIN, `https://${role}.invalid/`, {
    transport: instrumentRpcTransport(wire, rec, role),
    sleep: noSleep,
    baseDelayMs: 0,
    random: () => 0,
    chainRecheckMs: 0,
  });
}

export async function runDisclosureScenario(i: ScenarioInput): Promise<ScenarioOutput> {
  let tick = 0;
  const rec = i.recorder ?? new DisclosureRecorder(i.id, contextFor(i), () => (tick += 1));
  rec.state.headBlock = BigInt(i.chain.head);
  rec.state.markMatched({
    addresses: (i.matched ?? []).map((m) => m.stealthAddress),
    transactionHashes: (i.matched ?? []).flatMap((m) => (m.log.transactionHash === undefined ? [] : [m.log.transactionHash])),
  });
  const policy = { windowBlocks: i.windowBlocks ?? GRID, jitterMs: [0, 0] as const };
  const win = (c: RpcClient): RpcClient => createWindowedScanClient(c, { chain: CHAIN, announcer: FAKE_ANNOUNCER, router: FAKE_ROUTER, policy, sleep: noSleep });
  const primary = await open(i.chain, rec, 'primary');
  const secondary = i.secondary === undefined ? undefined : await open(i.secondary, rec, 'secondary');
  const progress: ScanProgress[] = [];
  const matches: ScanMatch[] = [];
  let error: unknown;
  let result: Awaited<ReturnType<typeof runScan>> | undefined;
  try {
    result = await runScan({
      chain: CHAIN,
      manifest: MANIFEST,
      client: win(primary),
      cursor: i.cursor ?? { nextBlock: 0n },
      spendingPublicKeyHex: hexOf(i.seller.keys.spendingPublicKey),
      keyId: KEY_ID,
      viewingKey: unsafeRevealSecret(i.seller.keys.viewingSecret),
      createWorker: () => new InlineWorker(),
      signal: i.signal ?? new AbortController().signal,
      ...(i.checkpoints === undefined ? {} : { checkpoints: i.checkpoints }),
      ...(i.maxPages === undefined ? {} : { maxPages: i.maxPages }),
      ...(i.matchCover === undefined ? {} : { matchCover: i.matchCover }),
      ...(secondary === undefined ? {} : { secondaryClient: win(secondary) }),
      onProgress: (p) => progress.push(p),
      onMatch: (m) => matches.push(m),
    });
  } catch (e) {
    error = e;
  } finally {
    // records are kept; the comparison sets (matched addresses, hashes, seen values) are dropped
    rec.dispose();
  }
  return { rec, matches: result?.matches ?? matches, progress, cursor: result?.cursor, error, discrepancies: result?.discrepancies.length ?? 0, clients: { primary } };
}

/** In-memory checkpoint store with an operation log (what the scanner asked to persist). */
export function memoryCheckpoints(): CheckpointStore & { readonly saved: ScanCursor[]; clears: number } {
  const state: { cursor: ScanCursor | undefined } = { cursor: undefined };
  const saved: ScanCursor[] = [];
  const store = {
    saved,
    clears: 0,
    load: () => state.cursor,
    save: (_c: number, _k: string, cursor: ScanCursor) => {
      state.cursor = cursor;
      saved.push(cursor);
    },
    clear: () => {
      state.cursor = undefined;
      store.clears += 1;
    },
  };
  return store;
}
