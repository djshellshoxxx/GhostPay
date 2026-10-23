import { decodeMetaAddress, encodeMetaAddress } from '@ghostpay/core-crypto';
import { parseStrictJson } from '@ghostpay/invoice-schema';
import { UserFacingError } from './errors';

/** Only public scheme-1 keys. This parser never performs a registry action or accepts arbitrary URLs. */
export function parsePublicMetaQr(text: string): string {
  const bad = (): never => { throw new UserFacingError('This QR does not contain a supported public meta-address.'); };
  if (text.length > 1024 || new TextEncoder().encode(text).byteLength > 1024) return bad();
  let candidate: unknown = text.trim();
  try {
    if ((candidate as string).startsWith('{')) {
      const value = parseStrictJson(candidate as string);
      if (typeof value !== 'object' || value === null || Array.isArray(value) || Object.keys(value).sort().join('|') !== 'format|metaAddress|v') return bad();
      const object = value as Record<string, unknown>;
      if (object['format'] !== 'ghostpay-public-meta' || object['v'] !== 1) return bad();
      candidate = object['metaAddress'];
    }
    if (typeof candidate !== 'string' || candidate.length !== 141) return bad();
    return encodeMetaAddress(decodeMetaAddress(candidate));
  } catch { return bad(); }
}
