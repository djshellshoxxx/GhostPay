import { InvoiceError } from '@ghostpay/invoice-schema';

export type SdkErrorCode = 'CONFIG' | 'INPUT' | 'INVOICE' | 'HTTP' | 'NETWORK' | 'RESPONSE' | 'ABORTED';

/**
 * Base class of every error thrown by the SDK. Messages are fixed strings: they never
 * include request bodies, response bodies, API keys, fragments or other caller input.
 */
export class SdkError extends Error {
  public readonly code: SdkErrorCode;

  public constructor(code: SdkErrorCode, message: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
  }
}

/** Client construction or call needs configuration that is missing or unsafe. */
export class SdkConfigError extends SdkError {
  public constructor(message: string) {
    super('CONFIG', message);
  }
}

/** A caller-supplied argument failed local validation (before any network use). */
export class SdkInputError extends SdkError {
  public readonly field: string;

  public constructor(field: string) {
    super('INPUT', 'invalid argument');
    this.field = field;
  }
}

/** An `@ghostpay/invoice-schema` failure, wrapped with its original code and schema path. */
export class SdkInvoiceError extends SdkError {
  public readonly invoiceCode: string;
  public readonly path: string | undefined;

  public constructor(cause: InvoiceError) {
    super('INVOICE', 'invoice operation failed');
    this.invoiceCode = cause.code;
    this.path = cause.path;
  }
}

/** Merchant API answered with a non-2xx status. The body is intentionally not retained. */
export class SdkHttpError extends SdkError {
  public readonly status: number;

  public constructor(status: number) {
    super('HTTP', 'merchant API returned an error status');
    this.status = status;
  }
}

/** The injected fetch rejected (offline, DNS, TLS, ...). */
export class SdkNetworkError extends SdkError {
  public constructor() {
    super('NETWORK', 'network request failed');
  }
}

/** The response was not the documented shape, was too large, or was not strict JSON. */
export class SdkResponseError extends SdkError {
  public constructor() {
    super('RESPONSE', 'unexpected merchant API response');
  }
}

/** The caller's AbortSignal fired. */
export class SdkAbortedError extends SdkError {
  public constructor() {
    super('ABORTED', 'request aborted');
  }
}

/** Runs `fn`, converting invoice-schema failures to {@link SdkInvoiceError}. */
export function wrapInvoice<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof InvoiceError) throw new SdkInvoiceError(e);
    throw e;
  }
}

/** Async variant of {@link wrapInvoice}. */
export async function wrapInvoiceAsync<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof InvoiceError) throw new SdkInvoiceError(e);
    throw e;
  }
}
