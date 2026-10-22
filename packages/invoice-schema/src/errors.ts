/**
 * Typed failure classes. Messages are fixed strings: they never include any part
 * of the (possibly secret, attacker-controlled) input. `path` is only ever a
 * schema-defined field path such as `fiat.minorUnits` or `lineItems[3].description`.
 */
export type InvoiceErrorCode =
  | 'FRAGMENT_FORMAT'
  | 'FRAGMENT_TOO_LARGE'
  | 'BASE64URL'
  | 'UTF8'
  | 'JSON'
  | 'SCHEMA'
  | 'NON_CANONICAL'
  | 'DECRYPT'
  | 'SIGNING'
  | 'RANDOMNESS'
  | 'UNSUPPORTED'
  | 'PASSPHRASE_REQUIRED'
  | 'PASSPHRASE_UNEXPECTED'
  | 'PASSPHRASE_POLICY'
  | 'PASSPHRASE';

/** Base class of every error thrown by this package. */
export class InvoiceError extends Error {
  public readonly code: InvoiceErrorCode;
  public readonly path: string | undefined;

  public constructor(code: InvoiceErrorCode, message: string, path?: string) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.path = path;
  }
}

/** Fragment does not start with `#gpi=v1.` or has trailing junk. */
export class FragmentFormatError extends InvoiceError {
  public constructor() {
    super('FRAGMENT_FORMAT', 'invalid invoice fragment format');
  }
}
/** Encoded or decoded size exceeds the 16 KiB limit. */
export class FragmentTooLargeError extends InvoiceError {
  public constructor() {
    super('FRAGMENT_TOO_LARGE', 'invoice fragment exceeds the size limit');
  }
}
/** Not strict, canonical, unpadded base64url. */
export class Base64UrlError extends InvoiceError {
  public constructor() {
    super('BASE64URL', 'invalid base64url encoding');
  }
}
/** Bytes are not well-formed UTF-8. */
export class Utf8Error extends InvoiceError {
  public constructor() {
    super('UTF8', 'invalid UTF-8');
  }
}
/** Syntax error, duplicate key, forbidden key, float/huge number, or nesting too deep. */
export class JsonParseError extends InvoiceError {
  public constructor() {
    super('JSON', 'invalid or unsupported JSON');
  }
}
/** Structure, type, range, length or text-hygiene violation. */
export class SchemaError extends InvoiceError {
  public constructor(path: string) {
    super('SCHEMA', 'invoice schema violation', path);
  }
}
/** Valid content that is not byte-for-byte the canonical serialization. */
export class NonCanonicalError extends InvoiceError {
  public constructor() {
    super('NON_CANONICAL', 'input is not canonically serialized');
  }
}
/** AES-GCM authentication failed (wrong key, tampering, or AAD mismatch). */
export class DecryptionError extends InvoiceError {
  public constructor() {
    super('DECRYPT', 'invoice decryption failed');
  }
}
/** Signing key problem, or refusal to encode an invalidly signed invoice. */
export class SigningError extends InvoiceError {
  public constructor() {
    super('SIGNING', 'invoice signing error');
  }
}
/** No secure random source, or it failed. */
export class RandomnessError extends InvoiceError {
  public constructor() {
    super('RANDOMNESS', 'no secure random source available');
  }
}
/** Unknown version or algorithm. */
export class UnsupportedError extends InvoiceError {
  public constructor() {
    super('UNSUPPORTED', 'unsupported invoice version or algorithm');
  }
}
/** The fragment is passphrase-protected (`A256GCM-PW`) and no passphrase was supplied. Prompt the user. */
export class PassphraseRequiredError extends InvoiceError {
  public constructor() {
    super('PASSPHRASE_REQUIRED', 'invoice passphrase required');
  }
}
/** A passphrase was supplied for a fragment that is not passphrase-protected (possible link substitution). */
export class PassphraseUnexpectedError extends InvoiceError {
  public constructor() {
    super('PASSPHRASE_UNEXPECTED', 'invoice link is not passphrase protected');
  }
}
/** Passphrase is not a well-formed string, is shorter than the minimum, or exceeds the byte cap. */
export class PassphrasePolicyError extends InvoiceError {
  public constructor() {
    super('PASSPHRASE_POLICY', 'invoice passphrase does not meet the policy');
  }
}
/**
 * Wrong passphrase OR tampered passphrase-protected envelope. Deliberately one error with one fixed
 * message: callers cannot tell which part failed (no oracle).
 */
export class WrongPassphraseError extends InvoiceError {
  public constructor() {
    super('PASSPHRASE', 'wrong passphrase or damaged invoice link');
  }
}
