/** The narrow jsQR surface used by GhostPay's software reader. */
declare function jsQR(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options?: { readonly inversionAttempts?: 'dontInvert' },
): { readonly data: string } | null;

export = jsQR;
