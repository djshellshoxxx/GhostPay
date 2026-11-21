import type { Address, Hex } from '@ghostpay/chain-adapters';
import vectors from '../../../../test-vectors/stealth-export.json' with { type: 'json' };
import type { ScanMatch } from './scanClient';
import { importSession, type SessionPublic } from './session';
import type { ExportRpc } from './paymentKeyExport';

/** TEST-ONLY: the public spec 18 reference vectors (scheme-1 test keys, fixed salts/IVs, N=2^14). */
export const VECTORS = vectors;
export const VECTOR_CHAIN = vectors.chainId;
export const VECTOR_PASS = vectors.passphrase;
export const VECTOR_TIME = vectors.exportedAt;
export const TEST_N = 1 << 14;

export type VectorId = 'a1' | 'a2' | 'a3' | 'a4';

/** Loads the vector seller (spending 0x11.., viewing 0x22..) with a fixed signing key, as if imported from hex. */
export function loadVectorSeller(signingKeyHex = '33'.repeat(32)): SessionPublic {
  return importSession({ spendingKeyHex: vectors.seller.spendingPrivateKey, viewingKeyHex: vectors.seller.viewingPrivateKey, signingKeyHex });
}

export function vectorAnnouncement(id: VectorId): (typeof vectors.announcements)[number] {
  const found = vectors.announcements.find((a) => a.id === id);
  if (found === undefined) throw new Error(`no vector ${id}`);
  return found;
}

/** A scan match for vector announcement `id`, as runScan would report it; `over` replaces announcement fields. */
export function vectorMatch(id: VectorId, over: Partial<ScanMatch['announcement']> = {}, chainId: number = VECTOR_CHAIN): ScanMatch {
  const a = vectorAnnouncement(id).announcement;
  const tx = (a as { transactionHash?: string }).transactionHash;
  const announcement: ScanMatch['announcement'] = {
    schemeId: BigInt(a.schemeId),
    stealthAddress: a.stealthAddress as Address,
    caller: '0x000000000000000000000000000000000000dEaD',
    ephemeralPublicKey: a.ephemeralPublicKey,
    metadata: a.metadata,
    blockHash: a.blockHash as Hex,
    blockNumber: BigInt(a.blockNumber),
    logIndex: a.logIndex,
    ...(tx === undefined ? {} : { transactionHash: tx as Hex }),
    id: `${a.blockHash}:${String(a.logIndex)}`,
    ...over,
  };
  return { chainId, announcement, stealthAddress: announcement.stealthAddress, metadata: undefined, viaRouter: true, tagMatches: vectorAnnouncement(id).expected.tagMatches, receipt: 'claimed' };
}

export interface CodeRpc extends ExportRpc {
  readonly calls: { readonly method: string; readonly params: readonly unknown[] }[];
}

/** An RPC that answers only `eth_getCode`, with `code(address)` or a thrown error; every call is recorded. */
export function codeRpc(chainId: number = VECTOR_CHAIN, code: (address: string) => unknown = () => '0x'): CodeRpc {
  const calls: { method: string; params: readonly unknown[] }[] = [];
  return {
    chainId,
    calls,
    request: (method, params) => {
      calls.push({ method, params });
      if (method !== 'eth_getCode') return Promise.reject(new Error(`unexpected ${method}`));
      try {
        return Promise.resolve(code(params[0] as string));
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error('rpc failure'));
      }
    },
  };
}

/** Captures what `downloadText` hands to the browser: the anchor's file name and the Blob's text. */
export function captureDownloads(): { readonly files: { readonly filename: string; readonly blob: Blob }[]; readonly restore: () => void } {
  const files: { filename: string; blob: Blob }[] = [];
  const blobs = new Map<string, Blob>();
  const urls = Object.getOwnPropertyDescriptors(URL);
  const anchor = Object.getOwnPropertyDescriptor(HTMLAnchorElement.prototype, 'click');
  let n = 0;
  URL.createObjectURL = (blob: Blob | MediaSource): string => { const url = `blob:test-${String(++n)}`; blobs.set(url, blob as Blob); return url; };
  URL.revokeObjectURL = (): void => undefined;
  HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement): void {
    const blob = blobs.get(this.href);
    if (blob !== undefined) files.push({ filename: this.download, blob });
  };
  return {
    files,
    restore: () => {
      for (const name of ['createObjectURL', 'revokeObjectURL'] as const) {
        const original = urls[name];
        if (original === undefined) Reflect.deleteProperty(URL, name);
        else Object.defineProperty(URL, name, original);
      }
      if (anchor === undefined) Reflect.deleteProperty(HTMLAnchorElement.prototype, 'click');
      else Object.defineProperty(HTMLAnchorElement.prototype, 'click', anchor);
    },
  };
}
