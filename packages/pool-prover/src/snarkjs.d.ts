declare module 'snarkjs' {
  export const groth16: {
    fullProve(
      input: Record<string, unknown>,
      wasm: { type: 'mem'; data: Uint8Array } | string,
      zkey: { type: 'mem'; data: Uint8Array } | string,
    ): Promise<{ proof: unknown; publicSignals: string[] }>;
    verify(vkey: unknown, publicSignals: readonly string[], proof: unknown): Promise<boolean>;
  };
}
