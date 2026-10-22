/** Thrown on malformed money, rates or dates. Message never echoes untrusted input. */
export class LedgerError extends Error {
  public constructor(public readonly code: string) {
    super(`ledger error: ${code}`);
    this.name = 'LedgerError';
  }
}
