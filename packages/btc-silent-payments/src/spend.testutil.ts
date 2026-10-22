/** P2TR scriptPubKey `OP_1 <32-byte key>`. */
export function toBytesLike(xOnlyKey: Uint8Array): Uint8Array {
  return Uint8Array.of(0x51, 0x20, ...xOnlyKey);
}
