import type { Invoice, NewInvoice, ParsedInvoice, ParseOptions, RandomSource, SignedInvoice } from '@ghostpay/invoice-schema';
import { buildInvoice, encodeInvoiceLink, parseInvoiceLink, signInvoiceWith, type LinkOptions } from './builder.js';
import { SdkInvoiceError } from './errors.js';
import { TypedEmitter, type SdkEventListener } from './events.js';
import { createMerchantApi, normalizeBaseUrl, type FetchLike, type MerchantApi } from './merchant.js';
import { verifyFragment, type FragmentVerification, type VerifyOptions } from './verify.js';

export interface ClientOptions {
  /** Merchant API base URL. Only needed for `client.merchant.*`; creating a client never touches the network. */
  readonly baseUrl?: string;
  /** Injected fetch. Defaults to `globalThis.fetch`, resolved lazily when a merchant call is made. */
  readonly fetch?: FetchLike;
  /** Bearer token for the merchant API. Sent only in the Authorization header. */
  readonly apiKey?: string;
  /** Millisecond clock (default `Date.now`). */
  readonly now?: () => number;
  /** Convenience for `client.on(listener)`. */
  readonly onEvent?: SdkEventListener;
}

export interface GhostPayClient {
  /** Subscribe to local observability events. Returns an unsubscribe function. */
  on(listener: SdkEventListener): () => void;
  readonly invoices: {
    build(input: NewInvoice, rng?: RandomSource): Invoice;
    sign(invoice: Invoice, signingKey: Uint8Array): SignedInvoice;
    toLink(signed: SignedInvoice, options?: LinkOptions): Promise<string>;
    parseLink(link: string, options?: ParseOptions): Promise<ParsedInvoice>;
    /** Parse + verify with the client's clock. Never throws on a bad link; see `parsed`. */
    verify(link: string, options?: Omit<VerifyOptions, 'nowSeconds'> & { readonly nowSeconds?: number }): Promise<FragmentVerification>;
  };
  readonly merchant: MerchantApi;
  /** Test hook: how many listener exceptions were swallowed. */
  readonly listenerErrors: () => number;
}

/**
 * Creates a GhostPay client.
 *
 * @remarks Creating the client performs NO network calls, reads no storage, and starts no
 * timers. Telemetry is local only: events go to listeners you register, nowhere else.
 *
 * @throws {SdkConfigError} If `baseUrl` is not https (or loopback http), or carries credentials/query/fragment.
 * @security Untrusted inputs (links, responses) are validated before use; errors are typed and never echo input.
 */
export function createClient(options: ClientOptions = {}): GhostPayClient {
  const emitter = new TypedEmitter();
  const nowMs = options.now ?? ((): number => Date.now());
  if (options.onEvent !== undefined) emitter.on(options.onEvent);
  const baseUrl = options.baseUrl === undefined ? undefined : normalizeBaseUrl(options.baseUrl);

  const guarded = async <T>(fn: () => Promise<T> | T): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof SdkInvoiceError) emitter.emit({ type: 'invoice.rejected', at: nowMs(), invoiceCode: e.invoiceCode });
      throw e;
    }
  };

  return {
    on: (l) => emitter.on(l),
    listenerErrors: () => emitter.listenerErrors,
    invoices: {
      build: (input, rng) => {
        try {
          const inv = buildInvoice(input, rng);
          emitter.emit({ type: 'invoice.built', at: nowMs(), chainId: inv.chainId, lineItems: inv.lineItems.length });
          return inv;
        } catch (e) {
          if (e instanceof SdkInvoiceError) emitter.emit({ type: 'invoice.rejected', at: nowMs(), invoiceCode: e.invoiceCode });
          throw e;
        }
      },
      sign: (invoice, key) => {
        const s = signInvoiceWith(invoice, key);
        emitter.emit({ type: 'invoice.signed', at: nowMs() });
        return s;
      },
      toLink: (signed, o) =>
        guarded(async () => {
          const link = await encodeInvoiceLink(signed, o);
          emitter.emit({ type: 'invoice.linked', at: nowMs(), encrypted: o?.encrypt === true, length: link.length });
          return link;
        }),
      parseLink: (link, o) => guarded(() => parseInvoiceLink(link, o)),
      verify: async (link, o) => {
        const at = typeof link === 'string' ? link.indexOf('#') : -1;
        const result = await verifyFragment(at === -1 ? '' : link.slice(at), {
          ...o,
          nowSeconds: o?.nowSeconds ?? Math.floor(nowMs() / 1000),
        });
        if (result.parsed)
          emitter.emit({ type: 'invoice.verified', at: nowMs(), ok: result.verdict.ok, trust: result.verdict.trust, blockers: result.verdict.blockers });
        else emitter.emit({ type: 'invoice.rejected', at: nowMs(), invoiceCode: result.invoiceCode });
        return result;
      },
    },
    merchant: createMerchantApi({ baseUrl, fetch: options.fetch, apiKey: options.apiKey, nowMs, emitter }),
  };
}
