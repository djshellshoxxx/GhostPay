/**
 * Persistent set of outpoints already seen in accepted Originals (BIP-78
 * receiver checklist: "inputs ... have never been seen before"; BPJ-RCV-3).
 *
 * @security Production implementations MUST persist across restarts; an
 * in-memory store reopens the probing and re-entrancy windows after a restart.
 */
export interface SeenInputs {
  has(outpoint: string): Promise<boolean>;
  add(outpoints: readonly string[]): Promise<void>;
}

/** In-memory {@link SeenInputs}. Tests and single-process dev only. */
export class MemorySeenInputs implements SeenInputs {
  private readonly set = new Set<string>();

  public has(outpoint: string): Promise<boolean> {
    return Promise.resolve(this.set.has(outpoint));
  }

  public add(outpoints: readonly string[]): Promise<void> {
    for (const o of outpoints) this.set.add(o);
    return Promise.resolve();
  }
}

/**
 * Record of receiver UTXOs already exposed to some sender, so they are reused
 * first (BIP-78 UTXO-probing mitigation, partial; BPJ-RCV-10).
 */
export interface ExposedUtxos {
  list(): Promise<readonly string[]>;
  add(outpoint: string): Promise<void>;
}

/** In-memory {@link ExposedUtxos}. */
export class MemoryExposedUtxos implements ExposedUtxos {
  private readonly set = new Set<string>();

  public list(): Promise<readonly string[]> {
    return Promise.resolve([...this.set]);
  }

  public add(outpoint: string): Promise<void> {
    this.set.add(outpoint);
    return Promise.resolve();
  }
}
