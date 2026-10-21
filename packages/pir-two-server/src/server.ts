import { PirError, requireArg } from './errors.js';
import { assertTestnetChainId } from './guard.js';
import { leafHash, manifestLeaves, type Manifest } from './manifest.js';
import { pirAnswer, queryBytes } from './xor.js';

/**
 * One PIR server replica: holds the page database and answers XOR queries.
 *
 * @security Learns only a uniformly random subset per query. It cannot tell which page the client wants
 * unless the OTHER server's query is shown to it (collusion): the operator of server A must not be, or
 * share logs with, the operator of server B. Do NOT log query bytes or client addresses.
 */
export class PirServer {
  private readonly pages: readonly Uint8Array[];
  /** Manifest served to clients. */
  public readonly manifest: Manifest;

  /**
   * @param pages Page database (equal-size pages).
   * @param manifest Manifest from `packPages`; verified here against the pages (leaf hashes, sizes, testnet).
   * @throws PirError `TESTNET_ONLY`, `INVALID_ARGUMENT`, `MANIFEST_MISMATCH`.
   */
  public constructor(pages: readonly Uint8Array[], manifest: Manifest) {
    assertTestnetChainId(manifest.chainId);
    requireArg(pages.length === manifest.nPages && pages.length >= 1, 'page count mismatch');
    const leaves = manifestLeaves(manifest);
    pages.forEach((p, i) => {
      if (p.length !== manifest.pageBytes) throw new PirError('INVALID_ARGUMENT', 'page size mismatch');
      const want = leaves[i] as Uint8Array;
      const got = leafHash(p);
      if (want.length !== got.length || !want.every((b, k) => b === got[k])) {
        throw new PirError('MANIFEST_MISMATCH', 'page does not match manifest');
      }
    });
    this.pages = pages.map((p) => new Uint8Array(p));
    this.manifest = manifest;
  }

  /** Number of pages. */
  public get nPages(): number {
    return this.pages.length;
  }

  /** Expected query length in bytes. */
  public get queryLength(): number {
    return queryBytes(this.pages.length);
  }

  /**
   * XOR of the selected pages; always `pageBytes` long.
   *
   * @throws PirError `INVALID_ARGUMENT` for a malformed query.
   */
  public answer(query: Uint8Array): Uint8Array {
    return pirAnswer(this.pages, query);
  }
}
