import { PayjoinError, fail, type PayjoinErrorCode } from '../errors.js';
import { assertNetwork } from '../network.js';
import type { PayjoinParams } from '../params.js';
import type {
  IncomingOriginal,
  OpenReceiverRequest,
  PayjoinTransport,
  ReceiverTransportSession,
  SenderTransportSession,
} from '../transport/types.js';
import { parsePayjoinUri, type PayjoinUri } from '../uri.js';

/**
 * BIP-77 (v2) transport adapter. OPTIONAL, Node-first, UNVERIFIED against a
 * live directory or relay (none was obtainable; see DEVIATIONS.md).
 *
 * @remarks This entry point (`@ghostpay/btc-payjoin/ffi`) is the only code
 * that may import the `payjoin` npm package (payjoin-ffi). The wire crypto
 * (HPKE secp256k1, OHTTP, BHTTP) stays in the library; this file only
 * (a) loads it lazily, (b) enforces BPJ-V2-3 (directory/relay allowlists, no
 * same operator by default) and (c) adapts a narrow {@link FfiBackend} to
 * {@link PayjoinTransport}. Every PSBT a backend returns is untrusted and is
 * re-verified by the TS policy core (BPJ-FFI-2): {@link FfiTransport} never
 * signs or finalizes anything.
 */

/** The exact `payjoin` package version this adapter was inspected against. */
export const PINNED_PAYJOIN_VERSION = '0.25.0';

/** Narrow capability set the adapter needs from a payjoin-ffi session driver. */
export interface FfiBackend {
  openReceiver(req: {
    readonly address: string;
    readonly amountSats?: bigint;
    readonly expirySeconds: number;
    readonly directoryUrl: string;
    readonly ohttpRelay: string;
    readonly outputSubstitution: boolean;
  }): Promise<{
    /** Full BIP-21 URI string including the v2 `pj=` mailbox. */
    readonly uri: string;
    /** One poll through the OHTTP relay; `null` while empty. */
    pollOriginal(): Promise<{ readonly originalPsbt: string; readonly params: PayjoinParams } | null>;
    reply(original: string, proposal: string | { readonly error: PayjoinErrorCode }): Promise<void>;
    close(): Promise<void>;
  }>;
  sendOriginal(req: {
    readonly uri: string;
    readonly originalPsbt: string;
    readonly params: PayjoinParams;
    readonly ohttpRelay: string;
  }): Promise<{ pollProposal(): Promise<{ readonly proposalPsbt: string } | { readonly error: PayjoinErrorCode } | null> }>;
}

/** Allowlists and operator-separation policy (BPJ-V2-3). */
export interface V2Policy {
  readonly directoryUrls: readonly string[];
  readonly ohttpRelayUrls: readonly string[];
  /** Permit relay and directory on one origin. Default false; the UI must warn (limit N4). */
  readonly allowSameOperator?: boolean;
  readonly now: () => number;
}

/**
 * Lazily loads and initializes the `payjoin` package.
 *
 * @param importer Injectable for tests; default is a dynamic `import('payjoin')`.
 * @returns The initialized `payjoin` namespace object.
 * @throws {PayjoinError} `transport_failed` with a clear hint when the module is absent (BPJ-FFI-1).
 */
export async function loadPayjoinFfi(
  importer: () => Promise<unknown> = () => import(/* @vite-ignore */ ['payjoin'].join('')),
): Promise<unknown> {
  let mod: { uniffiInitAsync?: () => Promise<void>; payjoin?: unknown };
  try {
    mod = (await importer()) as typeof mod;
  } catch {
    return fail('transport_failed', "optional dependency 'payjoin' is not installed");
  }
  if (typeof mod.uniffiInitAsync !== 'function' || mod.payjoin === undefined) {
    return fail('transport_failed', "'payjoin' module has an unexpected shape");
  }
  try {
    await mod.uniffiInitAsync();
  } catch {
    return fail('transport_failed', "'payjoin' failed to initialize");
  }
  return mod.payjoin;
}

function origin(u: string): string {
  try {
    return new URL(u).origin;
  } catch {
    return fail('uri_invalid');
  }
}

/** {@link PayjoinTransport} over an {@link FfiBackend}. */
export class FfiTransport implements PayjoinTransport {
  public readonly kind = 'v2-ohttp' as const;

  public constructor(
    private readonly backend: FfiBackend,
    private readonly policy: V2Policy,
  ) {}

  private pickRelay(directory: string, relays: readonly string[] | undefined): string {
    const allowed = new Set(this.policy.ohttpRelayUrls.map(origin));
    const candidates = (relays ?? this.policy.ohttpRelayUrls).filter((r) => allowed.has(origin(r)));
    const dirOrigin = origin(directory);
    const pick = candidates.find((r) => this.policy.allowSameOperator === true || origin(r) !== dirOrigin);
    if (pick === undefined) fail('transport_failed', 'no allowed relay separate from the directory');
    return pick;
  }

  public async openReceiverSession(r: OpenReceiverRequest): Promise<ReceiverTransportSession> {
    assertNetwork(r.network);
    const directory = r.directoryUrl ?? this.policy.directoryUrls[0];
    if (directory === undefined || !this.policy.directoryUrls.map(origin).includes(origin(directory))) {
      fail('transport_failed', 'directory not in allowlist');
    }
    const relay = this.pickRelay(directory, r.ohttpRelays);
    const s = await this.backend.openReceiver({
      address: r.address,
      ...(r.amountSats !== undefined ? { amountSats: r.amountSats } : {}),
      expirySeconds: r.expirySeconds,
      directoryUrl: directory,
      ohttpRelay: relay,
      outputSubstitution: r.outputSubstitution ?? true,
    });
    let uri: PayjoinUri;
    try {
      uri = parsePayjoinUri(s.uri, r.network, this.policy.now());
    } catch (e) {
      await s.close();
      throw e;
    }
    return {
      uri,
      async poll(): Promise<IncomingOriginal | null> {
        const got = await s.pollOriginal();
        if (got === null) return null;
        return {
          originalPsbt: got.originalPsbt,
          params: got.params,
          reply: (p) => s.reply(got.originalPsbt, p),
        };
      },
      close: () => s.close(),
    };
  }

  public async sendOriginal(uri: PayjoinUri, originalPsbt: string, params: PayjoinParams): Promise<SenderTransportSession> {
    assertNetwork(uri.network);
    if (!uri.pj.includes('#')) fail('uri_invalid', 'v2 transport needs a v2 pj url');
    // Re-validates scheme, fragment shape (EX/OH/RK) and expiry.
    parsePayjoinUri(`bitcoin:${uri.address}?pj=${encodeURIComponent(uri.pj)}`, uri.network, this.policy.now());
    const relay = this.pickRelay(uri.pj, undefined);
    const s = await this.backend.sendOriginal({ uri: uri.pj, originalPsbt, params, ohttpRelay: relay });
    return {
      async poll() {
        try {
          return await s.pollProposal();
        } catch (e) {
          return { error: e instanceof PayjoinError ? e.code : ('transport_failed' as const) };
        }
      },
    };
  }
}
